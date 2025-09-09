# Geospatial Desktop App (Electron + React + gRPC Python)

This repository contains an example of an application with the purpose of handling high data throughput and visualizing the data.


## Tech stack

Due to having to handle big data fetching, the architecture and technologies used in this app differ from the common JSON + REST pattern we see frequently used in webapps.

### [Protocol Buffers](https://protobuf.dev/)

Instead of using JSON for this application we decide to use Protocol Buffers, a serialization protocol developed by Google. (will be referenced as protobufs from now on)
The decision here is mainly made due to protobuf's binary serialization, which can reduce our data that is being transferred over the network almost 3 times and decrease the time spent parsing the data. (**See test runs**)

Of course, using protobufs has its advantages and disavantages:

1. **Schema definition** We need to define the schema in .proto files, for example, for a simple helloWorld function it would look like this:
```proto
syntax = "proto3";

message HelloWorldRequest {
  string message = 1;
}

message HelloWorldResponse {
  string message = 1;
}
service HelloWorldService {
  rpc HelloWorld(HelloWorldRequest) returns (HelloWorldResponse);
  #
  # Other rpc methods...
  #
}
```
In this case, the request and response specifies what is being sent and received, in this case a string.

2. **Code generation** Protocol buffers need to be compiled so we can use it on our code (In this case, we use ```protoc``` but there are alternatives, like ```buf```)
For example, after compiling the above schema using the following command to compile for typescript ``` protoc --plugin=protoc-gen-ts_proto=./node_modules/.bin/protoc-gen-ts_proto --ts_proto_out="./" --ts_proto_opt=lowerCaseServiceMethods=true,snakeToCamel=false --proto_path= ./protos/myproto.proto ``` will generate a file that the language can use to decode and encode the data.


### [gRPC](https://grpc.io/docs/what-is-grpc/introduction/)




----- README WORK IN PROGRESS ----



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

## 🛡️ Seguridad

### Medidas de Seguridad Implementadas
- **Context Isolation**: Habilitado en Electron para máxima seguridad
- **Secure IPC**: Toda comunicación vía context bridges seguros
- **Process Isolation**: Backend gRPC ejecuta en proceso separado
- **No Remote Access**: gRPC server solo acepta conexiones localhost
- **Type Safety**: Tipos TypeScript auto-generados previenen errores
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

