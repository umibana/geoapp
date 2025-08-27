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
│   │   ├── ChildProcessVisualization.tsx   # Streaming columnar
│   │   ├── ProjectManager.tsx     # Gestión de proyectos
│   │   ├── EnhancedCsvProcessor.tsx # Procesamiento CSV avanzado
│   │   └── ui/                    # Componentes shadcn/ui
│   ├── 🗂️ grpc-auto/             # Sistema auto-generado (Link Electron main <-> renderer)
│   │   ├── auto-grpc-client.ts    # Cliente gRPC para renderer
│   │   ├── auto-ipc-handlers.ts   # Handlers IPC para main process
│   │   ├── auto-main-client.ts    # Cliente gRPC para main process
│   │   └── auto-context.ts        # Context bridge auto-generado
│   ├── 🗂️ helpers/               # Utilidades y helpers
│   │   ├── backend_helpers.ts     # Gestión del proceso backend Python
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
- **✅ Caché de Gráficos**: Transferencia eficiente de datos de visualización
- **✅ Compresión gRPC**: Transferencia optimizada de datos
- **✅ Sampling Inteligente**: Máximo 10K puntos para gráficos manteniendo representatividad

### Benchmarks Típicos
- **100K puntos**: ~0.5s (streaming columnar)
- **1M puntos**: ~2-3s (streaming columnar)

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

