#!/usr/bin/env node
/**
 * Simple Protocol Buffer Generator (enhanced: dynamic imports, zero-copy, TRUE streaming to renderer)
 *
 * Generates:
 * 1) Protobuf stubs (TS + Python) for ALL .proto files
 * 2) Typed renderer client:
 *      - Unary methods -> Promise<T>
 *      - Server-streaming methods -> AsyncIterable<T> (true streaming)
 * 3) Main-process gRPC client
 * 4) IPC handlers:
 *      - Unary: zero-copy via postMessage + transfer list (for large/binary responses)
 *      - Streaming: per-chunk delivery + cancellation
 * 5) Context bridge + types
 * 6) Byte-alignment helper (auto) + optional Float32Array view
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import process from 'process';

const PROTO_DIR = 'protos';
const MAIN_PROTO_FILE = 'protos/main_service.proto';
const FRONTEND_OUT_DIR = 'src/generated';
const BACKEND_OUT_DIR = 'backend/generated';
const AUTO_GEN_DIR = 'src/grpc-auto';

function log(message) { console.log(`🔨 ${message}`); }
function error(message) { console.error(`❌ ${message}`); }
function success(message) { console.log(`✅ ${message}`); }

function runCommand(command, description) {
  try {
    log(description);
    execSync(command, { stdio: 'inherit' });
    return true;
  } catch (err) {
    error(`Failed: ${description}`);
    console.error(err.message);
    return false;
  }
}

function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`Created directory: ${dir}`);
  }
}

/** Parse all .proto files; return services, messages, type->fileBase map, and file list */
function parseAllProtoFiles() {
  try {
    const protoFiles = fs.readdirSync(PROTO_DIR)
      .filter(f => f.endsWith('.proto'))
      .map(f => path.join(PROTO_DIR, f));

    const services = [];
    const messages = [];
    const typeToFileBase = new Map(); // MessageName -> file base (no .proto)

    for (const fullPath of protoFiles) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const fileBase = path.basename(fullPath, '.proto');
      log(`Loaded ${fileBase}.proto`);

      const pkgMatch = content.match(/^\\s*package\\s+([^\\s;]+)\\s*;/m);
      const pkg = pkgMatch ? pkgMatch[1] : '';

      // Services in this file
      const serviceRegex = /service\s+(\w+)\s*\{([\s\S]*?)\}\s*/gs;
      let sm;
      while ((sm = serviceRegex.exec(content)) !== null) {
        const serviceName = sm[1];
        const body = sm[2];
        const methods = [];
        const methodRegex = /rpc\s+(\w+)\s*\(([^)]+)\)\s*returns\s*\(([^)]+)\)\s*;/g;

        let mm;
        while ((mm = methodRegex.exec(body)) !== null) {
          const name = mm[1];
          const req = mm[2].trim();
          const resp = mm[3].trim();
          const reqStreaming = /\\bstream\\s+/.test(req);
          const respStreaming = /\\bstream\\s+/.test(resp);
          methods.push({
            name,
            requestType: req.replace(/\\bstream\\s+/, '').trim(),
            responseType: resp.replace(/\\bstream\\s+/, '').trim(),
            clientStreaming: reqStreaming,
            serverStreaming: respStreaming,
            package: pkg
          });
        }
        services.push({ name: serviceName, methods, package: pkg, fileBase });
      }

      // Messages in this file
      const messageRegex = /message\\s+(\\w+)\\s*\\{([\\s\\S]*?)\\}/g;
      let mmg;
      while ((mmg = messageRegex.exec(content)) !== null) {
        const messageName = mmg[1];
        const messageBody = mmg[2];

        // record which file defines this message
        if (!typeToFileBase.has(messageName)) {
          typeToFileBase.set(messageName, fileBase);
        } else {
          const prev = typeToFileBase.get(messageName);
          log(`⚠️ Duplicate message name '${messageName}' in ${fileBase}.proto (already seen in ${prev}.proto)`);
        }

        const fields = [];
        // label + type + name + number (ignores options/oneof/map)
        const fieldRegex = /(optional|repeated)?\\s*(\\w+(?:\\.\\w+)*)\\s+(\\w+)\\s*=\\s*(\\d+)/g;
        let fm;
        while ((fm = fieldRegex.exec(messageBody)) !== null) {
          fields.push({
            label: (fm[1] || '').trim(), // '', 'optional', 'repeated'
            type: fm[2],                 // may be package-qualified
            name: fm[3],
            number: parseInt(fm[4], 10)
          });
        }
        messages.push({ name: messageName, fields, fileBase, package: pkg });
      }
    }

    return { services, messages, typeToFileBase, protoFiles };
  } catch (err) {
    error(`Failed to parse proto file: ${err.message}`);
    return { services: [], messages: [], typeToFileBase: new Map(), protoFiles: [] };
  }
}

/** Build schema of bytes fields and nested message fields */
function buildByteSchema(messages) {
  const byName = Object.fromEntries(messages.map(m => [m.name, m]));
  const schema = {};
  for (const m of messages) {
    const s = { bytes: [], rbytes: [], nested: [], rnested: [] };
    for (const f of m.fields) {
      if (f.type === 'bytes') {
        (f.label === 'repeated' ? s.rbytes : s.bytes).push(f.name);
      } else if (byName[f.type]) {
        (f.label === 'repeated' ? s.rnested : s.nested).push({ name: f.name, type: f.type });
      }
    }
    schema[m.name] = s;
  }
  return schema;
}

/** Generate src/grpc-auto/auto-byte-align.ts */
function generateAutoByteAlignFile(messages) {
  const schema = buildByteSchema(messages);
  return `// Auto-generated. Do not edit.
export const BYTE_SCHEMA = ${JSON.stringify(schema, null, 2)} as const;

function toU8(x: any): Uint8Array | null {
  if (!x) return null;
  return x instanceof Uint8Array
    ? x
    : (typeof Buffer !== 'undefined' && (Buffer as any).isBuffer && (Buffer as any).isBuffer(x)
        ? new Uint8Array((x as any).buffer, (x as any).byteOffset, (x as any).byteLength)
        : null);
}

/** In-place: ensure bytes fields have byteOffset % 4 == 0 */
export function alignBytesInPlace(obj: any, typeName: string): void {
  if (!obj) return;
  const s = (BYTE_SCHEMA as any)[typeName];
  if (!s) return;

  for (const k of s.bytes) {
    const u8 = toU8((obj as any)[k]); if (!u8) continue;
    (obj as any)[k] = (u8.byteOffset & 3) ? new Uint8Array(u8) : u8;
  }
  for (const k of s.rbytes) {
    const arr = (obj as any)[k]; if (!Array.isArray(arr)) continue;
    for (let i = 0; i < arr.length; i++) {
      const u8 = toU8(arr[i]); if (!u8) continue;
      arr[i] = (u8.byteOffset & 3) ? new Uint8Array(u8) : u8;
    }
  }
  for (const {name, type} of s.nested) alignBytesInPlace((obj as any)[name], type);
  for (const {name, type} of s.rnested) {
    const arr = (obj as any)[name]; if (!Array.isArray(arr)) continue;
    for (const it of arr) alignBytesInPlace(it, type);
  }
}

/** Optional: attach Float32Array view when fields exist */
export function maybeAttachFloat32View(obj: any): void {
  if (!obj || !(obj as any).binary_data || typeof (obj as any).data_length !== 'number') return;
  const u8: Uint8Array = (obj as any).binary_data;
  if ((u8.byteOffset & 3) === 0) {
    (obj as any).binary_data_f32 = new Float32Array(u8.buffer, u8.byteOffset, (obj as any).data_length);
  } else {
    const copy = new Uint8Array(u8);
    (obj as any).binary_data = copy;
    (obj as any).binary_data_f32 = new Float32Array(copy.buffer, 0, (obj as any).data_length);
  }
}
`;
}

// ---------- Shared helpers ----------
function makeChannelName(methodName) {
  return `grpc-${methodName.replace(/([A-Z])/g, '-$1').toLowerCase()}`.replace(/--+/g, '-');
}
function hasBytesDeepFactory(messages) {
  const schema = buildByteSchema(messages);
  function hasBytesDeep(typeName, seen = new Set()) {
    if (!typeName || seen.has(typeName)) return false;
    seen.add(typeName);
    const s = schema[typeName];
    if (!s) return false;
    if ((s.bytes && s.bytes.length) || (s.rbytes && s.rbytes.length)) return true;
    for (const n of (s.nested || [])) if (hasBytesDeep(n.type, seen)) return true;
    for (const n of (s.rnested || [])) if (hasBytesDeep(n.type, seen)) return true;
    return false;
  }
  return hasBytesDeep;
}
function buildImportsForService(service, typeToFileBase) {
  const importsByFile = new Map();
  function add(type) {
    const fileBase = typeToFileBase.get(type) || 'main_service';
    if (!importsByFile.has(fileBase)) importsByFile.set(fileBase, new Set());
    importsByFile.get(fileBase).add(type);
  }
  service.methods.forEach(m => { add(m.requestType); add(m.responseType); });
  return Array.from(importsByFile.entries()).map(([fileBase, set]) =>
    `import type {\
  ${Array.from(set).sort().join(',\
  ')}\
} from '../generated/${fileBase}';`
  ).join('\
');
}

// ---------- Typed renderer client ----------
function generateTypedClient(services, allMessages, typeToFileBase) {
  const service = services.find(s => s.name === 'GeospatialService') || services[0];
  if (!service) return '';

  const importStatements = buildImportsForService(service, typeToFileBase);
  const hasBytesDeep = hasBytesDeepFactory(allMessages);

  const methods = service.methods.map(method => {
    const m = method;
    const camel = m.name.charAt(0).toLowerCase() + m.name.slice(1);
    const channel = makeChannelName(m.name);
    const bytey = hasBytesDeep(m.responseType);
    const isStreaming = m.serverStreaming || m.clientStreaming;

    if (isStreaming) {
      // Streaming → AsyncIterable on the renderer
      return `  ${camel}(request: ${m.requestType}): AsyncIterable<${m.responseType}> {
    return this.callStream<'${channel}', ${m.requestType}, ${m.responseType}>('${channel}', request);
  }`;
    }

    // Unary + "bytey" → big-unary via postMessage (zero-copy)
    if (bytey) {
      return `  async ${camel}(request: ${m.requestType}): Promise<${m.responseType}> {
    return this.callBigUnary<'${channel}', ${m.requestType}, ${m.responseType}>('${channel}', request);
  }`;
    }
    // Small non-byte unary uses invoke/handle
    return `  async ${camel}(request: ${m.requestType}): Promise<${m.responseType}> {
    return this.callInvoke<'${channel}', ${m.requestType}, ${m.responseType}>('${channel}', request);
  }`;
  }).join('\
\
');

  return `// Auto-generated gRPC client (renderer)
// DO NOT EDIT

import { ipcRenderer } from 'electron';
${importStatements}

type Channel = string;

export class AutoGrpcClient {
  constructor() {}

  // invoke/handle path (clones, fine for small payloads)
  private async callInvoke<C extends Channel, Req, Res>(channel: C, request: Req): Promise<Res> {
    return ipcRenderer.invoke(channel, request);
  }

  // event + postMessage path (zero-copy via transfer list). Used for bytey unary responses.
  private async callBigUnary<C extends Channel, Req, Res>(channel: C, request: Req): Promise<Res> {
    return new Promise((resolve, reject) => {
      const requestId = \`unary-\${Date.now()}-\${Math.random()}\`;
      const dataChannel  = 'grpc-unary-data';
      const errorChannel = 'grpc-unary-error';

      const cleanup = () => {
        ipcRenderer.off(dataChannel, onData);
        ipcRenderer.off(errorChannel, onErr);
      };
      const onData = (_e: any, msg: any) => {
        if (msg.requestId !== requestId) return;
        cleanup();
        resolve(msg.payload as Res);
      };
      const onErr = (_e: any, msg: any) => {
        if (msg.requestId !== requestId) return;
        cleanup();
        reject(new Error(msg.error || 'Unknown IPC error'));
      };

      ipcRenderer.on(dataChannel, onData);
      ipcRenderer.on(errorChannel, onErr);
      ipcRenderer.send(channel, { requestId, ...(request as any) });
    });
  }

  // Streaming path → AsyncIterable<Res>, channel names include requestId
  private callStream<C extends Channel, Req, Res>(channel: C, request: Req): AsyncIterable<Res> {
    const self = this;
    return {
      [Symbol.asyncIterator](): AsyncIterator<Res> {
        const requestId = \`stream-\${Date.now()}-\${Math.random()}\`;
        const dataChannel  = \`grpc-stream-data-\${requestId}\`;
        const endChannel   = \`grpc-stream-end-\${requestId}\`;
        const errorChannel = \`grpc-stream-error-\${requestId}\`;

        const queue: Res[] = [];
        let done = false;
        let err: Error | null = null;

        const onData = (_: any, msg: any) => {
          if (msg?.requestId !== requestId) return;
          queue.push(msg.payload as Res);
        };
        const onEnd = (_: any, msg: any) => {
          if (msg?.requestId !== requestId) return;
          done = true;
        };
        const onErr = (_: any, msg: any) => {
          if (msg?.requestId !== requestId) return;
          err = new Error(msg.error || 'Stream error');
          done = true;
        };

        ipcRenderer.on(dataChannel, onData);
        ipcRenderer.on(endChannel, onEnd);
        ipcRenderer.on(errorChannel, onErr);

        // Start stream
        ipcRenderer.send(channel, { requestId, ...(request as any) });

        const next = async (): Promise<IteratorResult<Res>> => {
          while (!queue.length && !done && !err) {
            await new Promise(r => setTimeout(r, 0));
          }
          if (err) {
            // cancel on error
            ipcRenderer.send(\`grpc-stream-cancel-\${requestId}\`);
            cleanup();
            throw err;
          }
          if (queue.length) {
            const value = queue.shift()!;
            return { value, done: false };
          }
          cleanup();
          return { value: undefined as any, done: true };
        };

        const cleanup = () => {
          ipcRenderer.removeAllListeners(dataChannel);
          ipcRenderer.removeAllListeners(endChannel);
          ipcRenderer.removeAllListeners(errorChannel);
        };

        const returnFn = async () => {
          // consumer broke early → cancel
          ipcRenderer.send(\`grpc-stream-cancel-\${requestId}\`);
          cleanup();
          return { value: undefined, done: true };
        };

        return { next, return: returnFn } as AsyncIterator<Res>;
      }
    } as AsyncIterable<Res>;
  }

${methods}
}

export const autoGrpcClient = new AutoGrpcClient();
`;
}

// ---------- IPC handlers ----------
function generateSimpleHandlers(services, allMessages) {
  const service = services.find(s => s.name === 'GeospatialService') || services[0];
  if (!service) return '';

  const hasBytesDeep = hasBytesDeepFactory(allMessages);

  const handlers = service.methods.map(m => {
    const camel = m.name.charAt(0).toLowerCase() + m.name.slice(1);
    const channel = makeChannelName(m.name);
    const isStreaming = m.serverStreaming || m.clientStreaming;
    const bytey = hasBytesDeep(m.responseType);

    if (isStreaming) {
      // TRUE streaming: per-chunk send() + cancel support
      return `  ipcMain.on('${channel}', (event, request) => {
    const requestId = request.requestId;
    let cancelFn = null;

    try {
      cancelFn = autoMainGrpcClient.stream${m.name}(
        request,
        (chunk) => {
          try {
            event.sender.send(\`grpc-stream-data-\${requestId}\`, { requestId, payload: chunk });
          } catch (e) {
            // Surface as stream error if the webContents is gone, etc.
            try { event.sender.send(\`grpc-stream-error-\${requestId}\`, { requestId, error: e.message || String(e) }); } catch {}
          }
        },
        () => {
          try { event.sender.send(\`grpc-stream-end-\${requestId}\`, { requestId }); } catch {}
          ipcMain.removeAllListeners(\`grpc-stream-cancel-\${requestId}\`);
        },
        (err) => {
          try { event.sender.send(\`grpc-stream-error-\${requestId}\`, { requestId, error: err?.message || String(err) }); } catch {}
          ipcMain.removeAllListeners(\`grpc-stream-cancel-\${requestId}\`);
        }
      );

      // allow renderer to cancel
      ipcMain.once(\`grpc-stream-cancel-\${requestId}\`, () => {
        try { cancelFn && cancelFn(); } catch {}
      });
    } catch (error) {
      try { event.sender.send(\`grpc-stream-error-\${requestId}\`, { requestId, error: error.message || String(error) }); } catch {}
    }
  });`;
    }

    if (bytey) {
      // Big unary via postMessage + transfer list (zero-copy)
      return `  ipcMain.on('${channel}', async (event, request) => {
    try {
      const response = await autoMainGrpcClient.${camel}(request);
      // Collect ArrayBuffers to transfer (deep)
          const transferSet = new Set<ArrayBuffer>();
        (function collect(x: any) {
          if (!x) return;
          if (ArrayBuffer.isView(x)) { transferSet.add(x.buffer); return; } // any TypedArray/DataView
          if (x instanceof ArrayBuffer) { transferSet.add(x); return; }
          if (Array.isArray(x)) { for (const it of x) collect(it); return; }
          if (typeof x === 'object') { for (const k of Object.keys(x)) collect((x as any)[k]); }
        })(response);
        const transfers = [...transferSet];
      event.sender.postMessage('grpc-unary-data', { requestId: request.requestId, payload: response }, [...transferSet]);
    } catch (error) {
      event.sender.postMessage('grpc-unary-error', { requestId: request.requestId, error: error.message || String(error) });
    }
  });`;
    }

    // Small/unbytey unary: normal handle/invoke
    return `  ipcMain.handle('${channel}', async (event, request) => {
    try {
      return await autoMainGrpcClient.${camel}(request);
    } catch (error) {
      console.error('gRPC ${camel} failed:', error);
      throw error;
    }
  });`;
  }).join('\
\
');

  return `// Auto-generated IPC handlers
// DO NOT EDIT

import { ipcMain } from 'electron';
import { autoMainGrpcClient } from './auto-main-client';

export function registerAutoGrpcHandlers() {
  console.log('🔌 Registering auto-generated gRPC IPC handlers...');

${handlers}

  console.log('✅ Auto-generated gRPC IPC handlers registered successfully');
}
`;
}

// ---------- Context bridge & types ----------
function generateTypedContext(services) {
  const service = services.find(s => s.name === 'GeospatialService') || services[0];
  if (!service) return '';

  const methods = service.methods.map(m => {
    const camel = m.name.charAt(0).toLowerCase() + m.name.slice(1);
    return `  ${camel}: autoGrpcClient.${camel}.bind(autoGrpcClient),`;
  }).join('\
');

  return `// Auto-generated context bridge
// DO NOT EDIT

import { contextBridge } from 'electron';
import { autoGrpcClient } from './auto-grpc-client';
import type { AutoGrpcContext } from './auto-context';

const autoGrpcContext: AutoGrpcContext = {
${methods}
};

export function exposeAutoGrpcContext() {
  contextBridge.exposeInMainWorld('autoGrpc', autoGrpcContext);
  console.log('✅ Auto-gRPC context exposed with TypeScript types');
}
`;
}

function generateAutoContextTypes(services, allMessages, typeToFileBase) {
  const service = services.find(s => s.name === 'GeospatialService') || services[0];
  if (!service) return '';

  const importsByFile = new Map();
  function add(type) {
    const fileBase = typeToFileBase.get(type) || 'main_service';
    if (!importsByFile.has(fileBase)) importsByFile.set(fileBase, new Set());
    importsByFile.get(fileBase).add(type);
  }
  service.methods.forEach(m => { add(m.requestType); add(m.responseType); });

  const importStatements = Array.from(importsByFile.entries())
    .map(([fileBase, set]) => `import type {\
  ${Array.from(set).sort().join(',\
  ')}\
} from '../generated/${fileBase}';`)
    .join('\
');

  const methodSignatures = service.methods.map(m => {
    const camel = m.name.charAt(0).toLowerCase() + m.name.slice(1);
    const isStreaming = m.serverStreaming || m.clientStreaming;
    if (isStreaming) {
      return `  ${camel}: (request: ${m.requestType}) => AsyncIterable<${m.responseType}>;`;
    } else {
      return `  ${camel}: (request: ${m.requestType}) => Promise<${m.responseType}>;`;
    }
  }).join('\
');

  return `// Auto-generated TypeScript interfaces for window.autoGrpc
// DO NOT EDIT

${importStatements}

/** Strongly-typed API derived from .proto services */
export interface AutoGrpcContext {
${methodSignatures}
}
`;
}

// ---------- Main process gRPC client ----------
function generateSimpleMainClient(services) {
  const service = services.find(s => s.name === 'GeospatialService') || services[0];
  if (!service) return '';

  const methods = service.methods.map(m => {
    const camel = m.name.charAt(0).toLowerCase() + m.name.slice(1);

    if (m.serverStreaming || m.clientStreaming) {
      // Streaming: push chunks via callbacks; return cancel() fn
      return `  stream${m.name}(request, onData, onEnd, onError) {
    const client = this.ensureClient();
    const stream = client.${m.name}(request);

    stream.on('data', (data) => {
      try {
        alignBytesInPlace(data, '${m.responseType}');
        if ('${m.responseType}' === 'GetColumnarDataResponse' || '${m.responseType}' === 'GetDatasetDataResponse') {
          maybeAttachFloat32View(data);
        }
      } catch (e) { console.error('align/attach failed:', e); }
      onData && onData(data);
    });
    stream.on('end', () => onEnd && onEnd());
    stream.on('error', (err) => onError && onError(err));

    // return cancel function
    return () => { try { stream.cancel(); } catch {} };
  }`;
    } else {
      return `  async ${camel}(request) {
    return new Promise((resolve, reject) => {
      const client = this.ensureClient();
      client.${m.name}(request, (error, response) => {
        if (error) return reject(error);
        try {
          alignBytesInPlace(response, '${m.responseType}');
          if ('${m.responseType}' === 'GetColumnarDataResponse' || '${m.responseType}' === 'GetDatasetDataResponse') maybeAttachFloat32View(response);
        } catch (e) {
          console.error('align/attach failed:', e);
        }
        resolve(response);
      });
    });
  }`;
    }
  }).join('\
\
');

  return `// Auto-generated main-process gRPC client
// DO NOT EDIT

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';
import { alignBytesInPlace, maybeAttachFloat32View } from './auto-byte-align';

class AutoMainGrpcClient {
  private client: any = null;
  private readonly serverAddress = '127.0.0.1:50077';

  async initialize() {
    try {
      const protoPath = process.env.NODE_ENV === 'development'
        ? join(process.cwd(), '${MAIN_PROTO_FILE}')
        : join(process.resourcesPath, '${MAIN_PROTO_FILE}');
      const protoOptions: any = {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [process.env.NODE_ENV === 'development'
          ? join(process.cwd(), '${PROTO_DIR}')
          : join(process.resourcesPath, '${PROTO_DIR}')]
      };
      const packageDefinition = protoLoader.loadSync(protoPath, protoOptions);
      const protoDefinition: any = (grpc as any).loadPackageDefinition(packageDefinition);
      const ${service.name} = protoDefinition.geospatial.${service.name};

      const options = {
        'grpc.max_send_message_length': 500 * 1024 * 1024,
        'grpc.max_receive_message_length': 500 * 1024 * 1024,
        'grpc.default_compression_algorithm': 1,
        'grpc.default_compression_level': 6,
      };

      this.client = new ${service.name}(
        this.serverAddress,
        grpc.credentials.createInsecure(),
        options
      );
      console.log(\`🔗 Auto-generated gRPC client connected to \${this.serverAddress}\`);
    } catch (error) {
      console.error('Failed to initialize auto-generated gRPC client:', error);
      throw error;
    }
  }

  private ensureClient() {
    if (!this.client) throw new Error('Auto-generated gRPC client not initialized');
    return this.client;
  }

${methods}
}

export const autoMainGrpcClient = new AutoMainGrpcClient();
`;
}

// ---------- Emit all files ----------
async function generateAllFiles() {
  try {
    log('Parsing proto files...');
    const { services, messages, typeToFileBase } = parseAllProtoFiles();
    if (!services.length) { error('No services found in proto files'); return false; }
    success(`Found ${services.length} service(s) and ${messages.length} message(s)`);

    ensureDirectory(AUTO_GEN_DIR);

    // Byte align helper
    log('Generating byte-align helper...');
    const byteAlign = generateAutoByteAlignFile(messages);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-byte-align.ts'), byteAlign);

    // Typed client
    log('Generating type-safe gRPC client (renderer)...');
    const clientTs = generateTypedClient(services, messages, typeToFileBase);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-grpc-client.ts'), clientTs);

    // IPC handlers
    log('Generating IPC handlers...');
    const handlersTs = generateSimpleHandlers(services, messages);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-ipc-handlers.ts'), handlersTs);

    // Context types
    log('Generating context interface...');
    const ctxTypes = generateAutoContextTypes(services, messages, typeToFileBase);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-context.ts'), ctxTypes);

    // Context bridge
    log('Generating context bridge...');
    const ctxBridge = generateTypedContext(services);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-grpc-context.ts'), ctxBridge);

    // Main client
    log('Generating main-process gRPC client...');
    const mainClient = generateSimpleMainClient(services);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-main-client.ts'), mainClient);

    success('All auto-generated files created successfully');
    return true;
  } catch (e) {
    console.error('Failed to generate auto files:', e);
    return false;
  }
}

// ---------- Compile protos (ALL files) ----------
async function generateOriginalProtos() {
  ensureDirectory(FRONTEND_OUT_DIR);
  ensureDirectory(BACKEND_OUT_DIR);

  const protoFiles = fs.readdirSync(PROTO_DIR).filter(f => f.endsWith('.proto'));
  const protoList = protoFiles.map(f => path.join(PROTO_DIR, f)).join(' ');

  // TypeScript via ts-proto
  const frontendCommand =
    `protoc --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto ` +
    `--ts_proto_out=${FRONTEND_OUT_DIR} ` +
    `--ts_proto_opt=lowerCaseServiceMethods=true,snakeToCamel=false ` +
    `--proto_path=${PROTO_DIR} ${protoList}`;
  const frontendSuccess = runCommand(frontendCommand, 'Generating TypeScript protobuf files with ts-proto');

  // Python via grpc_tools.protoc with type stubs
  const backendCommand =
    `python -m grpc_tools.protoc ` +
    `--python_out=${BACKEND_OUT_DIR} --grpc_python_out=${BACKEND_OUT_DIR} --pyi_out=${BACKEND_OUT_DIR} ` +
    `--proto_path=${PROTO_DIR} ${protoList}`;
  const backendSuccess = runCommand(backendCommand, 'Generating Python protobuf files with type stubs (.pyi)');

  return frontendSuccess && backendSuccess;
}

// ---------- Entrypoint ----------
async function main() {
  console.log('🚀 Simple gRPC Auto-Generator');
  console.log('=============================');

  if (!fs.existsSync(PROTO_DIR)) { error(`Protocol buffer directory '${PROTO_DIR}' not found!`); process.exit(1); }
  if (!fs.existsSync(MAIN_PROTO_FILE)) { error(`Main protocol buffer file '${MAIN_PROTO_FILE}' not found!`); process.exit(1); }

  log('Step 1: Generating original protobuf files...');
  const protosSuccess = await generateOriginalProtos();

  log('Step 2: Generating auto-generated files...');
  const autoSuccess = await generateAllFiles();

  console.log('\
📊 Results:');
  console.log(`Original Protos: ${protosSuccess ? '✅ Success' : '❌ Failed'}`);
  console.log(`Auto-Generated: ${autoSuccess ? '✅ Success' : '❌ Failed'}`);

  if (protosSuccess && autoSuccess) {
    success('🎉 Simple gRPC Auto-Generation Complete!');
    console.log('\
📂 Generated files:');
    console.log(`   TypeScript Protos: ${FRONTEND_OUT_DIR}/`);
    console.log(`   Python Protos: ${BACKEND_OUT_DIR}/`);
    console.log(`   Auto-Generated: ${AUTO_GEN_DIR}/`);
  } else {
    error('Some generation steps failed!');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export { main };
