import { app, BrowserWindow } from "electron";
import registerListeners from "./helpers/ipc/listeners-register";
import { backendManager } from "./helpers/backend_helpers";
import { grpcClient } from "./grpc/grpc-client";
import * as path from "path";
import {
  installExtension,
  REACT_DEVELOPER_TOOLS,
} from "electron-devtools-installer";

const inDevelopment = process.env.NODE_ENV === "development";

async function createWindow() {
  const preload = path.join(__dirname, "preload.js");
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      devTools: inDevelopment,
      contextIsolation: true,
      nodeIntegration: true,
      nodeIntegrationInSubFrames: false,
      preload: preload,
    },
    titleBarStyle: "default",
    show: false, // Don't show until backend is ready
  });
  
  registerListeners(mainWindow);

  // Load the frontend first - don't wait for backend
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }

  // Show window immediately
  mainWindow.show();

  // Iniciar el backend gRPC en segundo plano
  console.log('Iniciando backend gRPC...');
  backendManager.startBackend()
    .then(() => {
      console.log('gRPC backend iniciado!');
      // Initialize gRPC client after backend is ready
      return grpcClient.initialize();
    })
    .then(() => {
      console.log('gRPC cliente inicializado');
    })
    .catch((error) => {
      console.error('Error al iniciar el backend gRPC o inicializar el cliente:', error);
    });
}

async function installExtensions() {
  try {
    const result = await installExtension(REACT_DEVELOPER_TOOLS);
    console.log(`Extensions installed successfully: ${result.name}`);
  } catch {
    console.error("Failed to install extensions");
  }
}

app.whenReady().then(createWindow).then(installExtensions);




// Handle app shutdown
app.on("before-quit", async (event) => {
  event.preventDefault();
  console.log('Shutting down gRPC backend...');
  await backendManager.stopBackend();
  app.exit(0);
});

//osX only
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
//osX only ends
