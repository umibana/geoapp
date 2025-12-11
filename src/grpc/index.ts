/**
 * gRPC module exports
 * 
 * Main process: grpcClient, registerGrpcHandlers
 * Renderer process: exposeGrpcContext, getGrpcApi
 */

// Main process exports
export { grpcClient } from './grpc-client';
export { registerGrpcHandlers } from './grpc-handlers';

// Renderer process exports
export { getGrpcApi, type GrpcApi } from './grpc-api';
export { exposeGrpcContext } from './grpc-context';

