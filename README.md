# Aplicación Geoespacial (Electron + React + gRPC Python)

Aplicación de escritorio de alto rendimiento con backend Python gRPC, cliente gRPC en el proceso principal, y procesamiento inteligente (Worker Threads) para datasets masivos sin bloquear la UI.

## Arquitectura (visión general)
- Proceso Principal (Electron): crea la ventana, arranca/parar el backend gRPC (Python), registra IPC auto‑generados y maneja procesamiento pesado con `worker_threads`.
- Preload (contextBridge): expone `window.grpc` tipado y utilidades (progreso amortiguado, fetch de datos del gráfico por chunks).
- Renderer (React): usa solo `window.grpc` para invocar métodos y renderiza UI (Shadcn/Tailwind + ECharts).
- Backend (Python): `grpc_server.py` implementa `GeospatialService` con métodos unary y streaming; `data_generator.py` produce datos sintéticos con NumPy.

### Flujo de datos
1) Renderer llama `window.grpc.getBatchDataOptimized(bounds, types, maxPoints, resolution, onProgress)`.
2) Preload envía una solicitud con `requestId` al main. Para datasets grandes, el main recibe chunks vía gRPC y los procesa en `worker_threads` (reservoir sampling ≤10k puntos + estadísticas). Progreso coalescido cada ~100ms.
3) El main envía “complete” con metadatos y marca `dataReady`. El renderer obtiene luego los puntos de gráfico por chunks pequeños vía `grpc-get-chart-data` para evitar saturar IPC.

## Superficie pública (Preload)
`window.grpc` (simplificado):
- `healthCheck()`
- `helloWorld({ message })`
- `echoParameter({ value, operation })`
- `getFeatures({ bounds, featureTypes, limit })`
- `getBatchDataOptimized(bounds, dataTypes, maxPoints, resolution?, onProgress?, onChunkData?, options?)`
- `getBatchDataChildProcessStreamed(bounds, dataTypes, maxPoints, resolution?, onProgress?)`
- `getBatchDataWorkerStreamed(bounds, dataTypes, maxPoints, resolution?, onProgress?, onChunkData?)` (ruta ligera/legada)
- `stopStream(requestId?)` (cancela una solicitud en curso)

Progreso estándar: `{ processed, total, percentage, phase }`.

### Integrar un método nuevo: Opción A (auto‑generado) vs Opción B (optimizado)

- Opción A — Auto‑generado (sin workers, cero pegamento)
  1. Edita el `.proto` y el backend (`backend/grpc_server.py`).
  2. Ejecuta `npm run generate:protos`.
  3. (Opcional) Expón el cliente auto‑generado en preload para usar `window.autoGrpc`:
     ```ts
     // src/preload.ts
     import { exposeAutoGrpcContext } from './grpc-auto/auto-context';
     exposeAutoGrpcContext(); // ← añade window.autoGrpc.*
     ```
  4. Usa en el renderer:
     ```ts
     const res = await window.autoGrpc.MiMetodo({ ...params });
     ```
  Ventaja: inmediato y sin escribir glue code. Ideal para probar métodos nuevos o respuestas pequeñas/medianas.

- Opción B — Optimizado con workers (alto rendimiento, UX fluida)
  1. Mantén tu RPC como streaming por chunks (estilo `GetBatchDataStreamed`).
  2. En el handler del main, reusa el pipeline existente (worker_threads + progreso coalescido). Si el shape difiere, normaliza cada chunk al contrato `{ data_points: [...] }` antes de `streamer.postChunk(...)`.
  3. En preload, expón `getXyzDataChildProcessStreamed(...)` o incorpora a `getBatchDataOptimized(...)`.
  4. Usa en el renderer solo la ruta optimizada (`window.grpc.getBatchDataOptimized(...)`).
  Ventaja: procesa millones de puntos sin bloquear, con cancelación por `requestId` y transferencia de gráfico por chunks.

Cuándo elegir:
- Elige A si necesitas rapidez para validar/usar un método nuevo sin requisitos de rendimiento fuertes.
- Elige B si manejarás datasets grandes o necesitas progreso/cancelación y UI 100% fluida.

## Estructura del proyecto (resumen)
```
backend/
  grpc_server.py       # Servidor gRPC Python
  data_generator.py    # Generador NumPy
  build_server.py      # PyInstaller
src/
  main.ts              # Proceso principal (IPC + gRPC client + worker_threads)
  preload.ts           # contextBridge (window.grpc)
  components/          # UI (GrpcDemo, ChildProcessVisualization)
  helpers/
    backend_helpers.ts # Arranque/parada backend Python
    mainProcessWorker.ts# Worker Threads (procesamiento pesado)
    ipc/               # Canales y listeners (window/theme/backend)
  grpc-auto/           # Código auto‑generado desde protos
  lib/types.ts         # Tipos y utilidades de resultados
```

## Uso en Renderer
```ts
const bounds = { northeast: { latitude: 37.7849, longitude: -122.4094 }, southwest: { latitude: 37.7749, longitude: -122.4194 } };

// Ruta recomendada (selección inteligente)
const result = await window.grpc.getBatchDataOptimized(
  bounds,
  ['elevation'],
  120_000,
  20,
  (p) => setProgress(p.percentage)
);
```

Utilidades (renderer) para resultados mixtos:
```ts
import { extractTotalProcessed, extractProcessingTimeSeconds, extractPointsPerSecond } from '@/lib/types';
const total = extractTotalProcessed(result);
const secs = extractProcessingTimeSeconds(result);
const pps  = extractPointsPerSecond(result);
```

## Desarrollo
```bash
npm install
npm run setup:backend     # Instala deps Python
npm run dev               # Genera protos y lanza la app (el main arranca el backend)
```
Comandos útiles:
- `npm start` (solo app Electron)
- `npm run dev:backend` (solo servidor Python, opcional)
- `npm run generate:protos` (regenera TS/Python)
- `npm run build:backend` (PyInstaller)
- `npm run make` (paquetes instalables)

## Empaquetado
1) Construye backend Python: `npm run build:backend` (genera `backend/dist/grpc-server`).
2) Empaqueta la app: `npm run make` (Forge incluye `backend/dist/grpc-server` como recurso extra).

## Extender con nuevas funciones pesadas
1) Backend: implementa `GetXyzDataStreamed(request)` que devuelva chunks.
2) Cliente gRPC (main): añade `autoMainGrpcClient.getXyzDataStreamed(request)` siguiendo el patrón existente.
3) Main IPC: crea `grpc-start-xyz-child-process-stream` que consuma chunks gRPC, procese con `MainProcessWorker`, envíe progreso y complete. Para gráficos, devuelve solo metadatos y sirve puntos via `grpc-get-chart-data`.
4) Preload: añade `getXyzDataChildProcessStreamed` y versión `getXyzDataOptimized`.
5) Renderer: usa siempre `getXyzDataOptimized`.

Contrato del Worker genérico:
- Entrada: `chunks[]` con `data_points[]` (lat, lng, value, unit, metadata).
- Salida: `{ stats, chartConfig }` con reservoir sampling (≤10k puntos), bounds y métricas.

### Datos con otra forma (normalización)
Si tu nuevo método del backend devuelve otra estructura (por ejemplo `optimized_points` con lat/lon planos, o campos con otros nombres), normaliza cada chunk al contrato del worker antes de postearlo al procesador:

```ts
// En el handler del main (ej.: 'grpc-start-xyz-child-process-stream')
const streamer = MainProcessWorker.getInstance().startStreamingProcessor(requestId, onProgress);

await autoMainGrpcClient.streamXyzDataIncremental(request, (chunk) => {
  // Normaliza a { data_points: [...] }
  const points = (chunk.optimized_points || chunk.data_points || []).map((p: any) => ({
    location: { latitude: p.latitude ?? p.location?.latitude, longitude: p.longitude ?? p.location?.longitude },
    value: p.value,
    unit: p.unit ?? 'value',
    metadata: { sensor_type: p.generation_method || p.unit || 'custom' }
  }));
  streamer.postChunk({ data_points: points, total_chunks: chunk.total_chunks });
});

const result = await streamer.finalize();
```

Notas:
- Si el resultado no es geoespacial (no hay lat/lon), adapta el worker (ver “Modos de procesamiento” abajo) o construye un `chartConfig` específico para tu visualización (p.ej. series de línea, barras, heatmap).
- Mantén la muestra de gráfico acotada (≤10k puntos) para no bloquear la UI.

### Pasos detallados para añadir un nuevo método
1) Backend (Python)
   - Agrega el RPC al `.proto` y la implementación en `backend/grpc_server.py`.
   - Para grandes volúmenes, usa un método “server_streaming” (chunked) similar a `GetBatchDataStreamed`.

2) Regenerar stubs
   - `npm run generate:protos` (TS + Python).

3) Cliente gRPC (Main)
   - Añade en `auto-main-client.ts` un método `getXyzDataStreamed(request)` o `streamXyzDataIncremental(request, onChunk, requestId?)` copiando el patrón existente (aplicar backpressure y cancelar con `cancelStream`).

4) IPC en Main + Normalización
   - Crea `ipcMain.on('grpc-start-xyz-child-process-stream', ...)`.
   - Dentro, llama a tu `streamXyzDataIncremental` y normaliza cada chunk al contrato `{ data_points: [...] }` antes de `streamer.postChunk(...)`.
   - Envía progreso coalescido con `sendProgressCoalesced` y, al finalizar, guarda `chartConfig.data` en caché y responde con `dataReady: true`.

5) Preload
   - Expón `getXyzDataChildProcessStreamed(bounds, dataTypes, maxPoints, resolution?, onProgress?)` y/o `getXyzDataOptimized(...)` similar a los existentes, reutilizando `fetchChartDataInChunks(requestId)` para traer los puntos de gráfico en trozos pequeños.

6) Renderer (Frontend)
   - Usa siempre la ruta optimizada: `window.grpc.getXyzDataOptimized(...)`.
   - Muestra `progress.percentage` y, al completar, toma métricas uniformes desde `result` (usa helpers de `lib/types.ts`).

### Modos de procesamiento (opcional)
Si vas a soportar tipos de visualización distintos (p.ej., línea/heatmap), puedes:
- Añadir un parámetro `mode` al worker (en `mainProcessWorker.ts`) y ramificar cómo construir `chartConfig` conservando el mismo muestreo/estadísticas.
- O crear otro worker especializado que conserve la misma interfaz de entrada/salida.

## Limpieza y simplificación (resumen)
- Se eliminaron helpers y contextos antiguos (ver CLEANUP_REPORT.md) y se consolidó todo en `window.grpc` y handlers auto-generados.
- Menos archivos que mantener; el `.proto` es fuente de verdad. IPCs para unary/streaming se registran automáticamente.

## Rendimiento y estabilidad
- Límites gRPC altos (hasta 500MB) y compresión GZIP habilitada.
- Backpressure en streaming gRPC y coalescing de progreso (~100ms).
- Datos de gráfico servidos por chunks para evitar bloqueos de IPC.

## Seguridad
- Context Isolation activo y comunicación solo vía IPC seguro.

## Licencia
Apache License 2.0
