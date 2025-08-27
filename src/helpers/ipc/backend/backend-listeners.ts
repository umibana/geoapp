import { ipcMain } from 'electron';
import { BACKEND_CHANNELS } from './backend-channels';
import { backendManager } from '../../backend_helpers';
import { autoMainGrpcClient } from '../../../grpc-auto/auto-main-client';

export function registerBackendListeners() {
  ipcMain.handle(BACKEND_CHANNELS.GET_BACKEND_URL, () => {
    return backendManager.getBackendUrl();
  });

  ipcMain.handle(BACKEND_CHANNELS.HEALTH_CHECK, async () => {
    // Use gRPC health check instead of basic process check
    if (!backendManager.isBackendRunning()) {
      return { healthy: false, status: 'backend not running' };
    }
    
    try {
      const res = await autoMainGrpcClient.healthCheck();
      return res;
    } catch (error) {
      return { healthy: false, status: 'gRPC connection failed' };
    }
  });

  ipcMain.handle(BACKEND_CHANNELS.RESTART_BACKEND, async () => {
    await backendManager.stopBackend();
    await backendManager.startBackend();
    // Reiniciar el cliente gRPC después de reiniciar el backend
    try {
      await autoMainGrpcClient.initialize();
    } catch {
      await new Promise(r => setTimeout(r, 500));
      await autoMainGrpcClient.initialize();
    }
    return { success: true };
  });
} 