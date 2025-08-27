import { exposeThemeContext } from "./theme/theme-context";
import { exposeWindowContext } from "./window/window-context";
import { exposeBackendContext } from "./backend/backend-context";
import { exposeAutoGrpcContext } from "../../grpc-auto/auto-grpc-context";

/**
 * Expone todos los contextos IPC al proceso renderer
 * Coordina la exposición de contextos de window, theme, backend y auto-gRPC
 * Esta función se ejecuta en el preload script para configurar el context bridge
 */
export default function exposeContexts() {
  exposeWindowContext();     // Contexto para manejo de ventanas
  exposeThemeContext();      // Contexto para manejo de temas
  exposeBackendContext();    // Contexto para comunicación con backend
  exposeAutoGrpcContext();   // Contexto para API gRPC auto-generada
}
