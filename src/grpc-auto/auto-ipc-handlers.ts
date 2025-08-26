// Enhanced Auto-generated IPC handlers with Unified Worker Thread support
// DO NOT EDIT - This file is auto-generated

import { ipcMain } from 'electron';
import { autoMainGrpcClient } from './auto-main-client';
import { UnifiedWorkerRouter } from '../helpers/unified-worker-router';

export function registerAutoGrpcHandlers() {
  console.log('🔌 Registering enhanced auto-generated gRPC IPC handlers...');

  // Enhanced unary method: HelloWorld
  ipcMain.handle('grpc-helloworld', async (event, request) => {
    const operationId = `HelloWorld-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.helloWorld(req);
        
        return await router.executeMethod(
          'HelloWorld',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.helloWorld(request);
      }
    } catch (error) {
      console.error('gRPC helloWorld failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: EchoParameter
  ipcMain.handle('grpc-echoparameter', async (event, request) => {
    const operationId = `EchoParameter-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.echoParameter(req);
        
        return await router.executeMethod(
          'EchoParameter',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.echoParameter(request);
      }
    } catch (error) {
      console.error('gRPC echoParameter failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: HealthCheck
  ipcMain.handle('grpc-healthcheck', async (event, request) => {
    const operationId = `HealthCheck-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.healthCheck(req);
        
        return await router.executeMethod(
          'HealthCheck',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.healthCheck(request);
      }
    } catch (error) {
      console.error('gRPC healthCheck failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: GetFeatures
  ipcMain.handle('grpc-getfeatures', async (event, request) => {
    const operationId = `GetFeatures-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.getFeatures(req);
        
        return await router.executeMethod(
          'GetFeatures',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.getFeatures(request);
      }
    } catch (error) {
      console.error('gRPC getFeatures failed:', error);
      throw error;
    }
  });

  // Enhanced streaming method: GetBatchDataStreamed
  ipcMain.on('grpc-getbatchdatastreamed', async (event, request) => {
    const operationId = request.requestId || `GetBatchDataStreamed-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.getBatchDataStreamed(req);
        
        const result = await router.executeMethod(
          'GetBatchDataStreamed',
          request,
          regularExecutor,
          regularExecutor,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                requestId: request.requestId,
                operationId,
                ...progress
              });
            },
            onChunk: (chunk) => {
              event.sender.send('grpc-stream-data', {
                requestId: request.requestId,
                type: 'data',
                payload: chunk
              });
            }
          }
        );
        
        event.sender.send('grpc-stream-data', {
          requestId: request.requestId,
          type: 'complete',
          result: result
        });
      } else {
        // Regular streaming execution
        const results = await autoMainGrpcClient.getBatchDataStreamed(request);
        results.forEach(data => {
          event.sender.send('grpc-stream-data', {
            requestId: request.requestId,
            type: 'data',
            payload: data
          });
        });
        event.sender.send('grpc-stream-data', {
          requestId: request.requestId,
          type: 'complete'
        });
      }
    } catch (error) {
      event.sender.send('grpc-stream-error', {
        requestId: request.requestId,
        operationId,
        error: error.message
      });
    }
  });

  // Enhanced unary method: GetBatchDataColumnar
  ipcMain.handle('grpc-getbatchdatacolumnar', async (event, request) => {
    const operationId = `GetBatchDataColumnar-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.getBatchDataColumnar(req);
        
        return await router.executeMethod(
          'GetBatchDataColumnar',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.getBatchDataColumnar(request);
      }
    } catch (error) {
      console.error('gRPC getBatchDataColumnar failed:', error);
      throw error;
    }
  });

  // Enhanced streaming method: GetBatchDataColumnarStreamed
  ipcMain.on('grpc-getbatchdatacolumnarstreamed', async (event, request) => {
    const operationId = request.requestId || `GetBatchDataColumnarStreamed-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.getBatchDataColumnarStreamed(req);
        
        const result = await router.executeMethod(
          'GetBatchDataColumnarStreamed',
          request,
          regularExecutor,
          regularExecutor,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                requestId: request.requestId,
                operationId,
                ...progress
              });
            },
            onChunk: (chunk) => {
              event.sender.send('grpc-stream-data', {
                requestId: request.requestId,
                type: 'data',
                payload: chunk
              });
            }
          }
        );
        
        event.sender.send('grpc-stream-data', {
          requestId: request.requestId,
          type: 'complete',
          result: result
        });
      } else {
        // Regular streaming execution
        const results = await autoMainGrpcClient.getBatchDataColumnarStreamed(request);
        results.forEach(data => {
          event.sender.send('grpc-stream-data', {
            requestId: request.requestId,
            type: 'data',
            payload: data
          });
        });
        event.sender.send('grpc-stream-data', {
          requestId: request.requestId,
          type: 'complete'
        });
      }
    } catch (error) {
      event.sender.send('grpc-stream-error', {
        requestId: request.requestId,
        operationId,
        error: error.message
      });
    }
  });

  // Enhanced unary method: AnalyzeCsv
  ipcMain.handle('grpc-analyzecsv', async (event, request) => {
    const operationId = `AnalyzeCsv-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.analyzeCsv(req);
        
        return await router.executeMethod(
          'AnalyzeCsv',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.analyzeCsv(request);
      }
    } catch (error) {
      console.error('gRPC analyzeCsv failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: SendFile
  ipcMain.handle('grpc-sendfile', async (event, request) => {
    const operationId = `SendFile-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.sendFile(req);
        
        return await router.executeMethod(
          'SendFile',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.sendFile(request);
      }
    } catch (error) {
      console.error('gRPC sendFile failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: GetLoadedDataStats
  ipcMain.handle('grpc-getloadeddatastats', async (event, request) => {
    const operationId = `GetLoadedDataStats-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.getLoadedDataStats(req);
        
        return await router.executeMethod(
          'GetLoadedDataStats',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.getLoadedDataStats(request);
      }
    } catch (error) {
      console.error('gRPC getLoadedDataStats failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: GetLoadedDataChunk
  ipcMain.handle('grpc-getloadeddatachunk', async (event, request) => {
    const operationId = `GetLoadedDataChunk-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.getLoadedDataChunk(req);
        
        return await router.executeMethod(
          'GetLoadedDataChunk',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.getLoadedDataChunk(request);
      }
    } catch (error) {
      console.error('gRPC getLoadedDataChunk failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: CreateProject
  ipcMain.handle('grpc-createproject', async (event, request) => {
    const operationId = `CreateProject-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.createProject(req);
        
        return await router.executeMethod(
          'CreateProject',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.createProject(request);
      }
    } catch (error) {
      console.error('gRPC createProject failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: GetProjects
  ipcMain.handle('grpc-getprojects', async (event, request) => {
    const operationId = `GetProjects-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.getProjects(req);
        
        return await router.executeMethod(
          'GetProjects',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.getProjects(request);
      }
    } catch (error) {
      console.error('gRPC getProjects failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: GetProject
  ipcMain.handle('grpc-getproject', async (event, request) => {
    const operationId = `GetProject-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.getProject(req);
        
        return await router.executeMethod(
          'GetProject',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.getProject(request);
      }
    } catch (error) {
      console.error('gRPC getProject failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: UpdateProject
  ipcMain.handle('grpc-updateproject', async (event, request) => {
    const operationId = `UpdateProject-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.updateProject(req);
        
        return await router.executeMethod(
          'UpdateProject',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.updateProject(request);
      }
    } catch (error) {
      console.error('gRPC updateProject failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: DeleteProject
  ipcMain.handle('grpc-deleteproject', async (event, request) => {
    const operationId = `DeleteProject-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.deleteProject(req);
        
        return await router.executeMethod(
          'DeleteProject',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.deleteProject(request);
      }
    } catch (error) {
      console.error('gRPC deleteProject failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: CreateFile
  ipcMain.handle('grpc-createfile', async (event, request) => {
    const operationId = `CreateFile-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.createFile(req);
        
        return await router.executeMethod(
          'CreateFile',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.createFile(request);
      }
    } catch (error) {
      console.error('gRPC createFile failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: GetProjectFiles
  ipcMain.handle('grpc-getprojectfiles', async (event, request) => {
    const operationId = `GetProjectFiles-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.getProjectFiles(req);
        
        return await router.executeMethod(
          'GetProjectFiles',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.getProjectFiles(request);
      }
    } catch (error) {
      console.error('gRPC getProjectFiles failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: DeleteFile
  ipcMain.handle('grpc-deletefile', async (event, request) => {
    const operationId = `DeleteFile-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.deleteFile(req);
        
        return await router.executeMethod(
          'DeleteFile',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.deleteFile(request);
      }
    } catch (error) {
      console.error('gRPC deleteFile failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: GetProjectDatasets
  ipcMain.handle('grpc-getprojectdatasets', async (event, request) => {
    const operationId = `GetProjectDatasets-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.getProjectDatasets(req);
        
        return await router.executeMethod(
          'GetProjectDatasets',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.getProjectDatasets(request);
      }
    } catch (error) {
      console.error('gRPC getProjectDatasets failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: AnalyzeCsvForProject
  ipcMain.handle('grpc-analyzecsvforproject', async (event, request) => {
    const operationId = `AnalyzeCsvForProject-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.analyzeCsvForProject(req);
        
        return await router.executeMethod(
          'AnalyzeCsvForProject',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.analyzeCsvForProject(request);
      }
    } catch (error) {
      console.error('gRPC analyzeCsvForProject failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: ProcessDataset
  ipcMain.handle('grpc-processdataset', async (event, request) => {
    const operationId = `ProcessDataset-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.processDataset(req);
        
        return await router.executeMethod(
          'ProcessDataset',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.processDataset(request);
      }
    } catch (error) {
      console.error('gRPC processDataset failed:', error);
      throw error;
    }
  });

  // Enhanced unary method: GetDatasetData
  ipcMain.handle('grpc-getdatasetdata', async (event, request) => {
    const operationId = `GetDatasetData-${Date.now()}`;
    
    try {
      // Check if this should use worker thread processing
      const shouldUseWorkerThread = request._workerThread || 
        (request.max_points && request.max_points > 100000) ||
        (request.dataset_id && request.include_correlations);
      
      if (shouldUseWorkerThread) {
        // Use unified worker router for heavy processing
        const router = UnifiedWorkerRouter.getInstance();
        const regularExecutor = (req) => autoMainGrpcClient.getDatasetData(req);
        
        return await router.executeMethod(
          'GetDatasetData',
          request,
          regularExecutor,
          undefined,
          {
            useWorkerThread: true,
            onProgress: (progress) => {
              event.sender.send('grpc-worker-progress', {
                operationId,
                ...progress
              });
            }
          }
        );
      } else {
        // Regular execution
        return await autoMainGrpcClient.getDatasetData(request);
      }
    } catch (error) {
      console.error('gRPC getDatasetData failed:', error);
      throw error;
    }
  });

  // Utility handlers for worker thread management
  ipcMain.handle('grpc-cancel-operation', async (event, operationId) => {
    try {
      const router = UnifiedWorkerRouter.getInstance();
      return router.cancelOperation(operationId);
    } catch (error) {
      console.error('Failed to cancel operation:', error);
      return false;
    }
  });
  
  ipcMain.handle('grpc-get-active-operations', async (event) => {
    try {
      const router = UnifiedWorkerRouter.getInstance();
      return router.getActiveOperations();
    } catch (error) {
      console.error('Failed to get active operations:', error);
      return [];
    }
  });
  
  ipcMain.handle('grpc-get-method-capabilities', async (event, { methodName, requestType, responseType, isStreaming }) => {
    try {
      const router = UnifiedWorkerRouter.getInstance();
      return router.detectWorkerCapabilities(methodName, requestType, responseType, isStreaming);
    } catch (error) {
      console.error('Failed to get method capabilities:', error);
      return { supportsWorkerThread: false, supportsStreaming: false, supportsProgress: false, supportsCancellation: false, memoryCategory: 'low' };
    }
  });

  console.log('✅ Enhanced auto-generated gRPC IPC handlers with worker thread support registered successfully');
}
