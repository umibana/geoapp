import exposeContexts from "./helpers/ipc/context-exposer";
import { contextBridge, ipcRenderer } from 'electron';

exposeContexts();

// Electron API for file dialogs and system functionality
const electronAPI = {
  showOpenDialog: (options: Electron.OpenDialogOptions) => 
    ipcRenderer.invoke('dialog:openFile', options),
  showSaveDialog: (options: Electron.SaveDialogOptions) => 
    ipcRenderer.invoke('dialog:saveFile', options),
  // IPC communication methods
  send: (channel: string, data: any) => 
    ipcRenderer.send(channel, data),
  on: (channel: string, listener: (event: any, data: any) => void) => 
    ipcRenderer.on(channel, listener),
  off: (channel: string, listener: (event: any, data: any) => void) => 
    ipcRenderer.off(channel, listener),

};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Legacy electronGrpc removed
