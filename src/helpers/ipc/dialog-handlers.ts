import { ipcMain, dialog } from 'electron';

export function registerDialogHandlers() {
  console.log('📂 Registering dialog IPC handlers...');

  // Manejar el diálogo de apertura de archivo
  ipcMain.handle('dialog:openFile', async (event, options) => {
    try {
      const result = await dialog.showOpenDialog(options);
      return result;
    } catch (error) {
      console.error('Error al abrir el dialogo de archivos:', error);
      throw error;
    }
  });

  // Manejar el diálogo de guardado de archivo
  ipcMain.handle('dialog:saveFile', async (event, options) => {
    try {
      const result = await dialog.showSaveDialog(options);
      return result;
    } catch (error) {
      console.error('Error al guardar el archivo:', error);
      throw error;
    }
  });
}