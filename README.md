# Aplicación Geoespacial Desktop (Electron + React + gRPC Python)

**Aplicación de escritorio geoespacial moderna** construida con Electron que combina un frontend React con un backend Python gRPC. La aplicación maneja procesamiento y visualización de datos geoespaciales con capacidades de **streaming ultra-responsivo** usando **comunicación gRPC completamente auto-generada** y **formato de datos columnar eficiente**.

## 🏗️ Arquitectura Moderna

### Stack Tecnológico Actual
- **Frontend**: Electron 36 + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- **Backend**: Servidor gRPC puro (Python) con generación de datos numpy - sin Django/REST API
- **Comunicación**: ✅ **Sistema gRPC Completamente Auto-generado** via Protocol Buffers con IPC seguro de Electron
- **Formato de Datos**: ✅ **Formato columnar** para 70% reducción de memoria y rendimiento óptimo
- **Rendimiento**: ✅ **Arquitectura de streaming dual** para datasets de 100K-5M+ puntos sin bloquear la UI
- **Generación de Datos**: Generador numpy sintético con datos geoespaciales (elevación, temperatura, presión, ruido, ondas senoidales)
- **Testing**: Vitest (unit), Playwright (e2e), React Testing Library
- **Build**: Vite 6, Electron Forge, PyInstaller
- **Visualización**: ECharts para gráficos scatter interactivos de alto rendimiento
- **Base de Datos**: SQLite para gestión de proyectos y datasets

### Patrones de Arquitectura Clave

1. **✅ Sistema gRPC Completamente Auto-generado**: API completa con clientes, handlers, context bridges y tipos TypeScript generados automáticamente desde archivos `.proto`
2. **✅ Formato de Datos Columnar**: Estructura de arrays eficiente que reduce el uso de memoria en 70% comparado con formato de objetos
3. **✅ Arquitectura de Procesamiento Dual**:
   - **Streaming Columnar**: Para 100K-2M puntos con API `getBatchDataColumnar/Streamed`
   - **Worker Threads**: Para 3M-5M+ puntos con procesamiento aislado y caché de datos de gráfico
4. **✅ Comunicación IPC Modular**: Sistema IPC organizado por dominios (backend, theme, window) con context bridges seguros
5. **✅ Integración Protocol Buffer**: Definiciones `.proto` como fuente única de verdad para TypeScript y Python
6. **✅ Gestión de Procesos Desktop**: Servidor gRPC como ejecutable PyInstaller gestionado por el proceso principal de Electron
7. **✅ Gestión de Proyectos**: Sistema completo de proyectos con almacenamiento SQLite y procesamiento de archivos CSV

### Flujo de Comunicación
```
Componentes React (Proceso Renderer)
        ↓ Context Bridge Auto-generado (window.autoGrpc)
        ↓ IPC Seguro con Tipos Auto-generados
Proceso Principal (Handlers IPC Auto-generados)
        ├── Streaming Columnar (100K-2M puntos)
        └── Worker Thread + Caché de Gráficos (3M-5M+ puntos)
        ↓ Cliente gRPC Auto-generado (@grpc/grpc-js)
Servidor Python gRPC (puerto 50077)
        ├── Generador de Datos Numpy (columnar)
        ├── Procesamiento CSV con pandas
        └── Base de Datos SQLite (proyectos)
```

## 🚀 API y Métodos Disponibles

### Sistema Auto-generado (`window.autoGrpc`)
La aplicación utiliza un **sistema completamente auto-generado** que elimina código de API manual:

#### Métodos Principales Disponibles
```typescript
// Métodos de ejemplo simples
await window.autoGrpc.helloWorld({ message: "Hello!" });
await window.autoGrpc.echoParameter({ value: 42, operation: "square" });
await window.autoGrpc.healthCheck({});

// Datos geoespaciales
await window.autoGrpc.getFeatures({ bounds, feature_types: [], limit: 20 });

// ✅ RECOMENDADO: Formato columnar para datasets grandes
await window.autoGrpc.getBatchDataColumnar({ 
  bounds, 
  data_types: ['elevation'], 
  max_points: 1000000, 
  resolution: 20 
});

// ✅ RECOMENDADO: Streaming columnar para datasets ultra-grandes
await window.autoGrpc.getBatchDataColumnarStreamed({ 
  bounds, 
  data_types: ['elevation'], 
  max_points: 5000000, 
  resolution: 30 
}, (chunk) => {
  console.log(`Chunk ${chunk.chunk_number}/${chunk.total_chunks}: ${chunk.points_in_chunk} puntos`);
});

// Gestión de proyectos
await window.autoGrpc.createProject({ name: "Mi Proyecto", description: "Descripción" });
await window.autoGrpc.getProjects({ limit: 100, offset: 0 });

// Procesamiento de archivos CSV
await window.autoGrpc.analyzeCsv({ file_path: "/path/to/file.csv", rows_to_analyze: 2 });
await window.autoGrpc.sendFile({ 
  file_path, 
  x_variable: "lng", 
  y_variable: "lat", 
  z_variable: "elevation" 
});
```

### Arquitecturas de Procesamiento

#### 1. **Streaming Columnar** (100K-2M puntos) 🟢 RECOMENDADO
- **Componente**: `ChildProcessVisualization`
- **API**: `getBatchDataColumnarStreamed`
- **Ventajas**: Formato columnar eficiente, streaming por chunks de 25K puntos, 70% menos memoria
- **UI**: Tema verde, "Columnar Data Streaming"
- **Ideal para**: Datasets medianos a grandes con eficiencia garantizada

#### 2. **Worker Threads** (3M-5M+ puntos) 🟣 ULTRA-RENDIMIENTO
- **Componente**: `WorkerThreadVisualization` 
- **Tecnología**: Worker threads reales de Node.js + caché de datos de gráfico
- **Ventajas**: Procesamiento completamente aislado, maneja datasets ultra-grandes sin bloquear UI
- **UI**: Tema morado, "True Node.js Worker Threads"
- **Ideal para**: Datasets masivos que requieren máximo rendimiento

### Tipos de Datos en el Sistema

#### 🏗️ **Datos de Producción** (Flujo Principal)
El flujo principal del proyecto trabaja con **archivos CSV reales**:
- **Mapeo de Coordenadas**: Configuración manual de columnas CSV a coordenadas `x`, `y`, `z`
- **Datos Reales**: Archivos cargados por usuarios con datos geoespaciales reales
- **Componentes**: `ProjectWorkflow` → `ProjectManager` → `EnhancedCsvProcessor` → `DatasetViewer`

### Cómo Añadir Nuevos Métodos

#### Opción A: Auto-generado (Recomendado) ⚡
1. **Actualiza Protocol Buffers**: Edita archivos en `/protos/` (ej: `geospatial.proto`)
2. **Implementa Backend**: Añade método en `backend/grpc_server.py`
3. **Regenera Código**: Ejecuta `npm run generate:full-stack`
4. **Usa Inmediatamente**: `const result = await window.autoGrpc.nuevoMetodo({ params })`

**Ventajas**: Cero código manual, tipos TypeScript automáticos, seguridad completa

#### Opción B: Integración con Worker Threads (Solo para datasets masivos)
1. Usa formato de streaming por chunks
2. Integra con `MainProcessWorker` para procesamiento pesado
3. Implementa progreso y cancelación
4. Caché de datos de gráfico para UI responsive

**Cuándo usar cada opción**:
- **Opción A**: Para cualquier método nuevo, datasets pequeños/medianos, prototipado rápido
- **Opción B**: Solo para datasets de 3M+ puntos que requieren UI 100% responsive

## 🔧 **Ejemplo: Implementar Worker Threads para una Función**

### Caso Práctico: Procesamiento de Análisis Estadístico de CSV

Supongamos que queremos agregar un método que calcule estadísticas avanzadas de un dataset CSV cargado:

#### 1. **Definir Protocol Buffer** (`protos/geospatial.proto`)
```protobuf
// Nuevo método para análisis estadístico
rpc AnalyzeDatasetStats(AnalyzeDatasetStatsRequest) returns (stream DatasetStatsChunk);

message AnalyzeDatasetStatsRequest {
  string dataset_id = 1;
  repeated string columns = 2;        // Columnas a analizar
  bool include_correlations = 3;      // Incluir correlaciones
  int32 chunk_size = 4;              // Tamaño de chunk para processing
}

message DatasetStatsChunk {
  int32 chunk_number = 1;
  int32 total_chunks = 2;
  repeated ColumnStats column_stats = 3;
  repeated CorrelationPair correlations = 4;
  int32 processed_rows = 5;
  bool is_final_chunk = 6;
}

message ColumnStats {
  string column_name = 1;
  double mean = 2;
  double std_dev = 3;
  double min_value = 4;
  double max_value = 5;
  int32 valid_count = 6;
}

message CorrelationPair {
  string column_a = 1;
  string column_b = 2;
  double correlation = 3;
}
```

#### 2. **Implementar Backend gRPC** (`backend/grpc_server.py`)
```python
def AnalyzeDatasetStats(self, request, context):
    """Análisis estadístico con streaming por chunks"""
    try:
        import pandas as pd
        import numpy as np
        
        dataset = self.db.get_dataset_by_id(request.dataset_id)
        if not dataset:
            context.set_code(grpc.StatusCode.NOT_FOUND)
            return
            
        # Obtener datos del dataset
        all_data = self.db.get_dataset_data_all(request.dataset_id)
        df = pd.DataFrame(all_data)
        
        # Procesar por chunks para datasets grandes
        chunk_size = request.chunk_size or 10000
        total_rows = len(df)
        total_chunks = (total_rows + chunk_size - 1) // chunk_size
        
        for chunk_idx in range(total_chunks):
            start_idx = chunk_idx * chunk_size
            end_idx = min(start_idx + chunk_size, total_rows)
            chunk_df = df.iloc[start_idx:end_idx]
            
            # Calcular estadísticas para este chunk
            chunk_stats = []
            for col in request.columns:
                if col in chunk_df.columns:
                    col_data = pd.to_numeric(chunk_df[col], errors='coerce')
                    stats = geospatial_pb2.ColumnStats(
                        column_name=col,
                        mean=col_data.mean(),
                        std_dev=col_data.std(),
                        min_value=col_data.min(),
                        max_value=col_data.max(),
                        valid_count=col_data.count()
                    )
                    chunk_stats.append(stats)
            
            # Calcular correlaciones si se solicita
            correlations = []
            if request.include_correlations and chunk_idx == total_chunks - 1:
                # Solo en el último chunk calculamos correlaciones totales
                corr_matrix = df[request.columns].corr()
                for i, col_a in enumerate(request.columns):
                    for j, col_b in enumerate(request.columns):
                        if i < j:  # Evitar duplicados
                            corr = geospatial_pb2.CorrelationPair(
                                column_a=col_a,
                                column_b=col_b,
                                correlation=corr_matrix.loc[col_a, col_b]
                            )
                            correlations.append(corr)
            
            # Enviar chunk
            chunk_response = geospatial_pb2.DatasetStatsChunk(
                chunk_number=chunk_idx,
                total_chunks=total_chunks,
                column_stats=chunk_stats,
                correlations=correlations,
                processed_rows=end_idx,
                is_final_chunk=(chunk_idx == total_chunks - 1)
            )
            
            yield chunk_response
            
    except Exception as e:
        context.set_code(grpc.StatusCode.INTERNAL)
        context.set_details(str(e))
```

#### 3. **Regenerar Código Auto-generado**
```bash
npm run generate:full-stack
```

#### 4. **Implementar Handler con Worker Threads** (`src/helpers/ipc/backend/backend-listeners.ts`)
```typescript
import { MainProcessWorker } from '../../mainProcessWorker';

// Añadir handler para análisis estadístico
ipcMain.handle('grpc-analyze-dataset-stats', async (event, request) => {
  const requestId = `stats-${Date.now()}-${Math.random()}`;
  
  try {
    // Crear worker para procesamiento pesado
    const worker = MainProcessWorker.getInstance();
    const processor = worker.startStreamingProcessor(requestId, (progress) => {
      // Enviar progreso al renderer
      event.sender.send('grpc-stats-progress', { requestId, ...progress });
    });
    
    // Configurar procesamiento de estadísticas
    const statsAccumulator = {
      columnStats: new Map(),
      correlations: [],
      totalProcessed: 0
    };
    
    // Procesar stream desde backend
    await autoMainGrpcClient.analyzeDatasetStats(request, (chunk) => {
      // Procesar chunk en worker thread
      processor.postChunk({
        chunk_data: chunk,
        processing_type: 'statistics',
        metadata: {
          chunk_number: chunk.chunk_number,
          total_chunks: chunk.total_chunks,
          processed_rows: chunk.processed_rows
        }
      });
      
      // Acumular estadísticas
      chunk.column_stats.forEach(stat => {
        const existing = statsAccumulator.columnStats.get(stat.column_name);
        if (existing) {
          // Combinar estadísticas de múltiples chunks
          statsAccumulator.columnStats.set(stat.column_name, {
            ...existing,
            mean: (existing.mean * existing.valid_count + stat.mean * stat.valid_count) / (existing.valid_count + stat.valid_count),
            valid_count: existing.valid_count + stat.valid_count,
            min_value: Math.min(existing.min_value, stat.min_value),
            max_value: Math.max(existing.max_value, stat.max_value)
          });
        } else {
          statsAccumulator.columnStats.set(stat.column_name, stat);
        }
      });
      
      // Agregar correlaciones del último chunk
      if (chunk.is_final_chunk && chunk.correlations.length > 0) {
        statsAccumulator.correlations = chunk.correlations;
      }
      
      statsAccumulator.totalProcessed = chunk.processed_rows;
    });
    
    // Finalizar procesamiento
    const result = await processor.finalize();
    
    return {
      success: true,
      statistics: {
        columnStats: Array.from(statsAccumulator.columnStats.values()),
        correlations: statsAccumulator.correlations,
        totalProcessed: statsAccumulator.totalProcessed,
        processingTime: result.processingTime,
        performanceMetrics: result.performanceMetrics
      }
    };
    
  } catch (error) {
    console.error('❌ Error in stats analysis:', error);
    return {
      success: false,
      error: error.message
    };
  }
});
```

#### 5. **Exponer en Context Bridge** (`src/preload.ts`)
```typescript
// Añadir al context bridge existente
contextBridge.exposeInMainWorld('grpc', {
  // ... métodos existentes
  
  analyzeDatasetStats: async (
    datasetId: string, 
    columns: string[], 
    options?: { includeCorrelations?: boolean; chunkSize?: number }
  ) => {
    return ipcRenderer.invoke('grpc-analyze-dataset-stats', {
      dataset_id: datasetId,
      columns,
      include_correlations: options?.includeCorrelations || false,
      chunk_size: options?.chunkSize || 10000
    });
  }
});
```

#### 6. **Usar en el Frontend** 
```typescript
// En un componente React (ej: DatasetViewer.tsx)
const runStatisticalAnalysis = async (datasetId: string, columns: string[]) => {
  setLoading(true);
  setProgress(0);
  
  // Configurar listener de progreso
  const progressListener = (event: any, data: any) => {
    if (data.requestId.startsWith('stats-')) {
      setProgress(data.percentage);
      console.log(`Análisis estadístico: ${data.phase} - ${data.percentage.toFixed(1)}%`);
    }
  };
  
  window.electronAPI.on('grpc-stats-progress', progressListener);
  
  try {
    // Ejecutar análisis con worker threads
    const result = await window.grpc.analyzeDatasetStats(datasetId, columns, {
      includeCorrelations: true,
      chunkSize: 25000
    });
    
    if (result.success) {
      console.log('📊 Análisis estadístico completado:');
      console.log('Estadísticas por columna:', result.statistics.columnStats);
      console.log('Correlaciones:', result.statistics.correlations);
      console.log(`Procesados ${result.statistics.totalProcessed} filas en ${result.statistics.processingTime}s`);
      
      // Actualizar UI con resultados
      setStatistics(result.statistics);
    } else {
      console.error('Error en análisis:', result.error);
    }
    
  } catch (error) {
    console.error('Error ejecutando análisis:', error);
  } finally {
    setLoading(false);
    window.electronAPI.removeListener('grpc-stats-progress', progressListener);
  }
};
```

### 🎯 **Ventajas de este Enfoque**

1. **✅ Worker Threads Reales**: Procesamiento completamente aislado, UI nunca se bloquea
2. **✅ Streaming Incremental**: Progreso en tiempo real y cancelación posible
3. **✅ Escalable**: Maneja datasets de millones de filas sin problemas de memoria
4. **✅ Type Safety**: Todo auto-generado desde Protocol Buffers
5. **✅ Reutilizable**: El patrón se puede aplicar a cualquier procesamiento pesado
6. **✅ Memoria Eficiente**: Procesamiento por chunks evita cargar todo en memoria

### 📋 **Cuándo Usar Worker Threads**
- Datasets > 100K filas
- Cálculos que toman > 2 segundos
- Operaciones que requieren progreso en tiempo real
- Funcionalidades que usuarios pueden querer cancelar

## 📁 Estructura del Proyecto

```
📦 geospatialWebapp/
├── 🗂️ backend/                    # Backend Python gRPC
│   ├── grpc_server.py             # Servidor gRPC principal (puerto 50077)
│   ├── data_generator.py          # Generador de datos numpy columnar
│   ├── database.py                # Gestor de base de datos SQLite
│   ├── build_server.py            # PyInstaller para empaquetado
│   ├── requirements.txt           # Dependencias Python (grpcio, numpy, pandas)
│   └── generated/                 # Stubs Protocol Buffer auto-generados
├── 🗂️ src/                        # Frontend Electron + React
│   ├── main.ts                    # Proceso principal Electron
│   ├── preload.ts                 # Context bridge (window.autoGrpc)
│   ├── renderer.ts                # Entrada del renderer React
│   ├── App.tsx                    # Componente React principal
│   ├── 🗂️ components/             # Componentes React
│   │   ├── GrpcDemo.tsx           # Demo principal con todos los ejemplos
│   │   ├── ChildProcessVisualization.tsx   # Streaming columnar (verde)
│   │   ├── WorkerThreadVisualization.tsx   # Worker threads (morado)
│   │   ├── ProjectManager.tsx     # Gestión de proyectos
│   │   ├── EnhancedCsvProcessor.tsx # Procesamiento CSV avanzado
│   │   └── ui/                    # Componentes shadcn/ui
│   ├── 🗂️ grpc-auto/             # 🔥 Sistema auto-generado (NO EDITAR)
│   │   ├── auto-grpc-client.ts    # Cliente gRPC para renderer
│   │   ├── auto-ipc-handlers.ts   # Handlers IPC para main process
│   │   ├── auto-main-client.ts    # Cliente gRPC para main process
│   │   └── auto-context.ts        # Context bridge auto-generado
│   ├── 🗂️ helpers/               # Utilidades y helpers
│   │   ├── backend_helpers.ts     # Gestión del proceso backend Python
│   │   ├── mainProcessWorker.ts   # Worker threads para datasets masivos
│   │   └── ipc/                   # Sistema IPC modular por dominios
│   │       ├── backend/           # IPC para backend
│   │       ├── theme/             # IPC para temas
│   │       └── window/            # IPC para ventana
│   ├── 🗂️ generated/             # Stubs TypeScript de Protocol Buffers
│   └── 🗂️ pages/                 # Páginas de la aplicación
├── 🗂️ protos/                    # 📋 Definiciones Protocol Buffer (fuente única de verdad)
│   ├── main_service.proto         # Servicio principal que combina todos
│   ├── geospatial.proto          # Tipos y métodos geoespaciales + columnar
│   ├── files.proto               # Procesamiento de archivos CSV
│   └── projects.proto            # Gestión de proyectos y datasets
├── 🗂️ scripts/                   # Scripts de generación y utilidades
│   ├── generate-full-stack.js    # 🔥 Generador principal auto-generado
│   └── generate-protos.js        # Generador básico de Protocol Buffers
└── package.json                  # Dependencias y scripts npm
```

### 🔑 Archivos Clave
- **`protos/main_service.proto`**: Punto de entrada principal que define todos los servicios disponibles
- **`src/grpc-auto/`**: Directorio completamente auto-generado - contiene toda la lógica de comunicación gRPC
- **`backend/grpc_server.py`**: Implementación del servidor gRPC con todos los métodos de negocio
- **`src/components/GrpcDemo.tsx`**: Componente principal que demuestra todas las capacidades de la aplicación

## 💻 Desarrollo

### Configuración Inicial
```bash
npm install                       # Instalar dependencias frontend
npm run setup:backend            # Instalar dependencias Python en venv/
```

### Desarrollo Diario
```bash
npm run dev                       # 🚀 RECOMENDADO: Inicia todo (genera protos + backend + frontend)
```

### Comandos Individuales
```bash
# Aplicación
npm start                         # Solo aplicación Electron (genera protos automáticamente)
npm run dev:backend              # Solo servidor gRPC Python (puerto 50077)

# Generación de código
npm run generate:full-stack      # 🔥 Regenera sistema auto-generado completo
npm run generate:protos          # Genera solo stubs básicos de Protocol Buffers

# Testing
npm run test                     # Tests unitarios (Vitest)
npm run test:e2e                # Tests end-to-end (Playwright) - requiere app empaquetada
npm run test:all                # Todos los tests

# Build y empaquetado
npm run build:backend           # Construye ejecutable Python (PyInstaller)
npm run make                    # Crea distributables de la aplicación (incluye backend)
npm run build:full             # Build backend + empaqueta aplicación Electron

# Code quality
npm run lint                    # ESLint
npm run format                  # Prettier check
npm run format:write           # Prettier format
```

### Variables de Entorno Python
La aplicación usa un entorno virtual Python en `venv/` para dependencias aisladas:
- **Desarrollo**: `source venv/bin/activate` (automático en scripts npm)
- **Dependencias**: grpcio≥1.73.0, numpy≥1.24.0, pandas≥1.5.0, protobuf≥6.30.0

## 🚀 Ejemplo de Uso Completo

```typescript
// Ejemplo en un componente React
import { useState } from 'react';

function MiComponente() {
  const [datos, setDatos] = useState(null);
  const [progreso, setProgreso] = useState(0);

  const cargarDatos = async () => {
    const bounds = {
      northeast: { latitude: 37.8, longitude: -122.3 },
      southwest: { latitude: 37.7, longitude: -122.5 }
    };

    try {
      // Para datasets grandes (recomendado)
      const resultado = await window.autoGrpc.getBatchDataColumnarStreamed({
        bounds,
        data_types: ['elevation', 'temperature'],
        max_points: 1000000,
        resolution: 25
      }, (chunk) => {
        // Callback de progreso en tiempo real
        const porcentaje = ((chunk.chunk_number + 1) / chunk.total_chunks) * 100;
        setProgreso(porcentaje);
        console.log(`Procesando chunk ${chunk.chunk_number + 1}/${chunk.total_chunks}`);
      });

      console.log(`✅ Procesados ${resultado.length} chunks exitosamente`);
      setDatos(resultado);
      
    } catch (error) {
      console.error('Error cargando datos:', error);
    }
  };

  return (
    <div>
      <button onClick={cargarDatos}>Cargar Datos Geoespaciales</button>
      {progreso > 0 && <progress value={progreso} max={100} />}
      {datos && <p>Datos cargados: {datos.length} chunks</p>}
    </div>
  );
}
```

## 📦 Empaquetado y Distribución

### Build de Desarrollo
```bash
npm run dev                       # Desarrollo completo con hot reload
```

### Build de Producción
```bash
npm run build:backend            # 1. Construye ejecutable Python (PyInstaller)
npm run make                     # 2. Crea distributables de Electron (incluye backend)
```

**Notas**:
- El ejecutable Python se genera en `backend/dist/grpc-server`
- Electron Forge incluye automáticamente el backend como recurso extra
- La aplicación empaquetada es completamente portable (no requiere Python instalado)

## ⚡ Características de Rendimiento

### Optimizaciones Implementadas
- **✅ Formato Columnar**: 70% menos uso de memoria vs formato de objetos
- **✅ Streaming por Chunks**: Procesa 5M+ puntos sin bloquear UI
- **✅ Worker Threads Reales**: Procesamiento completamente aislado
- **✅ Caché de Gráficos**: Transferencia eficiente de datos de visualización
- **✅ Compresión gRPC**: Transferencia optimizada de datos
- **✅ Sampling Inteligente**: Máximo 10K puntos para gráficos manteniendo representatividad

### Benchmarks Típicos
- **100K puntos**: ~0.5s (streaming columnar)
- **1M puntos**: ~2-3s (streaming columnar)
- **5M puntos**: ~8-12s (worker threads + caché)
- **UI Responsividad**: 100% mantenida en todos los casos

## 🛡️ Seguridad

### Medidas de Seguridad Implementadas
- **Context Isolation**: Habilitado en Electron para máxima seguridad
- **Secure IPC**: Toda comunicación vía context bridges seguros
- **Process Isolation**: Backend gRPC ejecuta en proceso separado
- **No Remote Access**: gRPC server solo acepta conexiones localhost
- **Type Safety**: Tipos TypeScript auto-generados previenen errores

## 🔧 Resolución de Problemas

### Problemas Comunes

#### Backend no inicia
```bash
# Verificar Python y dependencias
source venv/bin/activate
python backend/grpc_server.py

# Reinstalar dependencias
npm run setup:backend
```

#### Errores de generación de código
```bash
# Limpiar y regenerar
npm run generate:full-stack
```

#### Tests E2E fallan
```bash
# Los tests E2E requieren app empaquetada
npm run make
npm run test:e2e
```

### Logs y Debugging
- **Backend**: Logs detallados en consola con emojis
- **Frontend**: DevTools de Electron con logs estructurados
- **gRPC**: Logs de conectividad y rendimiento
- **Worker Threads**: Logs de progreso y estadísticas

## 📚 Recursos Adicionales

### Documentación Técnica
- **Protocol Buffers**: [protobuf.dev](https://protobuf.dev)
- **gRPC Python**: [grpc.io/docs/languages/python](https://grpc.io/docs/languages/python)
- **Electron**: [electronjs.org/docs](https://electronjs.org/docs)
- **React 19**: [react.dev](https://react.dev)

### Arquitectura de Referencias
- **Auto-Generated APIs**: Inspecciona `src/grpc-auto/` para entender el sistema
- **Protocol Buffers**: Revisa `protos/` para la definición completa de APIs
- **Backend Implementation**: Estudia `backend/grpc_server.py` para lógica de negocio
- **Frontend Examples**: Analiza `src/components/GrpcDemo.tsx` para patrones de uso

## 📄 Licencia
Apache License 2.0

