# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Very important notes
- NEVER, under any circustances, modify a file inside the ~/generated folder. Those files will always be re-generated so modifying them is a waste of time.
- You WILL always uso Protocol Buffers for communication between backend and frontend. You WILL NEVER use JSON.

## Architecture Overview

This is a **desktop geospatial application** built with Electron that combines a React frontend with a Python gRPC backend. The application handles geospatial data processing and visualization with a **simplified, unified backend architecture** using **auto-generated gRPC communication** and **streamlined data format**.

### Tech Stack
- **Frontend**: Electron 36 + React 19 + TypeScript + Tailwind CSS 4 + shadcn/ui
- **Backend**: **Unified gRPC server** (Python) with SQLite database (SQLModel ORM) + streamlined numpy data generation
- **Communication**: ✅ **Auto-generated gRPC API** via Protocol Buffers with secure Electron IPC
- **Data Format**: ✅ **Flat array format** `[x1,y1,z1, x2,y2,z2, ...]` for efficient Protocol Buffer transmission
- **Architecture**: ✅ **Single service pattern** - all functionality consolidated into one `GeospatialService`
- **Data Generation**: **Streamlined numpy-based** synthetic geospatial data generation
- **Project Management**: **Centralized** project, file, and dataset management via `ProjectManager` class
- **Testing**: Vitest (unit), Playwright (e2e), React Testing Library
- **Build**: Vite 6, Electron Forge, PyInstaller

### Key Architecture Patterns

1. **✅ Auto-Generated gRPC API**: Complete type safety with auto-generated clients, handlers, and contexts
2. **✅ Unified Service Architecture**: Single `GeospatialService` consolidates all backend functionality
3. **✅ Flat Array Data Format**: Efficient `[x1,y1,z1, x2,y2,z2, ...]` format for Protocol Buffer transmission
4. **✅ Centralized Project Management**: All project, file, and dataset operations handled by `ProjectManager`
5. **✅ Secure IPC Communication**: Renderer ↔ Main process via secure context isolation
6. **✅ Protocol Buffer Integration**: Shared `.proto` definitions ensure type safety across TypeScript and Python
7. **✅ Desktop Process Management**: gRPC server runs as bundled executable managed by Electron main process

### Communication Flow
```
React Components (Renderer Process)
        ↓ Auto-Generated Context Bridge (window.autoGrpc)
        ↓ Secure IPC with Type Safety
Main Process (Auto-Generated Handlers)
        ↓ gRPC (@grpc/grpc-js with compression)
Python gRPC Server (Unified GeospatialService)
        ├── DataGenerator (numpy flat arrays)
        ├── ProjectManager (centralized project/file/dataset ops)
        └── DatabaseManager (SQLite with SQLModel ORM)
Backend Process (managed by backend_helpers.ts)
```

## 🏗️ Modern Architecture Overview

### **Auto-Generated gRPC System**

The application uses a **fully auto-generated gRPC system** that eliminates manual API code:

#### **Auto-Generation Stack**
- **Protocol Buffers**: Single source of truth in `/protos/` directory
- **TypeScript Client**: Auto-generated renderer process client (`window.autoGrpc`)
- **IPC Handlers**: Auto-generated main process handlers with proper routing
- **Context Bridge**: Auto-generated secure context exposure
- **Main Process Client**: Auto-generated gRPC client with connection management

#### **Generated Files Structure**
```
src/grpc-auto/                    # Auto-generated directory (DO NOT EDIT)
├── auto-grpc-client.ts           # Renderer process gRPC client
├── auto-ipc-handlers.ts          # Main process IPC handlers  
├── auto-grpc-context.ts          # Context bridge definitions
└── auto-main-client.ts           # Main process gRPC client
```

### **Streamlined Data Format**

The application uses a **flat array data format** optimized for Protocol Buffer transmission:

#### **Flat Array Structure**
```typescript
// Protocol Buffer response format
type GetColumnarDataResponse = {
  data: number[];                  // Flat array: [x1,y1,z1, x2,y2,z2, x3,y3,z3, ...]
  total_count: number;             // Number of points
  bounds: Map<string, Bounds>;     // Value bounds for each dimension
};

// Internal Python columnar generation (converted to flat array)
type InternalColumnarData = {
  id: string[];                    // Point IDs
  x: number[];                     // X coordinates (longitude)
  y: number[];                     // Y coordinates (latitude)  
  z: number[];                     // Z values (elevation)
  id_value: string[];              // ID value column
  value1: number[];                // Additional data columns
  value2: number[];                
  value3: number[];                
};
```

#### **Benefits of Flat Array Format**
- **Protocol Buffer Efficient**: Optimal for Protocol Buffer `repeated double` fields
- **Simple Transmission**: Single array reduces message complexity
- **Numpy Compatible**: Direct generation from numpy arrays in Python backend
- **Easy Parsing**: Simple iteration pattern `[x, y, z, x, y, z, ...]`
- **Memory Efficient**: Contiguous array storage

### **Unified Data Processing**

The application implements a simplified, single processing approach:

#### **Flat Array Data Generation** (`data_generation.py`)
- **Method**: `GetColumnarData` - generates synthetic geospatial data
- **Technology**: Numpy-based generation with flat array Protocol Buffer response  
- **Format**: `[x1,y1,z1, x2,y2,z2, x3,y3,z3, ...]` for efficient transmission
- **Data Types**: Elevation (Z), temperature (value1), pressure (value2), humidity (value3)
- **Benefits**: Simple, reliable, and Protocol Buffer optimized


### **IPC Architecture** (`src/helpers/ipc/`)

**Modular IPC System** with domain-based organization:

```
src/helpers/ipc/
├── context-exposer.ts          # Main context bridge coordinator
├── listeners-register.ts       # IPC handler registration coordinator
├── backend/                    # gRPC backend management
│   ├── backend-context.ts      # Backend context bridge
│   ├── backend-listeners.ts    # Backend IPC handlers
│   └── backend-channels.ts     # Backend channel definitions
├── theme/                      # Theme management
│   ├── theme-context.ts        # Theme context bridge  
│   ├── theme-listeners.ts      # Theme IPC handlers
│   └── theme-channels.ts       # Theme channel definitions
└── window/                     # Window management
    ├── window-context.ts       # Window context bridge
    ├── window-listeners.ts     # Window IPC handlers
    └── window-channels.ts      # Window channel definitions
```

**Key Features**:
- **Secure Context Isolation**: All IPC goes through secure context bridges
- **Domain Separation**: Backend, theme, and window concerns are isolated
- **Type Safety**: TypeScript definitions for all IPC channels
- **Auto-Generated Integration**: Works seamlessly with auto-generated gRPC system

### **Database Layer** (`backend/database.py`)

**SQLite Database with SQLModel ORM**:
- **Type-Safe ORM**: SQLModel provides type safety across Python backend
- **Project Management**: Full CRUD operations for projects, files, and datasets
- **Relationship Mapping**: Projects → Files → Datasets → DataRows
- **Persistent Storage**: DuckDB database (`geospatial.db`) for data persistence
- **Database Models**:
  - `Project`: Project metadata and configuration
  - `File`: CSV file records associated with projects
  - `Dataset`: Processed dataset records with statistics
  - `DataRow`: Individual data points from processed CSV files

### **Project Management System**

**Complete Project Workflow**:
- **Project CRUD**: Create, read, update, delete projects via gRPC
- **File Association**: Link CSV files to specific projects
- **Dataset Processing**: Enhanced CSV analysis with project context
- **Database Integration**: All project data stored persistently
- **UI Components**: Complete project management interface
- **Auto-Generated API**: All project operations use type-safe gRPC methods

**Project Management Methods**:
```typescript
// Create new project
const project = await window.autoGrpc.createProject({
  name: "San Francisco Analysis",
  description: "Geospatial analysis of SF bay area"
});

// List all projects
const projects = await window.autoGrpc.getProjects({});

// Get project details
const projectDetail = await window.autoGrpc.getProject({ id: project.id });

// Update project
await window.autoGrpc.updateProject({
  id: project.id,
  name: "Updated Project Name",
  description: "Updated description"
});

// Delete project
await window.autoGrpc.deleteProject({ id: project.id });
```

### **Process Management** (`src/helpers/backend_helpers.ts`)

**Python gRPC Server Lifecycle Management**:
- **Development Mode**: Direct `python grpc_server.py` execution
- **Production Mode**: PyInstaller-built executable
- **Health Monitoring**: Connection testing with 15-second timeout
- **Graceful Shutdown**: SIGTERM → wait → SIGKILL sequence
- **Auto-Recovery**: Automatic restart on connection failures

## 🚀 Auto-Generated gRPC API Reference

The application provides a **fully auto-generated gRPC API** accessible via `window.autoGrpc` in the renderer process.

### 🎯 Simple Examples

#### Hello World
Basic connectivity test for learning gRPC communication:

```typescript
// Simple hello world example
const response = await window.autoGrpc.helloWorld({ message: "Hello from frontend!" });
console.log('Server response:', response.message);
// Output: "Hello! You sent: 'Hello from frontend!'. Server time: 14:30:25"
```

#### Echo Parameter
Parameter processing example with mathematical operations:

```typescript
// Test different operations
const result1 = await window.autoGrpc.echoParameter({ value: 42, operation: "square" });
console.log(`${result1.original_value} squared = ${result1.processed_value}`);
// Output: "42 squared = 1764"

const result2 = await window.autoGrpc.echoParameter({ value: 10, operation: "double" });
console.log(`${result2.original_value} doubled = ${result2.processed_value}`);
// Output: "10 doubled = 20"

// Available operations: "square", "double", "half", "negate", or any other (defaults to increment)
```

### 🌍 Geospatial Data Methods

#### Health Check
Check backend server status:

```typescript
const health = await window.autoGrpc.healthCheck({});
console.log('Server healthy:', health.healthy);
console.log('Version:', health.version);
```

#### Get Features
Retrieve geospatial features within bounds:

```typescript
const bounds = {
  northeast: { latitude: 37.7849, longitude: -122.4094 },
  southwest: { latitude: 37.7749, longitude: -122.4194 }
};

const result = await window.autoGrpc.getFeatures({ 
  bounds, 
  feature_types: ['poi'], 
  limit: 100 
});
console.log(`Found ${result.features.length} features`);
```

#### ✅ Flat Array Data API (RECOMMENDED)
Generate synthetic geospatial data efficiently:

```typescript
// Generate synthetic geospatial data in flat array format
const result = await window.autoGrpc.getColumnarData({
  data_types: ['elevation'], 
  max_points: 100000 // Generates up to 100K points
});

console.log(`Generated ${result.total_count} points`);
console.log(`Data format: [x1,y1,z1, x2,y2,z2, ...] with ${result.data.length} values`);

// Parse flat array data
const points = [];
for (let i = 0; i < result.data.length; i += 3) {
  points.push({
    x: result.data[i],     // longitude
    y: result.data[i + 1], // latitude  
    z: result.data[i + 2]  // elevation
  });
}

console.log(`Parsed ${points.length} points for visualization`);
```

### 📊 Performance Characteristics

#### Data Generation
- **✅ Flat Array Format**: Optimal Protocol Buffer transmission efficiency
- **✅ Numpy-based Generation**: High-performance mathematical operations
- **✅ Auto-Generated API**: Zero manual API maintenance, full type safety
- **✅ Memory Efficient**: Contiguous array storage for large datasets

#### Data Types Generated
- **Elevation (Z)**: Terrain height using sine/cosine functions with noise
- **Temperature (value1)**: Thermal data with gradients and noise
- **Pressure (value2)**: Atmospheric pressure variations with noise  
- **Humidity (value3)**: Clipped humidity values (0-100%) with noise

#### Generation Characteristics
- **Coordinate Range**: Latitude -33.6 to -33.3, Longitude -70.8 to -70.5 (Chile region)
- **Grid-based**: Uses numpy meshgrid for uniform point distribution
- **Scalable**: Generates from 1K to 100K+ points efficiently

### 🔧 Backend Implementation

#### Python gRPC Server
Located in `/backend/grpc_server.py` - **Unified GeospatialService**:

```python
def GetColumnarData(self, request, context):
    """Generate synthetic geospatial data in flat array format"""
    # Generate columnar data using DataGenerator
    columnar_data = self.data_generator.generate_columnar_data(
        max_points=request.max_points
    )
    
    response = geospatial_pb2.GetColumnarDataResponse()
    response.total_count = len(columnar_data['x'])
    
    # Convert to flat array: [x1,y1,z1, x2,y2,z2, x3,y3,z3, ...]
    flat_data = []
    for i in range(len(columnar_data['x'])):
        flat_data.extend([
            columnar_data['x'][i],    # longitude
            columnar_data['y'][i],    # latitude  
            columnar_data['z'][i]     # elevation
        ])
    
    response.data.extend(flat_data)
    return response
```

#### Protocol Buffer Definitions
Located in `/protos/main_service.proto` - **Unified GeospatialService**:

```protobuf
service GeospatialService {
  // Simple examples for testing and learning
  rpc HelloWorld(HelloWorldRequest) returns (HelloWorldResponse);
  rpc EchoParameter(EchoParameterRequest) returns (EchoParameterResponse);
  rpc HealthCheck(HealthCheckRequest) returns (HealthCheckResponse);
  
  // Simplified data generation
  rpc GetColumnarData(GetBatchDataRequest) returns (GetColumnarDataResponse);
  
  // CSV file processing methods
  rpc AnalyzeCsv(AnalyzeCsvRequest) returns (AnalyzeCsvResponse);
  rpc SendFile(SendFileRequest) returns (SendFileResponse);
  rpc GetLoadedDataStats(GetLoadedDataStatsRequest) returns (GetLoadedDataStatsResponse);
  
  // Project management methods
  rpc CreateProject(CreateProjectRequest) returns (CreateProjectResponse);
  rpc GetProjects(GetProjectsRequest) returns (GetProjectsResponse);
  rpc GetProject(GetProjectRequest) returns (GetProjectResponse);
  rpc UpdateProject(UpdateProjectRequest) returns (UpdateProjectResponse);
  rpc DeleteProject(DeleteProjectRequest) returns (DeleteProjectResponse);
  
  // File and dataset management
  rpc CreateFile(CreateFileRequest) returns (CreateFileResponse);
  rpc GetProjectFiles(GetProjectFilesRequest) returns (GetProjectFilesResponse);
  rpc DeleteFile(DeleteFileRequest) returns (DeleteFileResponse);
  rpc GetProjectDatasets(GetProjectDatasetsRequest) returns (GetProjectDatasetsResponse);
  rpc AnalyzeCsvForProject(AnalyzeCsvForProjectRequest) returns (AnalyzeCsvForProjectResponse);
  rpc ProcessDataset(ProcessDatasetRequest) returns (ProcessDatasetResponse);
  rpc GetDatasetData(GetDatasetDataRequest) returns (GetDatasetDataResponse);
  rpc DeleteDataset(DeleteDatasetRequest) returns (DeleteDatasetResponse);
}
```

### 🛠️ Development Workflow

1. **Update Protocol**: Modify `.proto` files in `/protos/` directory
2. **Auto-Generate**: Run `npm run generate:full-stack` to regenerate all APIs
3. **Backend**: Implement method in `backend/grpc_server.py`
4. **Frontend**: Use auto-generated `window.autoGrpc` methods
5. **Test**: All methods are automatically type-safe and available

## Development Commands

### Setup & Initial Installation
```bash
npm install                 # Install frontend dependencies
npm run setup:backend       # Install Python dependencies in venv
```

### Development (Recommended)
```bash
npm run dev                  # Generate protos + start backend + frontend together (uses venv)
```

### Individual Commands
```bash
npm start                    # Start Electron app only (auto-generates protos first)
npm run dev:backend         # Start gRPC server only (port 50077, uses venv)
npm run lint                 # ESLint check
npm run format              # Prettier check  
npm run format:write        # Prettier format
```

### Protocol Buffers & Auto-Generation
```bash
npm run generate:protos     # Generate basic protobuf files from protos/ directory
npm run generate:full-stack # Generate complete auto-generated gRPC system (RECOMMENDED)
npm run generate:simple     # Alias for generate:full-stack
```

### Testing
```bash
npm run test                # Unit tests (Vitest) - alias for test:unit
npm run test:unit          # Unit tests (Vitest)
npm run test:watch         # Unit tests in watch mode
npm run test:e2e           # E2E tests (Playwright) - requires built app with npm run make
npm run test:all           # All tests (unit + e2e)
```

### Building & Distribution
```bash
npm run build:backend      # Build standalone gRPC executable with PyInstaller
npm run build:full        # Build backend + package Electron app
npm run package           # Package Electron app only (without backend build)
npm run make              # Create platform distributables (includes backend build)
```

### Utility Scripts
```bash
npm run test:simplified    # Test the simplified gRPC system
```

## Key Files & Directories

### Frontend Structure (`/src/`)
- `components/template/` - App-specific components (sidebar, nav, footer)
- `components/ui/` - shadcn/ui components  
- `components/BackendStatus.tsx` - gRPC backend health monitoring
- `components/GrpcDemo.tsx` - gRPC API demonstration with performance testing
- `components/VisualizacionChunks.tsx` - Columnar streaming visualization (100K-2M points)
- `components/CsvProcessor.tsx` - CSV file processing and analysis
- `components/ProjectManager.tsx` - Project management CRUD operations
- `components/ProjectWorkflow.tsx` - Complete project workflow interface
- `components/DatasetViewer.tsx` - Database-stored dataset visualization
- `components/EnhancedCsvProcessor.tsx` - Project-aware CSV processing
- **`grpc-auto/`** - **Auto-generated gRPC system (DO NOT EDIT)**
  - `auto-grpc-client.ts` - Renderer process gRPC client
  - `auto-ipc-handlers.ts` - Main process IPC handlers
  - `auto-grpc-context.ts` - Context bridge definitions
  - `auto-main-client.ts` - Main process gRPC client
- `helpers/ipc/` - Electron IPC communication helpers
- `helpers/backend_helpers.ts` - Backend process management
- `generated/` - Auto-generated Protocol Buffer files
- `contexts/` - React contexts for state management
- `routes/` - TanStack Router configuration

### Backend Structure (`/backend/`)
- **`grpc_server.py`** - **Unified GeospatialService** with all gRPC method implementations
- **`data_generator.py`** - **Streamlined numpy-based** synthetic data generation with flat array output
- **`project_manager.py`** - **Centralized project management** - handles projects, files, datasets, and CSV processing
- **`database.py`** - SQLite database with SQLModel ORM for persistent storage
- `generated/` - Auto-generated Protocol Buffer files
- `build_server.py` - PyInstaller build configuration
- `requirements.txt` - Python dependencies (grpcio, numpy, pandas, sqlmodel)
- `geospatial.db` - SQLite database file

### Configuration Files
- **`protos/`** - **Protocol Buffer definitions directory**:
  - **`main_service.proto`** - **Unified GeospatialService** definition (ENTRY POINT)
  - **`geospatial.proto`** - Core geospatial data types, requests/responses (flat array format)
  - **`files.proto`** - CSV file processing service definitions  
  - **`projects.proto`** - Project and dataset management service definitions
- `forge.config.ts` - Electron packaging and distribution settings (includes PyInstaller backend)
- `backend/requirements.txt` - Python dependencies (grpcio>=1.73.0, numpy>=1.24.0)
- `scripts/generate-protos.js` - Protocol buffer generation script
- `scripts/generate-full-stack.js` - Auto-generation script for complete gRPC system

## Development Workflow

### Initial Setup
1. **Install Dependencies**: Run `npm install` then `npm run setup:backend`
2. **First Run**: Use `npm run dev` to start everything at once (recommended)

### Daily Development
1. **Start Development**: Use `npm run dev` (recommended)
   - Auto-generates protos and gRPC system
   - Starts gRPC backend (blue output) 
   - Starts Electron frontend (green output)
   - Both run concurrently with labeled, colored output
2. **Protocol Changes**: Update `.proto` files then run `npm run generate:full-stack`
3. **Testing**: 
   - Unit tests: `npm run test` or `npm run test:watch`
   - E2E tests: First build with `npm run make`, then `npm run test:e2e`
4. **Code Quality**: Run `npm run lint` and `npm run format` before committing

### Production Build
1. **Full Build**: Use `npm run build:full` for complete build including backend executable
2. **Distribution**: Use `npm run make` to create platform distributables

## Performance Optimization Features

### Simplified Data Processing
The application uses a **streamlined flat array data format** optimized for Protocol Buffer transmission:

1. **🏗️ Flat Array Structure**: Single array data organization for transmission efficiency
   - **Protocol Buffer Optimized**: Perfect fit for `repeated double` fields
   - **Simple Parsing**: Easy iteration pattern `[x, y, z, x, y, z, ...]`
   - **Memory Contiguous**: Single array allocation for better cache utilization
   
2. **⚡ Unified Architecture**: Single service consolidates all backend functionality
   - **Simplified Communication**: One gRPC service handles all operations
   - **Centralized Management**: ProjectManager coordinates all data operations
   - **Reduced Complexity**: Fewer moving parts, easier maintenance

3. **🔄 Modular Organization**: Clean separation of concerns
   - **DataGenerator**: Pure numpy-based synthetic data generation
   - **ProjectManager**: CSV processing, project management, database operations
   - **DatabaseManager**: SQLite with SQLModel ORM for persistence

### Auto-Generated gRPC System
- **Type Safety**: Complete TypeScript integration across frontend and backend
- **Zero Maintenance**: No manual API code - everything auto-generated from `.proto` files
- **Performance**: Direct gRPC communication with Protocol Buffer efficiency
- **Reliability**: Consistent API contracts and automatic error handling

### Streamlined Data Generation
- **High-performance**: Numpy arrays for fast mathematical operations
- **Flat Array Output**: Direct conversion to Protocol Buffer compatible format
- **Multiple data types**: Elevation, temperature, pressure, humidity with noise
- **Grid-based**: Uniform point distribution using numpy meshgrid

## Important Notes

### Core Architecture
- **Auto-Generated API**: Use `window.autoGrpc.*` - all methods are type-safe and auto-generated
- **Unified Service**: Single `GeospatialService` consolidates all backend functionality
- **Flat Array Format**: Data transmitted as `[x1,y1,z1, x2,y2,z2, ...]` for Protocol Buffer efficiency
- **gRPC-Only**: All communication uses gRPC on port 50077 - no REST API
- **IPC Security**: gRPC calls routed through Electron IPC for security (context isolation)
- **Fixed Port**: gRPC server always uses port 50077 for consistency

### Development Environment
- **Python Environment**: Uses `venv/` virtual environment with `source venv/bin/activate`
- **Protocol Buffers**: Changes to `.proto` files require `npm run generate:full-stack`
- **Development**: `npm run dev` is the recommended way to start development
- **Context Isolation**: Enabled for security in Electron configuration

### Testing & Quality
- **E2E Testing**: Playwright tests require the app to be packaged first with `npm run make`
- **CI/CD**: GitHub Actions runs unit tests on push/PR, E2E tests on Windows
- **Code Quality**: ESLint and Prettier configured for consistent code style

### Production & Distribution
- **Bundled Backend**: Production uses PyInstaller-built executable to avoid Python dependency issues
- **Health Checks**: Health monitoring is done via auto-generated gRPC HealthCheck service
- **Electron Forge**: Packaging includes backend executable as extra resource

### UI Framework
- **shadcn/ui**: Use `npx shadcn@canary add <component>` for React 19 + Tailwind v4 compatibility
- **React Compiler**: Enabled by default for performance optimization
- **Large Datasets**: Can handle 5M+ data points without UI freezing using columnar format
- **Performance Testing**: Built-in performance comparison tools in visualization components

### Python Dependencies
- **Core**: grpcio>=1.73.0, grpcio-tools>=1.73.0, protobuf>=6.30.0
- **Data**: numpy>=1.24.0, pandas>=1.5.0
- **Database**: sqlmodel>=0.0.21 (SQLite with type-safe ORM)

---

## 🎯 Recent Architecture Updates

### **Simplified Backend Architecture Implementation**

The application has been **significantly simplified** with a unified backend approach:

#### **What Was Changed:**
- ✅ **Unified Service**: Consolidated all functionality into single `GeospatialService`
- ✅ **Flat Array Format**: Simplified data format `[x1,y1,z1, x2,y2,z2, ...]` for Protocol Buffer efficiency  
- ✅ **Centralized Management**: `ProjectManager` handles all project, file, and dataset operations
- ✅ **Streamlined Generation**: Simplified numpy-based data generation with flat array output
- ✅ **Modular Organization**: Clean separation between `DataGenerator`, `ProjectManager`, and `DatabaseManager`

#### **Key Benefits:**
1. **Simplified Architecture**: Single service reduces complexity and maintenance overhead
2. **Protocol Buffer Optimized**: Flat array format perfect for `repeated double` transmission
3. **Centralized Logic**: All business logic consolidated in focused, modular classes
4. **Easy Maintenance**: Fewer moving parts, clearer code organization
5. **Type Safety**: Complete TypeScript integration maintained with auto-generated API

#### **Usage Pattern:**
```typescript
// Simplified API with flat array format
const result = await window.autoGrpc.getColumnarData({
  data_types: ['elevation'],
  max_points: 100000
});

// Parse flat array efficiently
const points = [];
for (let i = 0; i < result.data.length; i += 3) {
  points.push({
    x: result.data[i],     // longitude
    y: result.data[i + 1], // latitude  
    z: result.data[i + 2]  // elevation
  });
}
```

This simplification provides maximum maintainability and clarity while preserving performance and type safety.