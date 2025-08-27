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
    // Read all proto files and combine content
    const protoFiles = [
      'common.proto',
      'core_service.proto', 
      'geospatial_service.proto',
      'main_service.proto'
    ];
    
    let combinedContent = '';
    
    for (const protoFile of protoFiles) {
      const fullPath = path.join(PROTO_DIR, protoFile);
      if (fs.existsSync(fullPath)) {
        const content = fs.readFileSync(fullPath, 'utf8');
        combinedContent += content + '\n';
        log(`Loaded ${protoFile}`);
      }
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

function generateSimpleClient(services) {
  const service = services[0];
  if (!service) return '';
  
  const methods = service.methods.map(method => {
    const methodName = method.name;
    const camelCaseMethod = methodName.charAt(0).toLowerCase() + methodName.slice(1);
    
    if (method.isStreaming) {
      return `  async ${camelCaseMethod}(request, onData) {
    return this.callStreamingMethod('${methodName}', request, onData);
  }`;
    } else {
      return `  async ${camelCaseMethod}(request) {
    return this.callMethod('${methodName}', request);
  }`;
    }
  }).join('\n\n');
  
  return `// Auto-generated gRPC client
// DO NOT EDIT - This file is auto-generated

import { ipcRenderer } from 'electron';

export class AutoGrpcClient {
  constructor() {
    // Simple auto-generated gRPC client
  }

  private async callMethod(methodName, request) {
    const channel = \`grpc-\${methodName.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase()}\`;
    return ipcRenderer.invoke(channel, request);
  }
  
  private async callStreamingMethod(methodName, request, onData) {
    return new Promise((resolve, reject) => {
      const requestId = \`stream-\${Date.now()}-\${Math.random()}\`;
      const results = [];
      
      const handleData = (event, data) => {
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
      
      const handleError = (event, data) => {
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
  const service = services[0];
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

function generateSimpleContext(services) {
  const service = services[0];
  if (!service) return '';
  
  const methods = service.methods.map(method => {
    const camelCaseMethod = method.name.charAt(0).toLowerCase() + method.name.slice(1);
    return `  ${camelCaseMethod}: autoGrpcClient.${camelCaseMethod}.bind(autoGrpcClient),`;
  }).join('\n');
  
  return `// Auto-generated context provider
// DO NOT EDIT - This file is auto-generated

import { contextBridge } from 'electron';
import { autoGrpcClient } from './auto-grpc-client';

const autoGrpcContext = {
${methods}
};

export function exposeAutoGrpcContext() {
  contextBridge.exposeInMainWorld('autoGrpc', autoGrpcContext);
  console.log('✅ Auto-gRPC context exposed');
}
`;
}

function generateSimpleMainClient(services) {
  const service = services[0];
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
        : join(process.resourcesPath, 'app', '${MAIN_PROTO_FILE}');
      
      const protoOptions = {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [join(process.cwd(), '${PROTO_DIR}')]
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
    
    // Generate simple client
    log('Generating simple gRPC client...');
    const clientContent = generateSimpleClient(services);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-grpc-client.ts'), clientContent);
    
    // Generate IPC handlers
    log('Generating IPC handlers...');
    const handlersContent = generateSimpleHandlers(services);
    fs.writeFileSync(path.join(AUTO_GEN_DIR, 'auto-ipc-handlers.ts'), handlersContent);
    
    // Generate context provider
    log('Generating context provider...');
    const contextContent = generateSimpleContext(services);
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