// Unified Worker Thread Router
// This module handles the decision between regular and worker thread execution

import { MainProcessWorker } from './mainProcessWorker';
import { 
  WorkerThreadOptions, 
  WorkerProgress, 
  WorkerThreadResult, 
  WorkerThreadCapabilities,
  WORKER_THREAD_PATTERNS,
  DEFAULT_WORKER_CONFIG
} from '../types/worker-thread-types';

export class UnifiedWorkerRouter {
  private static instance: UnifiedWorkerRouter | null = null;
  private workerInstance: MainProcessWorker | null = null;
  private activeOperations = new Map<string, any>();

  static getInstance(): UnifiedWorkerRouter {
    if (!UnifiedWorkerRouter.instance) {
      UnifiedWorkerRouter.instance = new UnifiedWorkerRouter();
    }
    return UnifiedWorkerRouter.instance;
  }

  /**
   * Detect if a method should support worker threads based on its characteristics
   */
  detectWorkerCapabilities(
    methodName: string, 
    requestType: string, 
    responseType: string,
    isStreaming: boolean
  ): WorkerThreadCapabilities {
    const methodLower = methodName.toLowerCase();
    const requestLower = requestType.toLowerCase();
    
    // Check method name patterns
    const methodSupportsWorker = WORKER_THREAD_PATTERNS.methodNames.some(pattern => 
      methodLower.includes(pattern)
    );
    
    // Check request type patterns
    const requestSupportsWorker = WORKER_THREAD_PATTERNS.requestTypePatterns.some(pattern =>
      pattern.test(requestType)
    );
    
    // Check response type patterns
    const responseSupportsStreaming = WORKER_THREAD_PATTERNS.responseTypePatterns.some(pattern =>
      pattern.test(responseType)
    );

    const supportsWorkerThread = methodSupportsWorker || requestSupportsWorker || isStreaming;
    const supportsProgress = supportsWorkerThread || isStreaming;
    const supportsCancellation = supportsWorkerThread;
    
    // Determine memory category based on method characteristics
    let memoryCategory: 'low' | 'medium' | 'high' | 'ultra' = 'low';
    if (methodLower.includes('batch') || methodLower.includes('bulk')) memoryCategory = 'high';
    if (methodLower.includes('analyze') || methodLower.includes('process')) memoryCategory = 'medium';
    if (isStreaming || methodLower.includes('stream')) memoryCategory = 'high';
    if (methodLower.includes('generate') && requestLower.includes('max_points')) memoryCategory = 'ultra';

    // Recommend chunk size based on memory category
    let recommendedChunkSize: number | undefined;
    switch (memoryCategory) {
      case 'medium': recommendedChunkSize = 50000; break;
      case 'high': recommendedChunkSize = 25000; break;
      case 'ultra': recommendedChunkSize = 10000; break;
    }

    return {
      supportsWorkerThread,
      supportsStreaming: isStreaming || responseSupportsStreaming,
      supportsProgress,
      supportsCancellation,
      recommendedChunkSize,
      memoryCategory
    };
  }

  /**
   * Execute a method with optional worker thread support
   */
  async executeMethod<TRequest, TResponse>(
    methodName: string,
    request: TRequest,
    regularExecutor: (request: TRequest) => Promise<TResponse>,
    streamingExecutor?: (request: TRequest, onData?: (data: any) => void) => Promise<TResponse[]>,
    options?: WorkerThreadOptions
  ): Promise<WorkerThreadResult<TResponse>> {
    const startTime = Date.now();
    const operationId = `${methodName}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    try {
      // If worker threads not requested or not available, use regular execution
      if (!options?.useWorkerThread || !this.shouldUseWorkerThread(request, options)) {
        const data = await regularExecutor(request);
        return {
          data,
          metrics: {
            processingTime: Date.now() - startTime,
            peakMemoryUsage: 0,
            totalItemsProcessed: this.estimateItemCount(request),
            averageSpeed: 0
          }
        };
      }

      // Use worker thread execution
      return await this.executeWithWorkerThread(
        operationId,
        methodName,
        request,
        regularExecutor,
        streamingExecutor,
        options
      );

    } catch (error) {
      console.error(`❌ Error in unified execution for ${methodName}:`, error);
      throw error;
    } finally {
      this.activeOperations.delete(operationId);
    }
  }

  /**
   * Execute method using worker threads with progress tracking
   */
  private async executeWithWorkerThread<TRequest, TResponse>(
    operationId: string,
    methodName: string,
    request: TRequest,
    regularExecutor: (request: TRequest) => Promise<TResponse>,
    streamingExecutor?: (request: TRequest, onData?: (data: any) => void) => Promise<TResponse[]>,
    options: WorkerThreadOptions = {}
  ): Promise<WorkerThreadResult<TResponse>> {
    const startTime = Date.now();
    let processedItems = 0;
    let peakMemoryUsage = 0;
    let chunksProcessed = 0;

    // Initialize worker if needed
    if (!this.workerInstance) {
      this.workerInstance = MainProcessWorker.getInstance();
    }

    // Set up progress tracking
    const progressCallback = (workerProgress: any) => {
      const progress: WorkerProgress = {
        percentage: Math.min(100, Math.max(0, workerProgress.percentage || 0)),
        phase: workerProgress.phase || 'processing',
        processedItems: workerProgress.processedItems || processedItems,
        totalItems: workerProgress.totalItems || this.estimateItemCount(request),
        estimatedTimeRemaining: this.estimateTimeRemaining(
          startTime, 
          workerProgress.percentage || 0
        ),
        currentChunk: workerProgress.currentChunk,
        totalChunks: workerProgress.totalChunks,
        processingSpeed: this.calculateProcessingSpeed(
          workerProgress.processedItems || processedItems,
          Date.now() - startTime
        ),
        memoryUsage: workerProgress.memoryUsage || 0
      };

      // Track peak memory usage
      if (progress.memoryUsage && progress.memoryUsage > peakMemoryUsage) {
        peakMemoryUsage = progress.memoryUsage;
      }

      // Call user progress callback
      if (options.onProgress) {
        options.onProgress(progress);
      }
    };

    // Start worker thread processor
    const processor = this.workerInstance.startStreamingProcessor(operationId, progressCallback);
    this.activeOperations.set(operationId, processor);

    let result: TResponse;
    let cancelled = false;

    try {
      // Execute based on method type
      if (streamingExecutor && options.onChunk) {
        // Use streaming execution with chunk processing
        const chunks = await streamingExecutor(request, (chunk) => {
          chunksProcessed++;
          processedItems += this.estimateChunkSize(chunk);
          
          // Process chunk through worker thread
          processor.postChunk({
            chunk_data: chunk,
            processing_type: methodName.toLowerCase(),
            metadata: {
              chunk_number: chunksProcessed - 1,
              operation_id: operationId
            }
          });

          // Call user chunk callback
          if (options.onChunk) {
            options.onChunk(chunk);
          }
        });

        result = chunks as unknown as TResponse;
      } else {
        // Use regular execution but wrap with worker thread monitoring
        processor.postChunk({
          chunk_data: { request, method: methodName },
          processing_type: 'unified_execution',
          metadata: { operation_id: operationId }
        });

        result = await regularExecutor(request);
        processedItems = this.estimateItemCount(request);
      }

      // Finalize worker processing
      const workerResult = await processor.finalize();

      return {
        data: result,
        cancelled,
        metrics: {
          processingTime: Date.now() - startTime,
          peakMemoryUsage,
          totalItemsProcessed: processedItems,
          averageSpeed: this.calculateProcessingSpeed(processedItems, Date.now() - startTime),
          chunksProcessed: chunksProcessed > 0 ? chunksProcessed : undefined,
          cacheHits: workerResult.cacheHits || 0
        }
      };

    } catch (error) {
      // Handle cancellation
      if (error && (error as any).code === 'CANCELLED') {
        cancelled = true;
        return {
          data: {} as TResponse,
          cancelled: true,
          metrics: {
            processingTime: Date.now() - startTime,
            peakMemoryUsage,
            totalItemsProcessed: processedItems,
            averageSpeed: 0
          }
        };
      }
      throw error;
    }
  }

  /**
   * Determine if worker threads should be used based on request characteristics
   */
  private shouldUseWorkerThread<TRequest>(
    request: TRequest, 
    options: WorkerThreadOptions
  ): boolean {
    // Always respect explicit user choice
    if (options.useWorkerThread !== undefined) {
      return options.useWorkerThread;
    }

    // Auto-detect based on request characteristics
    const estimatedItems = this.estimateItemCount(request);
    const memoryLimit = options.memoryLimit || DEFAULT_WORKER_CONFIG.defaultMemoryLimit;
    
    // Use worker threads for large datasets or memory-intensive operations
    return estimatedItems > 100000 || memoryLimit > 256;
  }

  /**
   * Estimate number of items that will be processed
   */
  private estimateItemCount<TRequest>(request: TRequest): number {
    if (!request || typeof request !== 'object') return 1;

    const req = request as any;
    
    // Check common patterns for item counts
    if (req.max_points) return req.max_points;
    if (req.limit) return req.limit;
    if (req.count) return req.count;
    if (req.size) return req.size;
    
    // Estimate based on bounds (for geospatial operations)
    if (req.bounds && req.resolution) {
      const resolution = req.resolution || 20;
      return Math.floor((resolution * resolution) * 100); // Rough estimate
    }

    return 1000; // Conservative default estimate
  }

  /**
   * Estimate chunk size for progress tracking
   */
  private estimateChunkSize(chunk: any): number {
    if (!chunk || typeof chunk !== 'object') return 1;

    // Check common chunk size indicators
    if (chunk.points_in_chunk) return chunk.points_in_chunk;
    if (chunk.items && Array.isArray(chunk.items)) return chunk.items.length;
    if (chunk.data && Array.isArray(chunk.data)) return chunk.data.length;
    if (chunk.columnar_data) {
      const columnar = chunk.columnar_data;
      if (columnar.x && Array.isArray(columnar.x)) return columnar.x.length;
    }

    return 25000; // Default chunk size estimate
  }

  /**
   * Calculate processing speed in items per second
   */
  private calculateProcessingSpeed(itemsProcessed: number, elapsedMs: number): number {
    if (elapsedMs <= 0) return 0;
    return Math.round((itemsProcessed / elapsedMs) * 1000); // items per second
  }

  /**
   * Estimate remaining time based on current progress
   */
  private estimateTimeRemaining(startTime: number, percentageComplete: number): number {
    if (percentageComplete <= 0) return 0;
    
    const elapsedMs = Date.now() - startTime;
    const totalEstimatedMs = (elapsedMs / percentageComplete) * 100;
    const remainingMs = totalEstimatedMs - elapsedMs;
    
    return Math.max(0, Math.round(remainingMs / 1000)); // seconds
  }

  /**
   * Cancel an active operation
   */
  cancelOperation(operationId: string): boolean {
    const processor = this.activeOperations.get(operationId);
    if (processor && typeof processor.cancel === 'function') {
      processor.cancel();
      this.activeOperations.delete(operationId);
      return true;
    }
    return false;
  }

  /**
   * Get active operations
   */
  getActiveOperations(): string[] {
    return Array.from(this.activeOperations.keys());
  }

  /**
   * Clean up resources
   */
  cleanup(): void {
    this.activeOperations.clear();
    if (this.workerInstance) {
      this.workerInstance.cleanup();
      this.workerInstance = null;
    }
  }
}