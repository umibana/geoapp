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
  // Read only the first N lines from a CSV file (comma + UTF-8)
  readCsvPreview: async (filePath: string, numRows: number = 2): Promise<{ headers: string[]; rows: string[][]; delimiter: string }> => {
    // Helper to parse a single CSV line with basic quote handling
    const parseCsvLine = (line: string): string[] => {
      const values: string[] = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          if (inQuotes && line[i + 1] === '"') {
            current += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = !inQuotes;
          }
        } else if (char === ',' && !inQuotes) {
          values.push(current);
          current = '';
        } else {
          current += char;
        }
      }
      values.push(current);
      // Trim surrounding quotes
      return values.map((v) => {
        const trimmed = v.trim();
        if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
          return trimmed.slice(1, -1);
        }
        return trimmed;
      });
    };

    // Read only a small portion from the start of the file
    const { promises: fsPromises } = await import('fs');
    const fileHandle = await fsPromises.open(filePath, 'r');
    try {
      const bufferSize = 262144; // 256KB chunk from start
      const buffer = Buffer.allocUnsafe(bufferSize);
      const { bytesRead } = await fileHandle.read(buffer, 0, bufferSize, 0);
      const text = buffer.subarray(0, bytesRead).toString('utf8');
      const lines = text.split(/\r?\n/).filter((l) => l.length > 0).slice(0, Math.max(1, numRows));
      const headers = parseCsvLine(lines[0] ?? '');
      const rows: string[][] = [];
      for (let i = 1; i < lines.length && rows.length < numRows - 1; i++) {
        rows.push(parseCsvLine(lines[i]));
      }
      return { headers, rows, delimiter: ',' };
    } finally {
      await fileHandle.close();
    }
  }
};

contextBridge.exposeInMainWorld('electronAPI', electronAPI);

// Legacy electronGrpc removed
