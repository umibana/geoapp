// REST API client for performance comparison with gRPC
// Uses JSON over HTTP instead of Protocol Buffers over gRPC

export interface RestApiResponse<T> {
  data: T;
  responseTime: number;
  networkPayloadSize: number; // Network payload size (actual JSON text bytes)
  frontendMemorySize: number; // Frontend memory representation size
  parsingTime: number; // Time to parse JSON
}

export class RestApiClient {
  private baseUrl = 'http://127.0.0.1:5000/api';

  private async callMethod<TRequest, TResponse>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
    request?: TRequest
  ): Promise<RestApiResponse<TResponse>> {
    const startTime = performance.now();
    
    const options: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      // Set timeout for large payloads
      signal: AbortSignal.timeout(180000), // 60 second timeout
    };

    if (request && method !== 'GET') {
      options.body = JSON.stringify(request);
    }

    const url = method === 'GET' && request 
      ? `${this.baseUrl}${endpoint}?${new URLSearchParams(request as any)}`
      : `${this.baseUrl}${endpoint}`;

    try {
      const response = await fetch(url, options);
      
      if (!response.ok) {
        // Try to get detailed error message from server
        let errorMessage = `HTTP ${response.status}: ${response.statusText}`;
        try {
          const errorText = await response.text();
          const errorData = JSON.parse(errorText);
          if (errorData.error) {
            errorMessage = errorData.error;
          }
        } catch {
          // Fallback to status text if we can't parse error response
        }
        throw new Error(errorMessage);
      }

      const responseText = await response.text();
      const networkEndTime = performance.now();
      
      // Measure network payload size
      const networkPayloadSize = new Blob([responseText]).size;
      
      // Measure JSON parsing time
      const parseStartTime = performance.now();
      const data = JSON.parse(responseText) as TResponse;
      const parseEndTime = performance.now();
      
      // Measure frontend memory representation size
      const frontendMemorySize = JSON.stringify(data).length;
      
      return {
        data,
        responseTime: networkEndTime - startTime,
        networkPayloadSize,
        frontendMemorySize,
        parsingTime: parseEndTime - parseStartTime,
      };
    } catch (error) {
      throw new Error(`REST API call failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // =============================================================================
  // BASIC TESTING METHODS
  // =============================================================================

  async healthCheck(): Promise<RestApiResponse<any>> {
    return this.callMethod('/health', 'GET');
  }

  async helloWorld(request: { message: string }): Promise<RestApiResponse<{ message: string }>> {
    return this.callMethod('/hello', 'POST', request);
  }

  async echoParameter(request: { 
    value: number; 
    operation: string 
  }): Promise<RestApiResponse<{ 
    original_value: number; 
    processed_value: number; 
    operation: string 
  }>> {
    return this.callMethod('/echo', 'POST', request);
  }

  // =============================================================================
  // DATA GENERATION METHODS
  // =============================================================================

  async getColumnarData(request: {
    data_types: string[];
    max_points: number;
  }): Promise<RestApiResponse<{
    data: number[];
    total_count: number;
    bounds: {
      x: { min_value: number; max_value: number };
      y: { min_value: number; max_value: number };
      z: { min_value: number; max_value: number };
    };
  }>> {
    return this.callMethod('/columnar-data', 'POST', request);
  }

  // =============================================================================
  // PROJECT MANAGEMENT METHODS
  // =============================================================================

  async getProjects(): Promise<RestApiResponse<{ projects: any[] }>> {
    return this.callMethod('/projects', 'GET');
  }

  async createProject(request: {
    name: string;
    description: string;
  }): Promise<RestApiResponse<{ project: any }>> {
    return this.callMethod('/projects', 'POST', request);
  }

  async getProject(projectId: string): Promise<RestApiResponse<{ project: any }>> {
    return this.callMethod(`/projects/${projectId}`, 'GET');
  }

  async updateProject(projectId: string, request: {
    name: string;
    description: string;
  }): Promise<RestApiResponse<{ project: any }>> {
    return this.callMethod(`/projects/${projectId}`, 'PUT', request);
  }

  async deleteProject(projectId: string): Promise<RestApiResponse<{ success: boolean }>> {
    return this.callMethod(`/projects/${projectId}`, 'DELETE');
  }

  // =============================================================================
  // FILE MANAGEMENT METHODS
  // =============================================================================

  async getProjectFiles(projectId: string): Promise<RestApiResponse<{ files: any[] }>> {
    return this.callMethod(`/projects/${projectId}/files`, 'GET');
  }

  async createFile(projectId: string, request: {
    filename: string;
    filepath: string;
  }): Promise<RestApiResponse<{ file: any }>> {
    return this.callMethod(`/projects/${projectId}/files`, 'POST', request);
  }

  async deleteFile(fileId: string): Promise<RestApiResponse<{ success: boolean }>> {
    return this.callMethod(`/files/${fileId}`, 'DELETE');
  }

  // =============================================================================
  // DATASET MANAGEMENT METHODS
  // =============================================================================

  async getProjectDatasets(projectId: string): Promise<RestApiResponse<{ datasets: any[] }>> {
    return this.callMethod(`/projects/${projectId}/datasets`, 'GET');
  }

  async deleteDataset(datasetId: string): Promise<RestApiResponse<{ success: boolean }>> {
    return this.callMethod(`/datasets/${datasetId}`, 'DELETE');
  }

  async getDatasetData(datasetId: string): Promise<RestApiResponse<{ data: any[] }>> {
    return this.callMethod(`/datasets/${datasetId}/data`, 'GET');
  }

  async analyzeCsvForProject(request: {
    project_id: string;
    file_path: string;
  }): Promise<RestApiResponse<{ analysis: any }>> {
    return this.callMethod('/datasets/analyze', 'POST', request);
  }

  async processDataset(request: {
    dataset_id: string;
  }): Promise<RestApiResponse<{ result: any }>> {
    return this.callMethod('/datasets/process', 'POST', request);
  }
}

// Singleton instance
export const restApiClient = new RestApiClient();