import { spawn, ChildProcess } from 'child_process';
import path from 'path';

/**
 * Configuración del backend gRPC
 * Mantiene el estado del proceso del servidor gRPC
 */
interface BackendConfig {
  process: ChildProcess | null;  // Proceso hijo del servidor gRPC
  isRunning: boolean;           // Estado de ejecución del backend
}

/**
 * Gestor del backend gRPC
 * Maneja el ciclo de vida del servidor gRPC Python incluyendo inicio,
 * parada, verificación de salud y manejo de procesos
 */
class BackendManager {
  private config: BackendConfig = {
    process: null,
    isRunning: false,
  };

  /**
   * Obtiene la ruta del ejecutable del backend
   * En desarrollo: usa el script Python directamente
   * En producción: usa el ejecutable empaquetado con PyInstaller
   */
  private getBackendPath(): string {
    const isDev = process.env.NODE_ENV === 'development';
    
    if (isDev) {
      // En desarrollo: usar Python directamente
      return path.join(process.cwd(), 'backend', 'grpc_server.py');
    } else {
      // En producción: usar el ejecutable empaquetado
      const resourcesPath = process.resourcesPath;
      return path.join(resourcesPath, 'grpc-server', 'grpc-server');
    }
  }

  /**
   * Espera a que el servidor gRPC esté listo para recibir conexiones
   * Utiliza backoff exponencial para verificar la conectividad
   * @param timeoutMs Tiempo límite en milisegundos (por defecto 15 segundos)
   */
  private async waitForGrpcServer(timeoutMs = 15000): Promise<void> {
    const start = Date.now();
    let delay = 150;
    const maxDelay = 1000;
    const address = '127.0.0.1:50077';
    const net = await import('net');

    while (Date.now() - start < timeoutMs) {
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
      const isOpen = await new Promise<boolean>((resolve) => {
        const socket = new net.Socket();
        socket.setTimeout(1000);
        socket.once('connect', () => { socket.destroy(); resolve(true); });
        socket.once('timeout', () => { socket.destroy(); resolve(false); });
        socket.once('error', () => { socket.destroy(); resolve(false); });
        const [host, portStr] = address.split(':');
        socket.connect(Number(portStr), host);
      });
      if (isOpen) {
        console.log(`✅ gRPC server is listening on ${address}`);
        return;
      }
      delay = Math.min(maxDelay, Math.floor(delay * 1.7));
    }
    throw new Error(`Tiempo agotado esperando al servidor gRPC en ${address}`);
  }

  /**
   * Inicia el backend gRPC
   * Maneja tanto el modo desarrollo (Python) como producción (ejecutable)
   * Incluye verificación de salud y manejo de errores
   */
  async startBackend(): Promise<void> {
    if (this.config.isRunning) {
      return;
    }

    try {
      // Limpiar cualquier proceso existente primero
      await this.stopBackend();

      const isDev = process.env.NODE_ENV === 'development';
      const backendPath = this.getBackendPath();

      console.log('Iniciando backend gRPC...', { isDev, backendPath });

      // Asegurar que estamos en el directorio correcto
      const cwd = isDev ? path.join(process.cwd(), 'backend') : path.dirname(backendPath);
      
      if (isDev) {
        // En desarrollo: ejecutar el servidor gRPC directamente
        this.config.process = spawn('python', ['grpc_server.py'], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: cwd,
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });
      } else {
        // En producción: ejecutar el ejecutable
        this.config.process = spawn(backendPath, [], {
          stdio: ['pipe', 'pipe', 'pipe'],
          cwd: cwd,
        });
      }

      let errorOutput = '';

      // Manejar eventos del proceso
      this.config.process.stdout?.on('data', (data) => {
        const output = data.toString();
        console.log(`gRPC stdout: ${output}`);
      });

      this.config.process.stderr?.on('data', (data) => {
        const output = data.toString();
        console.error(`gRPC stderr: ${output}`);
        errorOutput += output;
      });

      this.config.process.on('close', (code) => {
        console.log(`gRPC process exited with code ${code}`);
        if (errorOutput) {
          console.error('gRPC process error output:', errorOutput);
        }
        this.config.isRunning = false;
        this.config.process = null;
      });

      this.config.process.on('error', (error) => {
        console.error('Failed to start gRPC process:', error);
        this.config.isRunning = false;
        this.config.process = null;
        throw error;
      });

      // Esperar a que inicie el servidor gRPC
      console.log('Esperando a que inicie el servidor gRPC...');
      await this.waitForGrpcServer(15000); // 15 seconds timeout
      
      // Dar un momento al servidor para inicializar completamente
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      this.config.isRunning = true;
      console.log(`Backend gRPC iniciado exitosamente en puerto 50077`);

    } catch (error) {
      console.error('Error iniciando backend gRPC:', error);
      this.config.isRunning = false;
      this.config.process = null;
      throw error;
    }
  }

  /**
   * Detiene el backend gRPC de forma elegante
   * Envía SIGTERM primero, luego SIGKILL si es necesario
   * Incluye tiempo de gracia para cierre elegante
   */
  async stopBackend(): Promise<void> {
    const proc = this.config.process;
    if (!proc || !this.config.isRunning) {
      return;
    }
    console.log('Deteniendo backend gRPC...');
    try {
      proc.kill('SIGTERM');
    } catch (err) {
      console.warn('SIGTERM send failed (ignored):', err);
    }
    // Esperar salida elegante hasta 5 segundos
    const start = Date.now();
    while (Date.now() - start < 5000) {
      if (proc.killed) break;
      await new Promise((r) => setTimeout(r, 150));
    }
    if (!proc.killed) {
      try { proc.kill('SIGKILL'); } catch (err) { console.warn('SIGKILL send failed (ignored):', err); }
    }
    this.config.isRunning = false;
    this.config.process = null;
  }

  /**
   * Verifica la salud del backend
   * @returns true si el backend está funcionando
   */
  async healthCheck(): Promise<boolean> {
    return this.config.isRunning;
  }

  /**
   * Obtiene la URL del backend
   * gRPC no tiene una URL como REST API, pero devolvemos la dirección del servidor como referencia
   * @returns Dirección del servidor gRPC o null si no está funcionando
   */
  getBackendUrl(): string | null {
    if (this.config.isRunning) {
      return 'grpc://127.0.0.1:50077';
    }
    return null;
  }

  /**
   * Verifica si el backend está ejecutándose
   * @returns true si el backend está activo
   */
  isBackendRunning(): boolean {
    return this.config.isRunning;
  }
}

// Exportar instancia singleton
export const backendManager = new BackendManager();

// Funciones de conveniencia para uso externo
/**
 * Inicia el backend gRPC
 * Función de conveniencia que utiliza la instancia singleton
 */
export async function startGrpcBackend() {
  return await backendManager.startBackend();
}

/**
 * Detiene el backend gRPC
 * Función de conveniencia que utiliza la instancia singleton
 */
export async function stopGrpcBackend() {
  return await backendManager.stopBackend();
}

/**
 * Obtiene la URL del backend gRPC
 * Función de conveniencia que utiliza la instancia singleton
 */
export async function getBackendUrl() {
  return backendManager.getBackendUrl();
}

/**
 * Verifica si el backend está saludable
 * Función de conveniencia que utiliza la instancia singleton
 */
export async function isBackendHealthy() {
  return await backendManager.healthCheck();
}