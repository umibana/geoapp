/**
 * Main process gRPC client - Dynamic handler for all gRPC methods
 * 
 * This replaces the auto-generated client with a single dynamic implementation
 * that routes method calls based on the method name.
 */

import * as grpc from '@grpc/grpc-js';
import { ServiceClientConstructor } from '@grpc/grpc-js';
import { ServiceClient } from '@grpc/grpc-js/build/src/make-client';
import * as protoLoader from '@grpc/proto-loader';
import { join } from 'path';

const PROTO_DIR = 'protos';
const MAIN_PROTO_FILE = 'protos/main_service.proto';
const SERVER_ADDRESS = '127.0.0.1:50077';

// ============================================================================
// Byte Alignment Utilities
// ============================================================================

/**
 * Convert any buffer-like object to Uint8Array
 */
function toUint8Array(x: unknown): Uint8Array | null {
  if (!x) return null;
  if (x instanceof Uint8Array) return x;
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(x)) {
    return new Uint8Array(x.buffer, x.byteOffset, x.byteLength);
  }
  return null;
}

/**
 * Recursively align all bytes fields in an object to 4-byte boundaries.
 * This is necessary for creating Float32Array views from binary data.
 */
function alignBytesInPlace(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;

  const record = obj as Record<string, unknown>;
  
  for (const key of Object.keys(record)) {
    const value = record[key];
    
    // Check if it's a Uint8Array or Buffer
    const u8 = toUint8Array(value);
    if (u8) {
      // If not aligned to 4 bytes, create a copy that is aligned
      if (u8.byteOffset % 4 !== 0) {
        record[key] = new Uint8Array(u8);
      }
      continue;
    }
    
    // Recurse into arrays
    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        const item = value[i];
        const itemU8 = toUint8Array(item);
        if (itemU8 && itemU8.byteOffset % 4 !== 0) {
          value[i] = new Uint8Array(itemU8);
        } else if (item && typeof item === 'object') {
          alignBytesInPlace(item);
        }
      }
      continue;
    }
    
    // Recurse into nested objects
    if (value && typeof value === 'object') {
      alignBytesInPlace(value);
    }
  }
}

/**
 * Attach Float32Array view to objects with binary_data and data_length fields.
 * This is used for columnar data responses.
 */
function maybeAttachFloat32View(obj: unknown): void {
  if (!obj || typeof obj !== 'object') return;
  
  const record = obj as Record<string, unknown>;
  
  // Check if this object has the expected fields
  if (record.binary_data && typeof record.data_length === 'number') {
    const u8 = record.binary_data as Uint8Array;
    const dataLength = record.data_length as number;
    
    if (u8.byteOffset % 4 === 0) {
      record.binary_data_f32 = new Float32Array(u8.buffer, u8.byteOffset, dataLength);
    } else {
      // Create aligned copy
      const copy = new Uint8Array(u8);
      record.binary_data = copy;
      record.binary_data_f32 = new Float32Array(copy.buffer, 0, dataLength);
    }
  }
  
  // Recurse into nested objects and arrays
  for (const key of Object.keys(record)) {
    const value = record[key];
    if (Array.isArray(value)) {
      for (const item of value) {
        maybeAttachFloat32View(item);
      }
    } else if (value && typeof value === 'object' && !(value instanceof Uint8Array)) {
      maybeAttachFloat32View(value);
    }
  }
}

/**
 * Process response to ensure byte alignment and attach Float32Array views
 */
function processResponse<T>(response: T): T {
  alignBytesInPlace(response);
  maybeAttachFloat32View(response);
  return response;
}

// ============================================================================
// gRPC Client
// ============================================================================

class GrpcClient {
  private client: ServiceClient | null = null;

  async initialize(): Promise<void> {
    try {
      const protoPath = process.env.NODE_ENV === 'development'
        ? join(process.cwd(), MAIN_PROTO_FILE)
        : join(process.resourcesPath, MAIN_PROTO_FILE);

      const protoOptions: protoLoader.Options = {
        keepCase: true,
        longs: String,
        enums: String,
        defaults: true,
        oneofs: true,
        includeDirs: [
          process.env.NODE_ENV === 'development'
            ? join(process.cwd(), PROTO_DIR)
            : join(process.resourcesPath, PROTO_DIR)
        ]
      };

      const packageDefinition = protoLoader.loadSync(protoPath, protoOptions);
      const protoDefinition = grpc.loadPackageDefinition(packageDefinition) as unknown as { geospatial: { GeospatialService: grpc.ServiceClientConstructor } };
      const GeospatialService = protoDefinition.geospatial.GeospatialService as ServiceClientConstructor;

      const options = {
        'grpc.max_send_message_length': 1024 * 1024 * 1024,
        'grpc.max_receive_message_length': 1024 * 1024 * 1024,
        'grpc.default_compression_algorithm': 1,
        'grpc.default_compression_level': 6,
      };

      this.client = new GeospatialService(
        SERVER_ADDRESS,
        grpc.credentials.createInsecure(),
        options
      );

      console.log(`🔗 gRPC client connected to ${SERVER_ADDRESS}`);
    } catch (error) {
      console.error('Failed to initialize gRPC client:', error);
      throw error;
    }
  }

  /**
   * Call any gRPC method dynamically by name
   * @param methodName - PascalCase method name (e.g., 'HelloWorld', 'GetProjects')
   * @param request - Request payload
   */
  call<T>(methodName: string, request: unknown): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.client) {
        return reject(new Error('gRPC client not initialized'));
      }

      const method = this.client[methodName];
      if (typeof method !== 'function') {
        return reject(new Error(`Unknown gRPC method: ${methodName}`));
      }

      method.call(this.client, request, (error: Error | null, response: T) => {
        if (error) {
          return reject(error);
        }
        // Process response to align bytes and attach Float32Array views
        resolve(processResponse(response));
      });
    });
  }

  isInitialized(): boolean {
    return this.client !== null;
  }
}

export const grpcClient = new GrpcClient();
