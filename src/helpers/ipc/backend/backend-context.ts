import { contextBridge, ipcRenderer } from 'electron';
import { BACKEND_CHANNELS } from './backend-channels';

export function exposeBackendContext() {
  contextBridge.exposeInMainWorld('electronBackend', {
    getBackendUrl: () => ipcRenderer.invoke(BACKEND_CHANNELS.GET_BACKEND_URL),
    healthCheck: () => ipcRenderer.invoke(BACKEND_CHANNELS.HEALTH_CHECK),
    restartBackend: () => ipcRenderer.invoke(BACKEND_CHANNELS.RESTART_BACKEND),
    
    // REST API calls through IPC for fair performance comparison
    rest: {
      healthCheck: () => ipcRenderer.invoke(BACKEND_CHANNELS.REST_HEALTH_CHECK),
      helloWorld: (request: { message: string }) => 
        ipcRenderer.invoke(BACKEND_CHANNELS.REST_HELLO_WORLD, request),
      echoParameter: (request: { value: number; operation: string }) =>
        ipcRenderer.invoke(BACKEND_CHANNELS.REST_ECHO_PARAMETER, request),
      getColumnarData: (request: { data_types: string[]; max_points: number }) =>
        ipcRenderer.invoke(BACKEND_CHANNELS.REST_GET_COLUMNAR_DATA, request),
      getColumnarDataMsgpack: (request: { data_types: string[]; max_points: number }) =>
        ipcRenderer.invoke(BACKEND_CHANNELS.REST_GET_COLUMNAR_DATA_MSGPACK, request),
      getProjects: () => ipcRenderer.invoke(BACKEND_CHANNELS.REST_GET_PROJECTS),
      createProject: (request: { name: string; description: string }) =>
        ipcRenderer.invoke(BACKEND_CHANNELS.REST_CREATE_PROJECT, request),
      getProject: (projectId: string) =>
        ipcRenderer.invoke(BACKEND_CHANNELS.REST_GET_PROJECT, projectId),
      updateProject: (projectId: string, request: { name: string; description: string }) =>
        ipcRenderer.invoke(BACKEND_CHANNELS.REST_UPDATE_PROJECT, projectId, request),
      deleteProject: (projectId: string) =>
        ipcRenderer.invoke(BACKEND_CHANNELS.REST_DELETE_PROJECT, projectId),
    }
  });
} 