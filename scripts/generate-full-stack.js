#!/usr/bin/env node
/**
 * Simple Protocol Buffer Generator without Worker Threads
 * 
 * This script generates:
 * 1. Protocol Buffer files (TS + Python)
 * 2. Auto-generated TypeScript interfaces 
 * 3. Simple gRPC client
 * 4. Basic IPC handlers
 * 5. Simple context provider
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const PROTO_DIR = 'protos';
const MAIN_PROTO_FILE = 'protos/main_service.proto';
const FRONTEND_OUT_DIR = 'src/generated';
const BACKEND_OUT_DIR = 'backend/generated';
const AUTO_GEN_DIR = 'src/grpc-auto';

function log(message) {
  console.log(`🔨 ${message}`);
}

function error(message) {
  console.error(`❌ ${message}`);
}

function success(message) {
  console.log(`✅ ${message}`);
}

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

function parseAllProtoFiles() {
  try {
    // Read all proto files under protos directory
    const protoFiles = fs.readdirSync(PROTO_DIR).filter(f => f.endsWith('.proto'));
    
    let combinedContent = '';
    
    for (const protoFile of protoFiles) {
      const fullPath = path.join(PROTO_DIR, protoFile);
      const content = fs.readFileSync(fullPath, 'utf8');
      combinedContent += content + '\n';
      log(`Loaded ${protoFile}`);
    }
    
    const protoContent = combinedContent;
    const services = [];
    const messages = [];
    
    // Extract services and their methods
    const serviceRegex = /service\s+(\w+)\s*\{([^}]+)\}/g;
    let serviceMatch;
    
    while ((serviceMatch = serviceRegex.exec(protoContent)) !== null) {
      const serviceName = serviceMatch[1];
      const serviceBody = serviceMatch[2];
      
      const methods = [];
      const methodRegex = /rpc\s+(\w+)\s*\(([^)]+)\)\s*returns\s*\(([^)]+)\)/g;
      let methodMatch;
      
      while ((methodMatch = methodRegex.exec(serviceBody)) !== null) {
        const methodName = methodMatch[1];
        const requestType = methodMatch[2].trim();
        const responseType = methodMatch[3].trim();
        
        // Check if it's a streaming method
        const isStreaming = responseType.includes('stream');
        const cleanResponseType = responseType.replace(/stream\s+/, '');
        
        methods.push({
          name: methodName,
          requestType,
          responseType: cleanResponseType,
          isStreaming
        });
      }
      
      services.push({
        name: serviceName,
        methods
      });
    }
    
    // Extract message types
    const messageRegex = /message\s+(\w+)\s*\{([^}]+)\}/g;
    let messageMatch;
    
    while ((messageMatch = messageRegex.exec(protoContent)) !== null) {
      const messageName = messageMatch[1];
      const messageBody = messageMatch[2];
      
      const fields = [];
      const fieldRegex = /(?:optional\s+|repeated\s+)?(\w+)\s+(\w+)\s*=\s*(\d+)/g;
      let fieldMatch;
      
      while ((fieldMatch = fieldRegex.exec(messageBody)) !== null) {
        fields.push({
          type: fieldMatch[1],
          name: fieldMatch[2],
          number: parseInt(fieldMatch[3])
        });
      }
      
      messages.push({
        name: messageName,
        fields
      });
    }
    
    return { services, messages };
  } catch (err) {
    error(`Failed to parse proto file: ${err.message}`);
    return { services: [], messages: [] };
  }
}

function generateTypedClient(services, allMessages) {
  // Find GeospatialService (the main aggregator service)
  const service = services.find(s => s.name === 'GeospatialService') || services[0];
  if (!service) return '';
  
  // Dynamically organize imports by proto file based on message definitions
  const importsByFile = {
    'geospatial_pb': new Set(),
    'projects_pb': new Set(),
    'files_pb': new Set()
  };
  
  // Add all request/response types to appropriate import files
  service.methods.forEach(method => {
    [method.requestType, method.responseType].forEach(typeName => {
      // Determine which proto file this type belongs to based on naming patterns
      if (typeName.includes('Project') || typeName.includes('Dataset') || typeName.includes('File')) {
        importsByFile['projects_pb'].add(typeName);
      } else if (typeName.includes('AnalyzeCsv') || typeName.includes('SendFile')) {
        importsByFile['files_pb'].add(typeName);
      } else {
        importsByFile['geospatial_pb'].add(typeName);
      }
    });
  });
  
  // Generate dynamic import statements
  const importStatements = Object.entries(importsByFile)
    .filter(([_, types]) => types.size > 0)
    .map(([file, types]) => {
      const typeList = Array.from(types).sort().join(',\n  ');
      return `import type {\n  ${typeList}\n} from '../generated/${file}';`;
    })
    .join('\n');
  
  const methods = service.methods.map(method => {
    const methodName = method.name;
    const camelCaseMethod = methodName.charAt(0).toLowerCase() + methodName.slice(1);
    
    if (method.isStreaming) {
      return `  async ${camelCaseMethod}(request: ${method.requestType}, onData?: (data: ${method.responseType}) => void): Promise<${method.responseType}[]> {
    return this.callStreamingMethod('${methodName}', request, onData);
  }`;
    } else {
      return `  async ${camelCaseMethod}(request: ${method.requestType}): Promise<${method.responseType}> {
    return this.callMethod('${methodName}', request);
  }`;
    }
  }).join('\n\n');
  
  return `// Auto-generated gRPC client with Protocol Buffer types
// DO NOT EDIT - This file is auto-generated

import { ipcRenderer } from 'electron';
${importStatements}

export class AutoGrpcClient {
  constructor() {
    // Type-safe auto-generated gRPC client
  }

  private async callMethod<TRequest, TResponse>(methodName: string, request: TRequest): Promise<TResponse> {
    const channel = \`grpc-\${methodName.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase()}\`;
    return ipcRenderer.invoke(channel, request);
  }
  
  private async callStreamingMethod<TRequest, TResponse>(
    methodName: string, 
    request: TRequest, 
    onData?: (data: TResponse) => void
  ): Promise<TResponse[]> {
    return new Promise((resolve, reject) => {
      const requestId = \`stream-\${Date.now()}-\${Math.random()}\`;
      const results: TResponse[] = [];
      
      const handleData = (event: any, data: any) => {
        if (data.requestId !== requestId) return;
        
        if (data.type === 'data') {
          results.push(data.payload);
          if (onData) onData(data.payload);
        } else if (data.type === 'complete') {
          ipcRenderer.off('grpc-stream-data', handleData);
          ipcRenderer.off('grpc-stream-error', handleError);
          resolve(results);
        }
      };
      
      const handleError = (event: any, data: any) => {
        if (data.requestId !== requestId) return;
        ipcRenderer.off('grpc-stream-data', handleData);
        ipcRenderer.off('grpc-stream-error', handleError);
        reject(new Error(data.error));
      };
      
      ipcRenderer.on('grpc-stream-data', handleData);
      ipcRenderer.on('grpc-stream-error', handleError);
      
      const channel = \`grpc-\${methodName.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase()}\`;
      ipcRenderer.send(channel, { requestId, ...request });
    });
  }

${methods}
}

export const autoGrpcClient = new AutoGrpcClient();
`;
}

function generateSimpleHandlers(services) {
  // Find GeospatialService (the main aggregator service)
  const service = services.find(s => s.name === 'GeospatialService') || services[0];
  if (!service) return '';
  
  const handlers = service.methods.map(method => {
    const methodName = method.name;
    const camelCaseMethod = methodName.charAt(0).toLowerCase() + methodName.slice(1);
    const channel = `grpc-${methodName.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    
    if (method.isStreaming) {
      return `  ipcMain.on('${channel}', async (event, request) => {
    try {
      const results = await autoMainGrpcClient.${camelCaseMethod}(request);
      results.forEach(data => {
        event.sender.send('grpc-stream-data', {
          requestId: request.requestId,
          type: 'data',
          payload: data
        });
      });
      event.sender.send('grpc-stream-data', {
        requestId: request.requestId,
        type: 'complete'
      });
    } catch (error) {
      event.sender.send('grpc-stream-error', {
        requestId: request.requestId,
        error: error.message
      });
    }
  });`;
    } else {
      return `  ipcMain.handle('${channel}', async (event, request) => {
    try {
      return await autoMainGrpcClient.${camelCaseMethod}(request);
    } catch (error) {
      console.error('gRPC ${camelCaseMethod} failed:', error);
      throw error;
    }
  });`;
    }
  }).join('\n\n');
  
  return `// Auto-generated IPC handlers
// DO NOT EDIT - This file is auto-generated

import { ipcMain } from 'electron';
import { autoMainGrpcClient } from './auto-main-client';

export function registerAutoGrpcHandlers() {
  console.log('🔌 Registering auto-generated gRPC IPC handlers...');

${handlers}

  console.log('✅ Auto-generated gRPC IPC handlers registered successfully');
}
`;
}

function generateTypedContext(services) {
  // Find GeospatialService (the main aggregator service)
  const service = services.find(s => s.name === 'GeospatialService') || services[0];
  if (!service) return '';
  
  const methods = service.methods.map(method => {
    const camelCaseMethod = method.name.charAt(0).toLowerCase() + method.name.slice(1);
    return `  ${camelCaseMethod}: autoGrpcClient.${camelCaseMethod}.bind(autoGrpcClient),`;
  }).join('\n');
  
  return `// Auto-generated context provider with TypeScript types
// DO NOT EDIT - This file is auto-generated

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

function generateAutoContextTypes(services, allMessages) {
  // Find GeospatialService (the main aggregator service)
  const service = services.find(s => s.name === 'GeospatialService') || services[0];
  if (!service) return '';
  
  // Dynamically organize imports by proto file based on message definitions
  const importsByFile = {
    'geospatial_pb': new Set(),
    'projects_pb': new Set(),
    'files_pb': new Set()
  };
  
  // Add all request/response types to appropriate import files
  service.methods.forEach(method => {
    [method.requestType, method.responseType].forEach(typeName => {
      // Determine which proto file this type belongs to based on naming patterns
      if (typeName.includes('Project') || typeName.includes('Dataset') || typeName.includes('File')) {
        importsByFile['projects_pb'].add(typeName);
      } else if (typeName.includes('AnalyzeCsv') || typeName.includes('SendFile')) {
        importsByFile['files_pb'].add(typeName);
      } else {
        importsByFile['geospatial_pb'].add(typeName);
      }
    });
  });
  
  // Generate dynamic import statements
  const importStatements = Object.entries(importsByFile)
    .filter(([_, types]) => types.size > 0)
    .map(([file, types]) => {
      const typeList = Array.from(types).sort().join(',\n  ');
      return `import type {\n  ${typeList}\n} from '../generated/${file}';`;
    })
    .join('\n');
  
  // Generate method signatures for the interface
  const methodSignatures = service.methods.map(method => {
    const camelCaseMethod = method.name.charAt(0).toLowerCase() + method.name.slice(1);
    
    if (method.isStreaming) {
      return `  ${camelCaseMethod}: (request: ${method.requestType}, onData?: (data: ${method.responseType}) => void) => Promise<${method.responseType}[]>;`;
    } else {
      return `  ${camelCaseMethod}: (request: ${method.requestType}) => Promise<${method.responseType}>;`;
    }
  }).join('\n');
  
  return `// Auto-generated TypeScript interfaces for window.autoGrpc
// DO NOT EDIT - This file is auto-generated

${importStatements}

/**
 * Type-safe interface for window.autoGrpc methods
 * All methods are auto-generated from Protocol Buffer service definitions
 */
export interface AutoGrpcContext {
${methodSignatures}
}
`;
}

function generateSimpleMainClient(services) {
  // Find GeospatialService (the main aggregator service)
  const service = services.find(s => s.name === 'GeospatialService') || services[0];
  if (!service) return '';
  
  const methods = service.methods.map(method => {
    const methodName = method.name;
    const camelCaseMethod = methodName.charAt(0).toLowerCase() + methodName.slice(1);
    
    if (method.isStreaming) {
      return `  async ${camelCaseMethod}(request) {
    return new Promise((resolve, reject) => {
      const client = this.ensureClient();
      const stream = client.${methodName}(request);
      const results = [];
      
      stream.on('data', (data) => {
        results.push(data);
      });
      
      stream.on('end', () => {
        resolve(results);
      });
      
      stream.on('error', (error) => {
        reject(error);
      });
    });
  }`;
    } else {
      return `  async ${camelCaseMethod}(request) {
    return new Promise((resolve, reject) => {
      const client = this.ensureClient();
      client.${methodName}(request, (error, response) => {
        if (error) {
          reject(error);
        } else {
          resolve(response);
        }
      });
    });
  }`;
    }
  }).join('\n\n');
  
  return `// Auto-generated main process gRPC client
// DO NOT EDIT - This file is auto-generated

import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';

class AutoMainGrpcClient {
  private client = null;
  private readonly serverAddress = '127.0.0.1:50077';

  async initialize() {
    try {
      const protoPath = process.env.NODE_ENV === 'development' 
        ? join(process.cwd(), '${MAIN_PROTO_FILE}')
        : join(process.resourcesPath, '${MAIN_PROTO_FILE}');
      
      const protoOptions = {
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
      const protoDefinition = grpc.loadPackageDefinition(packageDefinition);
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
    if (!this.client) {
      throw new Error('Auto-generated gRPC client not initialized');
    }
    return this.client;
  }

${methods}
}

export const autoMainGrpcClient = new AutoMainGrpcClient();
`;
}

async function generateAllFiles() {
  try {
    log('Parsing proto files...');
    const { services, messages } = parseAllProtoFiles();
    
    if (services.length === 0) {
      error('No services found in proto file');
      return false;
    }
    
    success(`Found ${services.length} service(s) and ${messages.length} message(s)`);
    
    // Create auto-generation directory
    ensureDirectory(AUTO_GEN_DIR);
    
    // Generate typed client
    log('Generating type-safe gRPC client...');
    const clientContent = generateTypedClient(services, messages);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-grpc-client.ts'), clientContent);
    
    // Generate IPC handlers
    log('Generating IPC handlers...');
    const handlersContent = generateSimpleHandlers(services);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-ipc-handlers.ts'), handlersContent);
    
    // Generate TypeScript interface definitions
    log('Generating TypeScript context interface...');
    const contextTypesContent = generateAutoContextTypes(services, messages);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-context.ts'), contextTypesContent);
    
    // Generate context provider
    log('Generating context provider...');
    const contextContent = generateTypedContext(services);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-grpc-context.ts'), contextContent);
    
    // Generate main process client
    log('Generating main process client...');
    const mainClientContent = generateSimpleMainClient(services);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-main-client.ts'), mainClientContent);
    
    success('All auto-generated files created successfully');
    return true;
    
  } catch (error) {
    console.error('Failed to generate auto files:', error);
    return false;
  }
}

async function generateOriginalProtos() {
  ensureDirectory(FRONTEND_OUT_DIR);
  ensureDirectory(BACKEND_OUT_DIR);
  
  // Generate TypeScript files
  const frontendCommand = `protoc --plugin=protoc-gen-es=./node_modules/.bin/protoc-gen-es --es_out=${FRONTEND_OUT_DIR} --es_opt=target=ts --proto_path=${PROTO_DIR} ${MAIN_PROTO_FILE}`;
  const frontendSuccess = runCommand(frontendCommand, 'Generating TypeScript protobuf files');
  
  // Generate Python files
  const backendCommand = `python3 -m grpc_tools.protoc --python_out=${BACKEND_OUT_DIR} --grpc_python_out=${BACKEND_OUT_DIR} --proto_path=${PROTO_DIR} ${MAIN_PROTO_FILE}`;
  const backendSuccess = runCommand(backendCommand, 'Generating Python protobuf files');
  
  return frontendSuccess && backendSuccess;
}

async function main() {
  console.log('🚀 Simple gRPC Auto-Generator');
  console.log('=============================');
  
  if (!fs.existsSync(PROTO_DIR)) {
    error(`Protocol buffer directory '${PROTO_DIR}' not found!`);
    process.exit(1);
  }
  
  if (!fs.existsSync(MAIN_PROTO_FILE)) {
    error(`Main protocol buffer file '${MAIN_PROTO_FILE}' not found!`);
    process.exit(1);
  }
  
  // Generate original protobuf files
  log('Step 1: Generating original protobuf files...');
  const protosSuccess = await generateOriginalProtos();
  
  // Generate auto-generated files
  log('Step 2: Generating auto-generated files...');
  const autoSuccess = await generateAllFiles();
  
  console.log('\n📊 Results:');
  console.log(`Original Protos: ${protosSuccess ? '✅ Success' : '❌ Failed'}`);
  console.log(`Auto-Generated: ${autoSuccess ? '✅ Success' : '❌ Failed'}`);
  
  if (protosSuccess && autoSuccess) {
    success('🎉 Simple gRPC Auto-Generation Complete!');
    console.log('\n📂 Generated files:');
    console.log(`   TypeScript Protos: ${FRONTEND_OUT_DIR}/`);
    console.log(`   Python Protos: ${BACKEND_OUT_DIR}/`);
    console.log(`   Auto-Generated: ${AUTO_GEN_DIR}/`);
  } else {
    error('Some generation steps failed!');
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };