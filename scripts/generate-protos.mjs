#!/usr/bin/env node
/**
 * Protocol Buffer Generator
 * 
 * Generates TypeScript and Python protobuf stubs from .proto files.
 * This is a simplified version that only handles proto compilation.
 * 
 * Generated files:
 * - src/generated/*.ts (TypeScript via ts-proto)
 * - backend/generated/*_pb2.py, *_pb2_grpc.py, *_pb2.pyi (Python via grpc_tools)
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import process from 'process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROTO_DIR = 'protos';
const FRONTEND_OUT_DIR = 'src/generated';
const BACKEND_OUT_DIR = 'backend/generated';

// Cross-platform protoc path
const isWindows = process.platform === 'win32';
const PROTOC_PATH = isWindows
  ? path.join(__dirname, '../node_modules/.bin/protoc.cmd')
  : path.join(__dirname, '../node_modules/.bin/protoc');

// Logging helpers
function log(message) { console.log(`🔨 ${message}`); }
function error(message) { console.error(`❌ ${message}`); }
function success(message) { console.log(`✅ ${message}`); }

/**
 * Run a shell command with error handling
 */
function runCommand(command, description) {
  try {
    log(description);
    execSync(command, { stdio: 'inherit', shell: true });
    return true;
  } catch (err) {
    error(`Failed: ${description}`);
    console.error('Error:', err.message);
    return false;
  }
}

/**
 * Ensure a directory exists
 */
function ensureDirectory(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    log(`Created directory: ${dir}`);
  }
}

/**
 * Generate TypeScript protobuf files using ts-proto
 */
function generateTypeScriptProtos(protoFiles) {
  const protoList = protoFiles.map(f => path.join(PROTO_DIR, f)).join(' ');
  
  if (isWindows) {
    // On Windows, use npx to handle .cmd wrapper resolution
    const command =
      `npx protoc --plugin=protoc-gen-ts_proto=".\\node_modules\\.bin\\protoc-gen-ts_proto.cmd" ` +
      `--ts_proto_out=${FRONTEND_OUT_DIR} ` +
      `--ts_proto_opt=lowerCaseServiceMethods=true,snakeToCamel=false ` +
      `--proto_path=${PROTO_DIR} ${protoList}`;
    
    return runCommand(command, 'Generating TypeScript protobuf files');
  }
  
  // Unix path
  const tsProtoPlugin = path.resolve('node_modules/.bin/protoc-gen-ts_proto');
  const command =
    `${PROTOC_PATH} --plugin=protoc-gen-ts_proto="${tsProtoPlugin}" ` +
    `--ts_proto_out=${FRONTEND_OUT_DIR} ` +
    `--ts_proto_opt=lowerCaseServiceMethods=true,snakeToCamel=false ` +
    `--proto_path=${PROTO_DIR} ${protoList}`;
  
  return runCommand(command, 'Generating TypeScript protobuf files');
}

/**
 * Generate Python protobuf files using grpc_tools.protoc
 */
function generatePythonProtos(protoFiles) {
  const pythonCmd = isWindows ? 'python' : 'python3';
  
  // Normalize paths for protoc (always use forward slashes)
  const backendOutNormalized = path.resolve(BACKEND_OUT_DIR).replace(/\\/g, '/');
  const protoDirNormalized = path.resolve(PROTO_DIR).replace(/\\/g, '/');
  const protoFilesNormalized = protoFiles.map(f => 
    path.resolve(PROTO_DIR, f).replace(/\\/g, '/')
  );
  
  const command =
    `${pythonCmd} -m grpc_tools.protoc ` +
    `--python_out="${backendOutNormalized}" ` +
    `--grpc_python_out="${backendOutNormalized}" ` +
    `--pyi_out="${backendOutNormalized}" ` +
    `--proto_path="${protoDirNormalized}" ` +
    protoFilesNormalized.map(f => `"${f}"`).join(' ');
  
  return runCommand(command, 'Generating Python protobuf files');
}

/**
 * Main entry point
 */
async function main() {
  console.log('🚀 Protocol Buffer Generator');
  console.log('============================\n');

  // Validate proto directory exists
  if (!fs.existsSync(PROTO_DIR)) {
    error(`Proto directory '${PROTO_DIR}' not found!`);
    process.exit(1);
  }

  // Get all .proto files
  const protoFiles = fs.readdirSync(PROTO_DIR).filter(f => f.endsWith('.proto'));
  if (protoFiles.length === 0) {
    error('No .proto files found!');
    process.exit(1);
  }

  log(`Found ${protoFiles.length} proto file(s): ${protoFiles.join(', ')}\n`);

  // Ensure output directories exist
  ensureDirectory(FRONTEND_OUT_DIR);
  ensureDirectory(BACKEND_OUT_DIR);

  // Generate TypeScript protos
  const tsSuccess = generateTypeScriptProtos(protoFiles);

  // Generate Python protos
  const pySuccess = generatePythonProtos(protoFiles);

  // Summary
  console.log('\n📊 Results:');
  console.log(`TypeScript: ${tsSuccess ? '✅ Success' : '❌ Failed'}`);
  console.log(`Python:     ${pySuccess ? '✅ Success' : '❌ Failed'}`);

  if (tsSuccess && pySuccess) {
    success('\n🎉 Proto generation complete!');
    console.log(`\n📂 Generated files:`);
    console.log(`   TypeScript: ${FRONTEND_OUT_DIR}/`);
    console.log(`   Python:     ${BACKEND_OUT_DIR}/`);
  } else {
    error('\nSome generation steps failed!');
    process.exit(1);
  }
}

// Entry point check
const isMainModule = () => {
  try {
    const scriptPath = fileURLToPath(import.meta.url);
    const argPath = path.resolve(process.argv[1]);
    return scriptPath === argPath;
  } catch {
    return true;
  }
};

if (isMainModule()) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { main };

