// Unified Worker Thread API Types
// These types define the enhanced options for methods that support worker threads

export interface WorkerProgress {
  /** Progress percentage (0-100) */
  percentage: number;
  /** Current processing phase */
  phase: 'initializing' | 'processing' | 'generating' | 'finalizing' | 'complete';
  /** Number of items processed so far */
  processedItems: number;
  /** Total items to process */
  totalItems: number;
  /** Estimated time remaining in seconds */
  estimatedTimeRemaining: number;
  /** Current chunk number (for streaming operations) */
  currentChunk?: number;
  /** Total number of chunks */
  totalChunks?: number;
  /** Processing speed (items per second) */
  processingSpeed?: number;
  /** Memory usage in MB */
  memoryUsage?: number;
}

export interface WorkerThreadOptions {
  /** Enable worker thread processing for heavy operations */
  useWorkerThread?: boolean;
  /** Progress callback for real-time updates */
  onProgress?: (progress: WorkerProgress) => void;
  /** Chunk callback for streaming data processing */
  onChunk?: (chunk: any) => void;
  /** Custom chunk size for processing (default: auto-detected) */
  chunkSize?: number;
  /** Enable cancellation support */
  cancellable?: boolean;
  /** Maximum memory usage limit in MB */
  memoryLimit?: number;
  /** Enable performance metrics collection */
  collectMetrics?: boolean;
}

export interface WorkerThreadResult<T> {
  /** The actual result data */
  data: T;
  /** Performance metrics */
  metrics?: {
    /** Total processing time in milliseconds */
    processingTime: number;
    /** Peak memory usage in MB */
    peakMemoryUsage: number;
    /** Total items processed */
    totalItemsProcessed: number;
    /** Average processing speed (items/second) */
    averageSpeed: number;
    /** Number of chunks processed */
    chunksProcessed?: number;
    /** Cache hits for repeated operations */
    cacheHits?: number;
  };
  /** Whether operation was cancelled */
  cancelled?: boolean;
  /** Any warnings generated during processing */
  warnings?: string[];
}

export interface WorkerThreadCapabilities {
  /** Whether the method supports worker threads */
  supportsWorkerThread: boolean;
  /** Whether the method supports streaming */
  supportsStreaming: boolean;
  /** Whether the method supports real-time progress */
  supportsProgress: boolean;
  /** Whether the method supports cancellation */
  supportsCancellation: boolean;
  /** Recommended chunk size for this method */
  recommendedChunkSize?: number;
  /** Expected memory usage category */
  memoryCategory: 'low' | 'medium' | 'high' | 'ultra';
}

// Method detection patterns - these help auto-detect which methods should support worker threads
export const WORKER_THREAD_PATTERNS = {
  // Method names that typically benefit from worker threads
  methodNames: [
    'analyze', 'process', 'generate', 'batch', 'calculate', 'compute',
    'transform', 'aggregate', 'stream', 'chunked', 'bulk'
  ],
  
  // Request types that indicate large data processing
  requestTypePatterns: [
    /BatchData/i,
    /Stream/i, 
    /Analyze/i,
    /Process/i,
    /Generate/i,
    /Bulk/i
  ],
  
  // Response types that indicate streaming
  responseTypePatterns: [
    /Chunk/i,
    /Stream/i,
    /Batch/i
  ]
};

// Global worker thread configuration
export interface WorkerThreadConfig {
  /** Maximum number of concurrent worker threads */
  maxConcurrentWorkers: number;
  /** Default chunk size for operations */
  defaultChunkSize: number;
  /** Default memory limit per worker in MB */
  defaultMemoryLimit: number;
  /** Whether to enable worker thread caching */
  enableCaching: boolean;
  /** Cache size limit in MB */
  cacheSize: number;
}

export const DEFAULT_WORKER_CONFIG: WorkerThreadConfig = {
  maxConcurrentWorkers: 2,
  defaultChunkSize: 25000,
  defaultMemoryLimit: 512, // 512MB
  enableCaching: true,
  cacheSize: 256 // 256MB cache
};