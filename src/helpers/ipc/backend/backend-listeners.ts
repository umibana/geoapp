import { ipcMain } from 'electron';
import { BACKEND_CHANNELS } from './backend-channels';
import { backendManager } from '../../backend_helpers';
import { autoMainGrpcClient } from '../../../grpc-auto/auto-main-client';
import { mainRestApiClient } from '../../rest-client-main';

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
      const res = await autoMainGrpcClient.healthCheck({});
      return res;
    } catch {
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

  // =============================================================================
  // REST API IPC HANDLERS FOR FAIR PERFORMANCE COMPARISON
  // =============================================================================
  
  ipcMain.handle(BACKEND_CHANNELS.REST_HEALTH_CHECK, async () => {
    try {
      return await mainRestApiClient.healthCheck();
    } catch (error) {
      throw new Error(`REST health check failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  ipcMain.handle(BACKEND_CHANNELS.REST_HELLO_WORLD, async (_, request: { message: string }) => {
    try {
      return await mainRestApiClient.helloWorld(request);
    } catch (error) {
      throw new Error(`REST hello world failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  ipcMain.handle(BACKEND_CHANNELS.REST_ECHO_PARAMETER, async (_, request: { value: number; operation: string }) => {
    try {
      return await mainRestApiClient.echoParameter(request);
    } catch (error) {
      throw new Error(`REST echo parameter failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  ipcMain.handle(BACKEND_CHANNELS.REST_GET_COLUMNAR_DATA, async (_, request: { data_types: string[]; max_points: number }) => {
    try {
      return await mainRestApiClient.getColumnarData(request);
    } catch (error) {
      throw new Error(`REST get columnar data failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  ipcMain.handle(BACKEND_CHANNELS.REST_GET_COLUMNAR_DATA_MSGPACK, async (_, request: { data_types: string[]; max_points: number }) => {
    try {
      return await mainRestApiClient.getColumnarDataMsgpack(request);
    } catch (error) {
      throw new Error(`REST get columnar data msgpack failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  ipcMain.handle(BACKEND_CHANNELS.REST_GET_PROJECTS, async () => {
    try {
      return await mainRestApiClient.getProjects();
    } catch (error) {
      throw new Error(`REST get projects failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  ipcMain.handle(BACKEND_CHANNELS.REST_CREATE_PROJECT, async (_, request: { name: string; description: string }) => {
    try {
      return await mainRestApiClient.createProject(request);
    } catch (error) {
      throw new Error(`REST create project failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  ipcMain.handle(BACKEND_CHANNELS.REST_GET_PROJECT, async (_, projectId: string) => {
    try {
      return await mainRestApiClient.getProject(projectId);
    } catch (error) {
      throw new Error(`REST get project failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  ipcMain.handle(BACKEND_CHANNELS.REST_UPDATE_PROJECT, async (_, projectId: string, request: { name: string; description: string }) => {
    try {
      return await mainRestApiClient.updateProject(projectId, request);
    } catch (error) {
      throw new Error(`REST update project failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });

  ipcMain.handle(BACKEND_CHANNELS.REST_DELETE_PROJECT, async (_, projectId: string) => {
    try {
      return await mainRestApiClient.deleteProject(projectId);
    } catch (error) {
      throw new Error(`REST delete project failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  });
} 