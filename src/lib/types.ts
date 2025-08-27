// Electron API types and shared gRPC result/progress shapes

export type GrpcBounds = {
  northeast: { latitude: number; longitude: number };
  southwest: { latitude: number; longitude: number };
};

export type GrpcProgress = {
  processed: number;
  total: number;
  percentage: number;
  phase: string;
};

// Simplified result types
export type ProcessingStats = {
  totalProcessed: number;
  avgValue: number;
  minValue: number;
  maxValue: number;
  dataTypes: string[];
  processingTime: number;
  pointsPerSecond: number;
};

export type ChartConfig = {
  type: string;
  data: Array<[number, number, number]>;
  metadata: {
    totalPoints: number;
    chartPoints: number;
    samplingRatio: number;
    bounds: {
      lng: [number, number];
      lat: [number, number];
      value: [number, number];
    };
  };
};

export type ProcessingResult = {
  stats: ProcessingStats;
  chartConfig: ChartConfig;
  message?: string;
};

export type StandardProgressEvent = GrpcProgress & { requestId?: string; type?: 'progress' | 'complete' | 'batch_complete' };

// Helper functions for processing results
export function extractTotalProcessed(result: ProcessingResult): number {
  return result.stats.totalProcessed;
}

export function extractProcessingTimeSeconds(result: ProcessingResult): number {
  return result.stats.processingTime;
}

export function extractPointsPerSecond(result: ProcessingResult): number {
  return result.stats.pointsPerSecond;
}