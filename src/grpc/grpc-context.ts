/**
 * Context bridge for gRPC API
 * 
 * Exposes the gRPC API to the renderer process via contextBridge.
 * We must create explicit method bindings because contextBridge cannot clone Proxy objects.
 */

import { contextBridge, ipcRenderer } from 'electron';
import type { GeospatialService } from '../generated/main_service';

/**
 * Convert camelCase method name to PascalCase for gRPC
 * e.g., 'helloWorld' -> 'HelloWorld'
 */
function toPascalCase(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Create a gRPC method caller
 */
function createMethod(methodName: string) {
  return (request: unknown) => {
    const grpcMethod = toPascalCase(methodName);
    return ipcRenderer.invoke('grpc:call', { method: grpcMethod, request });
  };
}

/**
 * All gRPC service methods - must be explicit for contextBridge serialization
 */
const grpcMethods: GeospatialService = {
  // Test services
  helloWorld: createMethod('helloWorld'),
  echoParameter: createMethod('echoParameter'),
  healthCheck: createMethod('healthCheck'),
  
  // Columnar data
  getColumnarData: createMethod('getColumnarData'),
  
  // File processing
  sendFile: createMethod('sendFile'),
  
  // Project management
  createProject: createMethod('createProject'),
  getProjects: createMethod('getProjects'),
  getProject: createMethod('getProject'),
  updateProject: createMethod('updateProject'),
  deleteProject: createMethod('deleteProject'),
  
  // File management
  createFile: createMethod('createFile'),
  createMultiFile: createMethod('createMultiFile'),
  getProjectFiles: createMethod('getProjectFiles'),
  deleteFile: createMethod('deleteFile'),
  updateFile: createMethod('updateFile'),
  renameFileColumn: createMethod('renameFileColumn'),
  getFileStatistics: createMethod('getFileStatistics'),
  
  // File data manipulation
  replaceFileData: createMethod('replaceFileData'),
  searchFileData: createMethod('searchFileData'),
  filterFileData: createMethod('filterFileData'),
  addFilteredColumn: createMethod('addFilteredColumn'),
  deleteFilePoints: createMethod('deleteFilePoints'),
  
  // Column operations
  addFileColumns: createMethod('addFileColumns'),
  duplicateFileColumns: createMethod('duplicateFileColumns'),
  deleteFileColumns: createMethod('deleteFileColumns'),
  
  // Dataset management
  getProjectDatasets: createMethod('getProjectDatasets'),
  deleteDataset: createMethod('deleteDataset'),
  mergeDatasets: createMethod('mergeDatasets'),
  
  // CSV processing
  analyzeCsvForProject: createMethod('analyzeCsvForProject'),
  processDataset: createMethod('processDataset'),
  getDatasetData: createMethod('getDatasetData'),
  getDatasetTableData: createMethod('getDatasetTableData'),
};

/**
 * Expose the gRPC API to the renderer process
 * Available as window.grpc in the renderer
 */
export function exposeGrpcContext(): void {
  contextBridge.exposeInMainWorld('grpc', grpcMethods);
  console.log('✅ gRPC context exposed');
}
