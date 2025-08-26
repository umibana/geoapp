// Enhanced Auto-generated gRPC client with Unified Worker Thread API
// DO NOT EDIT - This file is auto-generated

import { ipcRenderer } from 'electron';
import { UnifiedWorkerRouter } from '../helpers/unified-worker-router';
import { WorkerThreadOptions, WorkerThreadResult, WorkerThreadCapabilities } from '../types/worker-thread-types';
import * as FilesTypes from '../generated/files_pb';
import * as GeospatialTypes from '../generated/geospatial_pb';
import * as MainserviceTypes from '../generated/main_service_pb';
import * as ProjectsTypes from '../generated/projects_pb';

type Types = typeof FilesTypes & typeof GeospatialTypes & typeof MainserviceTypes & typeof ProjectsTypes;

export class EnhancedAutoGrpcClient {
  private unifiedRouter: UnifiedWorkerRouter;

  constructor() {
    this.unifiedRouter = UnifiedWorkerRouter.getInstance();
  }

  // ==================================================================================
  // CORE EXECUTION METHODS
  // ==================================================================================

  private async callMethod<T, R>(methodName: string, request: T): Promise<R> {
    const channel = `grpc-${methodName.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    return ipcRenderer.invoke(channel, request);
  }
  
  private async callStreamingMethod<T, R>(methodName: string, request: T, onData?: (data: R) => void): Promise<R[]> {
    return new Promise((resolve, reject) => {
      const requestId = `stream-${Date.now()}-${Math.random()}`;
      const results: R[] = [];
      
      const handleData = (event: any, data: any) => {
        if (data.requestId !== requestId) return;
        
        if (data.type === 'data') {
          results.push(data.payload);
          if (onData) onData(data.payload);
        } else if (data.type === 'complete') {
          ipcRenderer.off('grpc-stream-data', handleData);
          ipcRenderer.off('grpc-stream-error', handleError);
          resolve(results);
        }
      };
      
      const handleError = (event: any, data: any) => {
        if (data.requestId !== requestId) return;
        ipcRenderer.off('grpc-stream-data', handleData);
        ipcRenderer.off('grpc-stream-error', handleError);
        reject(new Error(data.error));
      };
      
      ipcRenderer.on('grpc-stream-data', handleData);
      ipcRenderer.on('grpc-stream-error', handleError);
      
      const channel = `grpc-${methodName.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      ipcRenderer.send(channel, { requestId, ...request });
    });
  }

  /**
   * Execute method with unified worker thread support
   */
  private async callUnifiedMethod<TRequest, TResponse>(
    methodName: string,
    request: TRequest,
    requestType: string,
    responseType: string,
    isStreaming: boolean,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<TResponse> | TResponse> {
    // If no options provided, use regular execution
    if (!options) {
      if (isStreaming) {
        return this.callStreamingMethod(methodName, request) as unknown as TResponse;
      } else {
        return this.callMethod(methodName, request);
      }
    }

    // Use unified router for enhanced execution
    const regularExecutor = (req: TRequest) => this.callMethod<TRequest, TResponse>(methodName, req);
    const streamingExecutor = isStreaming 
      ? (req: TRequest, onData?: (data: any) => void) => 
          this.callStreamingMethod(methodName, req, onData) as unknown as Promise<TResponse[]>
      : undefined;

    return this.unifiedRouter.executeMethod(
      methodName,
      request,
      regularExecutor,
      streamingExecutor,
      options
    );
  }

  /**
   * Get capabilities for a specific method
   */
  getMethodCapabilities(
    methodName: string,
    requestType: string,
    responseType: string,
    isStreaming: boolean
  ): WorkerThreadCapabilities {
    return this.unifiedRouter.detectWorkerCapabilities(
      methodName,
      requestType,
      responseType,
      isStreaming
    );
  }

  /**
   * Cancel an active operation
   */
  cancelOperation(operationId: string): boolean {
    return this.unifiedRouter.cancelOperation(operationId);
  }

  /**
   * Get list of active operations
   */
  getActiveOperations(): string[] {
    return this.unifiedRouter.getActiveOperations();
  }

  // ==================================================================================
  // ENHANCED METHODS WITH UNIFIED API
  // ==================================================================================

  /**
   * HelloWorld - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async helloWorld(
    request: HelloWorldRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<HelloWorldResponse> | HelloWorldResponse> {
    return this.callUnifiedMethod(
      'HelloWorld',
      request,
      'HelloWorldRequest',
      'HelloWorldResponse',
      false,
      options
    );
  }

  /**
   * EchoParameter - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async echoParameter(
    request: EchoParameterRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<EchoParameterResponse> | EchoParameterResponse> {
    return this.callUnifiedMethod(
      'EchoParameter',
      request,
      'EchoParameterRequest',
      'EchoParameterResponse',
      false,
      options
    );
  }

  /**
   * HealthCheck - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async healthCheck(
    request: HealthCheckRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<HealthCheckResponse> | HealthCheckResponse> {
    return this.callUnifiedMethod(
      'HealthCheck',
      request,
      'HealthCheckRequest',
      'HealthCheckResponse',
      false,
      options
    );
  }

  /**
   * GetFeatures - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async getFeatures(
    request: GetFeaturesRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<GetFeaturesResponse> | GetFeaturesResponse> {
    return this.callUnifiedMethod(
      'GetFeatures',
      request,
      'GetFeaturesRequest',
      'GetFeaturesResponse',
      false,
      options
    );
  }

  /**
   * GetBatchDataStreamed - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async getBatchDataStreamed(
    request: GetBatchDataRequest,
    options?: WorkerThreadOptions & {
      onData?: (data: GetBatchDataChunk) => void;
    }
  ): Promise<WorkerThreadResult<GetBatchDataChunk[]> | GetBatchDataChunk[]> {
    if (options && (options.useWorkerThread || options.onProgress)) {
      // Extract onData from options for streaming
      const { onData, ...workerOptions } = options;
      return this.callUnifiedMethod(
        'GetBatchDataStreamed',
        request,
        'GetBatchDataRequest',
        'GetBatchDataChunk[]',
        true,
        { ...workerOptions, onChunk: onData }
      );
    }
    
    // Regular streaming execution
    return this.callStreamingMethod('GetBatchDataStreamed', request, options?.onData);
  }

  /**
   * GetBatchDataColumnar - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async getBatchDataColumnar(
    request: GetBatchDataRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<GetBatchDataColumnarResponse> | GetBatchDataColumnarResponse> {
    return this.callUnifiedMethod(
      'GetBatchDataColumnar',
      request,
      'GetBatchDataRequest',
      'GetBatchDataColumnarResponse',
      false,
      options
    );
  }

  /**
   * GetBatchDataColumnarStreamed - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async getBatchDataColumnarStreamed(
    request: GetBatchDataRequest,
    options?: WorkerThreadOptions & {
      onData?: (data: ColumnarDataChunk) => void;
    }
  ): Promise<WorkerThreadResult<ColumnarDataChunk[]> | ColumnarDataChunk[]> {
    if (options && (options.useWorkerThread || options.onProgress)) {
      // Extract onData from options for streaming
      const { onData, ...workerOptions } = options;
      return this.callUnifiedMethod(
        'GetBatchDataColumnarStreamed',
        request,
        'GetBatchDataRequest',
        'ColumnarDataChunk[]',
        true,
        { ...workerOptions, onChunk: onData }
      );
    }
    
    // Regular streaming execution
    return this.callStreamingMethod('GetBatchDataColumnarStreamed', request, options?.onData);
  }

  /**
   * AnalyzeCsv - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async analyzeCsv(
    request: AnalyzeCsvRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<AnalyzeCsvResponse> | AnalyzeCsvResponse> {
    return this.callUnifiedMethod(
      'AnalyzeCsv',
      request,
      'AnalyzeCsvRequest',
      'AnalyzeCsvResponse',
      false,
      options
    );
  }

  /**
   * SendFile - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async sendFile(
    request: SendFileRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<SendFileResponse> | SendFileResponse> {
    return this.callUnifiedMethod(
      'SendFile',
      request,
      'SendFileRequest',
      'SendFileResponse',
      false,
      options
    );
  }

  /**
   * GetLoadedDataStats - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async getLoadedDataStats(
    request: GetLoadedDataStatsRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<GetLoadedDataStatsResponse> | GetLoadedDataStatsResponse> {
    return this.callUnifiedMethod(
      'GetLoadedDataStats',
      request,
      'GetLoadedDataStatsRequest',
      'GetLoadedDataStatsResponse',
      false,
      options
    );
  }

  /**
   * GetLoadedDataChunk - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async getLoadedDataChunk(
    request: GetLoadedDataChunkRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<GetLoadedDataChunkResponse> | GetLoadedDataChunkResponse> {
    return this.callUnifiedMethod(
      'GetLoadedDataChunk',
      request,
      'GetLoadedDataChunkRequest',
      'GetLoadedDataChunkResponse',
      false,
      options
    );
  }

  /**
   * CreateProject - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async createProject(
    request: CreateProjectRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<CreateProjectResponse> | CreateProjectResponse> {
    return this.callUnifiedMethod(
      'CreateProject',
      request,
      'CreateProjectRequest',
      'CreateProjectResponse',
      false,
      options
    );
  }

  /**
   * GetProjects - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async getProjects(
    request: GetProjectsRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<GetProjectsResponse> | GetProjectsResponse> {
    return this.callUnifiedMethod(
      'GetProjects',
      request,
      'GetProjectsRequest',
      'GetProjectsResponse',
      false,
      options
    );
  }

  /**
   * GetProject - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async getProject(
    request: GetProjectRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<GetProjectResponse> | GetProjectResponse> {
    return this.callUnifiedMethod(
      'GetProject',
      request,
      'GetProjectRequest',
      'GetProjectResponse',
      false,
      options
    );
  }

  /**
   * UpdateProject - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async updateProject(
    request: UpdateProjectRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<UpdateProjectResponse> | UpdateProjectResponse> {
    return this.callUnifiedMethod(
      'UpdateProject',
      request,
      'UpdateProjectRequest',
      'UpdateProjectResponse',
      false,
      options
    );
  }

  /**
   * DeleteProject - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async deleteProject(
    request: DeleteProjectRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<DeleteProjectResponse> | DeleteProjectResponse> {
    return this.callUnifiedMethod(
      'DeleteProject',
      request,
      'DeleteProjectRequest',
      'DeleteProjectResponse',
      false,
      options
    );
  }

  /**
   * CreateFile - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async createFile(
    request: CreateFileRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<CreateFileResponse> | CreateFileResponse> {
    return this.callUnifiedMethod(
      'CreateFile',
      request,
      'CreateFileRequest',
      'CreateFileResponse',
      false,
      options
    );
  }

  /**
   * GetProjectFiles - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async getProjectFiles(
    request: GetProjectFilesRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<GetProjectFilesResponse> | GetProjectFilesResponse> {
    return this.callUnifiedMethod(
      'GetProjectFiles',
      request,
      'GetProjectFilesRequest',
      'GetProjectFilesResponse',
      false,
      options
    );
  }

  /**
   * DeleteFile - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async deleteFile(
    request: DeleteFileRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<DeleteFileResponse> | DeleteFileResponse> {
    return this.callUnifiedMethod(
      'DeleteFile',
      request,
      'DeleteFileRequest',
      'DeleteFileResponse',
      false,
      options
    );
  }

  /**
   * GetProjectDatasets - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async getProjectDatasets(
    request: GetProjectDatasetsRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<GetProjectDatasetsResponse> | GetProjectDatasetsResponse> {
    return this.callUnifiedMethod(
      'GetProjectDatasets',
      request,
      'GetProjectDatasetsRequest',
      'GetProjectDatasetsResponse',
      false,
      options
    );
  }

  /**
   * AnalyzeCsvForProject - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async analyzeCsvForProject(
    request: AnalyzeCsvForProjectRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<AnalyzeCsvForProjectResponse> | AnalyzeCsvForProjectResponse> {
    return this.callUnifiedMethod(
      'AnalyzeCsvForProject',
      request,
      'AnalyzeCsvForProjectRequest',
      'AnalyzeCsvForProjectResponse',
      false,
      options
    );
  }

  /**
   * ProcessDataset - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async processDataset(
    request: ProcessDatasetRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<ProcessDatasetResponse> | ProcessDatasetResponse> {
    return this.callUnifiedMethod(
      'ProcessDataset',
      request,
      'ProcessDatasetRequest',
      'ProcessDatasetResponse',
      false,
      options
    );
  }

  /**
   * GetDatasetData - Enhanced with unified worker thread support
   * @param request - The request parameters
   * @param options - Optional worker thread configuration
   */
  async getDatasetData(
    request: GetDatasetDataRequest,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<GetDatasetDataResponse> | GetDatasetDataResponse> {
    return this.callUnifiedMethod(
      'GetDatasetData',
      request,
      'GetDatasetDataRequest',
      'GetDatasetDataResponse',
      false,
      options
    );
  }
}

export const enhancedAutoGrpcClient = new EnhancedAutoGrpcClient();

// ==================================================================================
// LEGACY CLIENT (for backward compatibility)
// ==================================================================================

export class AutoGrpcClient {
  private async callMethod<T, R>(methodName: string, request: T): Promise<R> {
    const channel = `grpc-${methodName.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase()}`;
    return ipcRenderer.invoke(channel, request);
  }
  
  private async callStreamingMethod<T, R>(methodName: string, request: T, onData?: (data: R) => void): Promise<R[]> {
    return new Promise((resolve, reject) => {
      const requestId = `stream-${Date.now()}-${Math.random()}`;
      const results: R[] = [];
      
      const handleData = (event: any, data: any) => {
        if (data.requestId !== requestId) return;
        
        if (data.type === 'data') {
          results.push(data.payload);
          if (onData) onData(data.payload);
        } else if (data.type === 'complete') {
          ipcRenderer.off('grpc-stream-data', handleData);
          ipcRenderer.off('grpc-stream-error', handleError);
          resolve(results);
        }
      };
      
      const handleError = (event: any, data: any) => {
        if (data.requestId !== requestId) return;
        ipcRenderer.off('grpc-stream-data', handleData);
        ipcRenderer.off('grpc-stream-error', handleError);
        reject(new Error(data.error));
      };
      
      ipcRenderer.on('grpc-stream-data', handleData);
      ipcRenderer.on('grpc-stream-error', handleError);
      
      const channel = `grpc-${methodName.toLowerCase().replace(/([A-Z])/g, '-$1').toLowerCase()}`;
      ipcRenderer.send(channel, { requestId, ...request });
    });
  }

  /** @deprecated Use enhanced client for better performance */
  async helloWorld(request: HelloWorldRequest): Promise<HelloWorldResponse> {
    return this.callMethod('HelloWorld', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async echoParameter(request: EchoParameterRequest): Promise<EchoParameterResponse> {
    return this.callMethod('EchoParameter', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async healthCheck(request: HealthCheckRequest): Promise<HealthCheckResponse> {
    return this.callMethod('HealthCheck', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async getFeatures(request: GetFeaturesRequest): Promise<GetFeaturesResponse> {
    return this.callMethod('GetFeatures', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async getBatchDataStreamed(request: GetBatchDataRequest, onData?: (data: GetBatchDataChunk) => void): Promise<GetBatchDataChunk[]> {
    return this.callStreamingMethod('GetBatchDataStreamed', request, onData);
  }

  /** @deprecated Use enhanced client for better performance */
  async getBatchDataColumnar(request: GetBatchDataRequest): Promise<GetBatchDataColumnarResponse> {
    return this.callMethod('GetBatchDataColumnar', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async getBatchDataColumnarStreamed(request: GetBatchDataRequest, onData?: (data: ColumnarDataChunk) => void): Promise<ColumnarDataChunk[]> {
    return this.callStreamingMethod('GetBatchDataColumnarStreamed', request, onData);
  }

  /** @deprecated Use enhanced client for better performance */
  async analyzeCsv(request: AnalyzeCsvRequest): Promise<AnalyzeCsvResponse> {
    return this.callMethod('AnalyzeCsv', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async sendFile(request: SendFileRequest): Promise<SendFileResponse> {
    return this.callMethod('SendFile', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async getLoadedDataStats(request: GetLoadedDataStatsRequest): Promise<GetLoadedDataStatsResponse> {
    return this.callMethod('GetLoadedDataStats', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async getLoadedDataChunk(request: GetLoadedDataChunkRequest): Promise<GetLoadedDataChunkResponse> {
    return this.callMethod('GetLoadedDataChunk', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async createProject(request: CreateProjectRequest): Promise<CreateProjectResponse> {
    return this.callMethod('CreateProject', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async getProjects(request: GetProjectsRequest): Promise<GetProjectsResponse> {
    return this.callMethod('GetProjects', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async getProject(request: GetProjectRequest): Promise<GetProjectResponse> {
    return this.callMethod('GetProject', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async updateProject(request: UpdateProjectRequest): Promise<UpdateProjectResponse> {
    return this.callMethod('UpdateProject', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async deleteProject(request: DeleteProjectRequest): Promise<DeleteProjectResponse> {
    return this.callMethod('DeleteProject', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async createFile(request: CreateFileRequest): Promise<CreateFileResponse> {
    return this.callMethod('CreateFile', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async getProjectFiles(request: GetProjectFilesRequest): Promise<GetProjectFilesResponse> {
    return this.callMethod('GetProjectFiles', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async deleteFile(request: DeleteFileRequest): Promise<DeleteFileResponse> {
    return this.callMethod('DeleteFile', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async getProjectDatasets(request: GetProjectDatasetsRequest): Promise<GetProjectDatasetsResponse> {
    return this.callMethod('GetProjectDatasets', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async analyzeCsvForProject(request: AnalyzeCsvForProjectRequest): Promise<AnalyzeCsvForProjectResponse> {
    return this.callMethod('AnalyzeCsvForProject', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async processDataset(request: ProcessDatasetRequest): Promise<ProcessDatasetResponse> {
    return this.callMethod('ProcessDataset', request);
  }

  /** @deprecated Use enhanced client for better performance */
  async getDatasetData(request: GetDatasetDataRequest): Promise<GetDatasetDataResponse> {
    return this.callMethod('GetDatasetData', request);
  }
}

export const autoGrpcClient = new AutoGrpcClient();
