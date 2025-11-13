import { contextBridge, ipcRenderer } from 'electron';
import { BACKEND_CHANNELS } from './backend-channels';

export function exposeBackendContext() {
  contextBridge.exposeInMainWorld('electronBackend', {
    getBackendUrl: () => ipcRenderer.invoke(BACKEND_CHANNELS.GET_BACKEND_URL),
    healthCheck: () => ipcRenderer.invoke(BACKEND_CHANNELS.HEALTH_CHECK),
    restartBackend: () => ipcRenderer.invoke(BACKEND_CHANNELS.RESTART_BACKEND),
  });
} 