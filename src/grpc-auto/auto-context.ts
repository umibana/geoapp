// Enhanced Auto-generated context provider with Unified Worker Thread API
// DO NOT EDIT - This file is auto-generated

import { contextBridge } from 'electron';
import { enhancedAutoGrpcClient, autoGrpcClient } from './auto-grpc-client';
import { WorkerThreadOptions, WorkerThreadResult, WorkerThreadCapabilities } from '../types/worker-thread-types';

// Enhanced context with unified worker thread support
export interface EnhancedAutoGrpcContext {
  helloWorld: (
    request: HelloWorldRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<HelloWorldResponse> | HelloWorldResponse>;
  echoParameter: (
    request: EchoParameterRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<EchoParameterResponse> | EchoParameterResponse>;
  healthCheck: (
    request: HealthCheckRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<HealthCheckResponse> | HealthCheckResponse>;
  getFeatures: (
    request: GetFeaturesRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<GetFeaturesResponse> | GetFeaturesResponse>;
  getBatchDataStreamed: (
    request: GetBatchDataRequest,
    options?: WorkerThreadOptions & { onData?: (data: GetBatchDataChunk) => void }
  ) => Promise<WorkerThreadResult<GetBatchDataChunk[]> | GetBatchDataChunk[]>;
  getBatchDataColumnar: (
    request: GetBatchDataRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<GetBatchDataColumnarResponse> | GetBatchDataColumnarResponse>;
  getBatchDataColumnarStreamed: (
    request: GetBatchDataRequest,
    options?: WorkerThreadOptions & { onData?: (data: ColumnarDataChunk) => void }
  ) => Promise<WorkerThreadResult<ColumnarDataChunk[]> | ColumnarDataChunk[]>;
  analyzeCsv: (
    request: AnalyzeCsvRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<AnalyzeCsvResponse> | AnalyzeCsvResponse>;
  sendFile: (
    request: SendFileRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<SendFileResponse> | SendFileResponse>;
  getLoadedDataStats: (
    request: GetLoadedDataStatsRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<GetLoadedDataStatsResponse> | GetLoadedDataStatsResponse>;
  getLoadedDataChunk: (
    request: GetLoadedDataChunkRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<GetLoadedDataChunkResponse> | GetLoadedDataChunkResponse>;
  createProject: (
    request: CreateProjectRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<CreateProjectResponse> | CreateProjectResponse>;
  getProjects: (
    request: GetProjectsRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<GetProjectsResponse> | GetProjectsResponse>;
  getProject: (
    request: GetProjectRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<GetProjectResponse> | GetProjectResponse>;
  updateProject: (
    request: UpdateProjectRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<UpdateProjectResponse> | UpdateProjectResponse>;
  deleteProject: (
    request: DeleteProjectRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<DeleteProjectResponse> | DeleteProjectResponse>;
  createFile: (
    request: CreateFileRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<CreateFileResponse> | CreateFileResponse>;
  getProjectFiles: (
    request: GetProjectFilesRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<GetProjectFilesResponse> | GetProjectFilesResponse>;
  deleteFile: (
    request: DeleteFileRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<DeleteFileResponse> | DeleteFileResponse>;
  getProjectDatasets: (
    request: GetProjectDatasetsRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<GetProjectDatasetsResponse> | GetProjectDatasetsResponse>;
  analyzeCsvForProject: (
    request: AnalyzeCsvForProjectRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<AnalyzeCsvForProjectResponse> | AnalyzeCsvForProjectResponse>;
  processDataset: (
    request: ProcessDatasetRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<ProcessDatasetResponse> | ProcessDatasetResponse>;
  getDatasetData: (
    request: GetDatasetDataRequest,
    options?: WorkerThreadOptions
  ) => Promise<WorkerThreadResult<GetDatasetDataResponse> | GetDatasetDataResponse>;
  
  // Utility methods
  getMethodCapabilities: (methodName: string, requestType: string, responseType: string, isStreaming: boolean) => WorkerThreadCapabilities;
  cancelOperation: (operationId: string) => boolean;
  getActiveOperations: () => string[];
}

// Legacy context for backward compatibility
export interface AutoGrpcContext {
  helloWorld: (request: HelloWorldRequest) => Promise<HelloWorldResponse>;
  echoParameter: (request: EchoParameterRequest) => Promise<EchoParameterResponse>;
  healthCheck: (request: HealthCheckRequest) => Promise<HealthCheckResponse>;
  getFeatures: (request: GetFeaturesRequest) => Promise<GetFeaturesResponse>;
  getBatchDataStreamed: (request: GetBatchDataRequest, onData?: (data: GetBatchDataChunk) => void) => Promise<GetBatchDataChunk[]>;
  getBatchDataColumnar: (request: GetBatchDataRequest) => Promise<GetBatchDataColumnarResponse>;
  getBatchDataColumnarStreamed: (request: GetBatchDataRequest, onData?: (data: ColumnarDataChunk) => void) => Promise<ColumnarDataChunk[]>;
  analyzeCsv: (request: AnalyzeCsvRequest) => Promise<AnalyzeCsvResponse>;
  sendFile: (request: SendFileRequest) => Promise<SendFileResponse>;
  getLoadedDataStats: (request: GetLoadedDataStatsRequest) => Promise<GetLoadedDataStatsResponse>;
  getLoadedDataChunk: (request: GetLoadedDataChunkRequest) => Promise<GetLoadedDataChunkResponse>;
  createProject: (request: CreateProjectRequest) => Promise<CreateProjectResponse>;
  getProjects: (request: GetProjectsRequest) => Promise<GetProjectsResponse>;
  getProject: (request: GetProjectRequest) => Promise<GetProjectResponse>;
  updateProject: (request: UpdateProjectRequest) => Promise<UpdateProjectResponse>;
  deleteProject: (request: DeleteProjectRequest) => Promise<DeleteProjectResponse>;
  createFile: (request: CreateFileRequest) => Promise<CreateFileResponse>;
  getProjectFiles: (request: GetProjectFilesRequest) => Promise<GetProjectFilesResponse>;
  deleteFile: (request: DeleteFileRequest) => Promise<DeleteFileResponse>;
  getProjectDatasets: (request: GetProjectDatasetsRequest) => Promise<GetProjectDatasetsResponse>;
  analyzeCsvForProject: (request: AnalyzeCsvForProjectRequest) => Promise<AnalyzeCsvForProjectResponse>;
  processDataset: (request: ProcessDatasetRequest) => Promise<ProcessDatasetResponse>;
  getDatasetData: (request: GetDatasetDataRequest) => Promise<GetDatasetDataResponse>;
}

const enhancedAutoGrpcContext: EnhancedAutoGrpcContext = {
  helloWorld: enhancedAutoGrpcClient.helloWorld.bind(enhancedAutoGrpcClient),
  echoParameter: enhancedAutoGrpcClient.echoParameter.bind(enhancedAutoGrpcClient),
  healthCheck: enhancedAutoGrpcClient.healthCheck.bind(enhancedAutoGrpcClient),
  getFeatures: enhancedAutoGrpcClient.getFeatures.bind(enhancedAutoGrpcClient),
  getBatchDataStreamed: enhancedAutoGrpcClient.getBatchDataStreamed.bind(enhancedAutoGrpcClient),
  getBatchDataColumnar: enhancedAutoGrpcClient.getBatchDataColumnar.bind(enhancedAutoGrpcClient),
  getBatchDataColumnarStreamed: enhancedAutoGrpcClient.getBatchDataColumnarStreamed.bind(enhancedAutoGrpcClient),
  analyzeCsv: enhancedAutoGrpcClient.analyzeCsv.bind(enhancedAutoGrpcClient),
  sendFile: enhancedAutoGrpcClient.sendFile.bind(enhancedAutoGrpcClient),
  getLoadedDataStats: enhancedAutoGrpcClient.getLoadedDataStats.bind(enhancedAutoGrpcClient),
  getLoadedDataChunk: enhancedAutoGrpcClient.getLoadedDataChunk.bind(enhancedAutoGrpcClient),
  createProject: enhancedAutoGrpcClient.createProject.bind(enhancedAutoGrpcClient),
  getProjects: enhancedAutoGrpcClient.getProjects.bind(enhancedAutoGrpcClient),
  getProject: enhancedAutoGrpcClient.getProject.bind(enhancedAutoGrpcClient),
  updateProject: enhancedAutoGrpcClient.updateProject.bind(enhancedAutoGrpcClient),
  deleteProject: enhancedAutoGrpcClient.deleteProject.bind(enhancedAutoGrpcClient),
  createFile: enhancedAutoGrpcClient.createFile.bind(enhancedAutoGrpcClient),
  getProjectFiles: enhancedAutoGrpcClient.getProjectFiles.bind(enhancedAutoGrpcClient),
  deleteFile: enhancedAutoGrpcClient.deleteFile.bind(enhancedAutoGrpcClient),
  getProjectDatasets: enhancedAutoGrpcClient.getProjectDatasets.bind(enhancedAutoGrpcClient),
  analyzeCsvForProject: enhancedAutoGrpcClient.analyzeCsvForProject.bind(enhancedAutoGrpcClient),
  processDataset: enhancedAutoGrpcClient.processDataset.bind(enhancedAutoGrpcClient),
  getDatasetData: enhancedAutoGrpcClient.getDatasetData.bind(enhancedAutoGrpcClient),
  
  // Utility methods
  getMethodCapabilities: enhancedAutoGrpcClient.getMethodCapabilities.bind(enhancedAutoGrpcClient),
  cancelOperation: enhancedAutoGrpcClient.cancelOperation.bind(enhancedAutoGrpcClient),
  getActiveOperations: enhancedAutoGrpcClient.getActiveOperations.bind(enhancedAutoGrpcClient)
};

const autoGrpcContext: AutoGrpcContext = {
  helloWorld: autoGrpcClient.helloWorld.bind(autoGrpcClient),
  echoParameter: autoGrpcClient.echoParameter.bind(autoGrpcClient),
  healthCheck: autoGrpcClient.healthCheck.bind(autoGrpcClient),
  getFeatures: autoGrpcClient.getFeatures.bind(autoGrpcClient),
  getBatchDataStreamed: autoGrpcClient.getBatchDataStreamed.bind(autoGrpcClient),
  getBatchDataColumnar: autoGrpcClient.getBatchDataColumnar.bind(autoGrpcClient),
  getBatchDataColumnarStreamed: autoGrpcClient.getBatchDataColumnarStreamed.bind(autoGrpcClient),
  analyzeCsv: autoGrpcClient.analyzeCsv.bind(autoGrpcClient),
  sendFile: autoGrpcClient.sendFile.bind(autoGrpcClient),
  getLoadedDataStats: autoGrpcClient.getLoadedDataStats.bind(autoGrpcClient),
  getLoadedDataChunk: autoGrpcClient.getLoadedDataChunk.bind(autoGrpcClient),
  createProject: autoGrpcClient.createProject.bind(autoGrpcClient),
  getProjects: autoGrpcClient.getProjects.bind(autoGrpcClient),
  getProject: autoGrpcClient.getProject.bind(autoGrpcClient),
  updateProject: autoGrpcClient.updateProject.bind(autoGrpcClient),
  deleteProject: autoGrpcClient.deleteProject.bind(autoGrpcClient),
  createFile: autoGrpcClient.createFile.bind(autoGrpcClient),
  getProjectFiles: autoGrpcClient.getProjectFiles.bind(autoGrpcClient),
  deleteFile: autoGrpcClient.deleteFile.bind(autoGrpcClient),
  getProjectDatasets: autoGrpcClient.getProjectDatasets.bind(autoGrpcClient),
  analyzeCsvForProject: autoGrpcClient.analyzeCsvForProject.bind(autoGrpcClient),
  processDataset: autoGrpcClient.processDataset.bind(autoGrpcClient),
  getDatasetData: autoGrpcClient.getDatasetData.bind(autoGrpcClient),
};

export function exposeAutoGrpcContext() {
  // Expose enhanced client as primary interface
  contextBridge.exposeInMainWorld('autoGrpc', enhancedAutoGrpcContext);
  
  // Expose legacy client for backward compatibility
  contextBridge.exposeInMainWorld('legacyGrpc', autoGrpcContext);
  
  console.log('✅ Enhanced Auto-gRPC context exposed with unified worker thread support');
}
