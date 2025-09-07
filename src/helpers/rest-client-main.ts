// REST API client for main process - handles HTTP calls for fair IPC comparison
import { net } from 'electron';

export interface RestApiResponse<T> {
  data: T;
  responseTime: number;
  networkPayloadSize: number;
  frontendMemorySize: number;
  parsingTime: number;
  transmissionTime: number;
}

export class MainRestApiClient {
  private baseUrl = 'http://127.0.0.1:5000/api';

  private async callMethod<TRequest, TResponse>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'POST',
    request?: TRequest
  ): Promise<RestApiResponse<TResponse>> {
    const startTime = performance.now();
    
    return new Promise((resolve, reject) => {
      const url = method === 'GET' && request 
        ? `${this.baseUrl}${endpoint}?${new URLSearchParams(request as any)}`
        : `${this.baseUrl}${endpoint}`;

      const netRequest = net.request({
        method,
        url,
        headers: {
          'Content-Type': 'application/json',
        }
      });

      let responseData = '';
      let timeoutId: NodeJS.Timeout;

      netRequest.on('response', (response) => {
        clearTimeout(timeoutId);
        const networkEndTime = performance.now();
        
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });

        response.on('end', () => {
          try {
            if (response.statusCode && response.statusCode >= 400) {
              let errorMessage = `HTTP ${response.statusCode}: ${response.statusMessage}`;
              try {
                const errorData = JSON.parse(responseData);
                if (errorData.error) {
                  errorMessage = errorData.error;
                }
              } catch {
                // Use default error message if JSON parsing fails
              }
              reject(new Error(errorMessage));
              return;
            }

            // Measure network payload size
            const networkPayloadSize = new Blob([responseData]).size;
            
            // Measure JSON parsing time
            const parseStartTime = performance.now();
            const data = JSON.parse(responseData) as TResponse;
            const parseEndTime = performance.now();
            
            // Measure frontend memory representation size  
            const frontendMemorySize = JSON.stringify(data).length;
            
            // Calculate transmission time if server provides timestamp
            const receivedAt = Date.now();
            const serverData = data as any;
            const transmissionTime = serverData.generated_at ? 
              receivedAt - (serverData.generated_at * 1000) : 0;

            resolve({
              data,
              responseTime: networkEndTime - startTime,
              networkPayloadSize,
              frontendMemorySize,
              parsingTime: parseEndTime - parseStartTime,
              transmissionTime,
            });
          } catch (error) {
            reject(new Error(`JSON parsing failed: ${error instanceof Error ? error.message : 'Unknown error'}`));
          }
        });
      });

      netRequest.on('error', (error) => {
        clearTimeout(timeoutId);
        reject(new Error(`REST API call failed: ${error.message}`));
      });

      // Set manual timeout
      timeoutId = setTimeout(() => {
        netRequest.destroy();
        reject(new Error('REST API call timed out'));
      }, 180000);

      // Send request body if needed
      if (request && method !== 'GET') {
        netRequest.write(JSON.stringify(request));
      }
      
      netRequest.end();
    });
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
    generated_at: number;
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
}

// Singleton instance for main process
export const mainRestApiClient = new MainRestApiClient();