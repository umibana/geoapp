/**
 * Renderer-side gRPC API type export
 * 
 * The actual implementation is in grpc-context.ts which exposes window.grpc.
 * This file provides the type for direct imports if needed.
 */

import type { GeospatialService } from '../generated/main_service';

/**
 * Export the type for window declaration and direct usage
 */
export type GrpcApi = GeospatialService;

/**
 * Get the gRPC API from the window object (for use in renderer)
 * 
 * @example
 * import { getGrpcApi } from '../grpc/grpc-api';
 * const grpc = getGrpcApi();
 * const projects = await grpc.getProjects({});
 */
export function getGrpcApi(): GeospatialService {
  return window.grpc;
}
