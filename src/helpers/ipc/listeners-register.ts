import { BrowserWindow } from "electron";
import { addThemeEventListeners } from "./theme/theme-listeners";
import { addWindowEventListeners } from "./window/window-listeners";
import { registerBackendListeners } from "./backend/backend-listeners";
import { registerDialogHandlers } from "./dialog-handlers";
import { registerAutoGrpcHandlers } from "../../grpc-auto/auto-ipc-handlers";

/**
 * Registra todos los event listeners IPC en el proceso principal
 * Coordina el registro de listeners para window, theme, backend, auto-gRPC y diálogos
 * @param mainWindow Ventana principal de Electron para manejo de eventos
 */
export default function registerListeners(mainWindow: BrowserWindow) {
  addWindowEventListeners(mainWindow);  // Listeners para manejo de ventanas
  addThemeEventListeners();             // Listeners para cambios de tema
  registerBackendListeners();           // Listeners para comunicación con backend
  registerAutoGrpcHandlers();           // Enhanced auto-generated gRPC handlers with worker threads
  registerDialogHandlers();             // Handlers para diálogos del sistema
}
