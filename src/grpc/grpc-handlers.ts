/**
 * IPC handlers for gRPC communication
 * 
 * Single dynamic handler that routes all gRPC method calls
 * Replaces ~250 lines of auto-generated handlers with ~20 lines
 */

import { ipcMain } from 'electron';
import { grpcClient } from './grpc-client';

/**
 * Register the single gRPC IPC handler
 * All gRPC calls go through 'grpc:call' channel with { method, request } payload
 */
export function registerGrpcHandlers(): void {
  console.log('🔌 Registering gRPC IPC handler...');

  ipcMain.handle('grpc:call', async (_event, { method, request }: { method: string; request: unknown }) => {
    if (!grpcClient.isInitialized()) {
      throw new Error('gRPC client not initialized');
    }

    try {
      return await grpcClient.call(method, request);
    } catch (error) {
      console.error(`gRPC ${method} failed:`, error);
      throw error;
    }
  });

  console.log('✅ gRPC IPC handler registered');
}

