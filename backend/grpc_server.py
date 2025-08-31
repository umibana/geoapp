#!/usr/bin/env python
"""
Servidor de Servicio Geoespacial gRPC
Reemplaza la implementación ConnectRPC con gRPC nativo
Provee servicios para datos geoespaciales, proyectos y archivos
"""
import sys
import time
import socket
from pathlib import Path
from concurrent import futures

# Añadir el directorio actual al path de Python para encontrar archivos generados
script_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(script_dir))
sys.path.insert(0, str(script_dir / 'generated'))

import grpc

# Importar los archivos protobuf generados
import geospatial_pb2
import files_pb2
import projects_pb2
import main_service_pb2_grpc

from database import DatabaseManager
from data_generation import DataGenerator
from project_manager import ProjectManager


class GeospatialServicer(main_service_pb2_grpc.GeospatialServiceServicer):
    """Implementación del servicio GeospatialService
    Maneja todas las operaciones relacionadas con datos geoespaciales,
    proyectos y archivos a través de gRPC
    """
    
    def __init__(self):
        self.version = "1.0.0"
        self.db = DatabaseManager()
        self.data_generator = DataGenerator()
        self.project_manager = ProjectManager(self.db)
        print("🌍 GeospatialService inicializado con base de datos")
    
    def HealthCheck(self, request, context):
        """Health check endpoint"""
        try:
            response = geospatial_pb2.HealthCheckResponse(
                healthy=True,
                version=self.version,
                status={
                    "service": "GeospatialService",
                    "uptime": str(int(time.time())),
                    "features_available": "true",
                    "streaming_available": "true"
                }
            )
            print("💚 Health check: OK")
            return response
            
        except Exception as e:
            print(f"❌ Health check error: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Health check failed: {str(e)}")
            return geospatial_pb2.HealthCheckResponse(healthy=False, version=self.version)


    def HelloWorld(self, request, context):
        """
        Simple Hello World example for testing basic gRPC connectivity
        
        @param request: HelloWorldRequest with message
        @param context: gRPC context
        @returns: HelloWorldResponse with echo message
        
        Example usage from frontend:
        ```typescript
        const response = await window.electronGrpc.helloWorld("Hello from frontend!");
        console.log('Server response:', response.message);
        ```
        """
        try:
            print(f"🌍 HelloWorld request: '{request.message}'")
            
            # Create a simple echo response
            response_message = f"Hello! You sent: '{request.message}'. Server time: {time.strftime('%H:%M:%S')}"
            
            response = geospatial_pb2.HelloWorldResponse()
            response.message = response_message
            
            print(f"🌍 HelloWorld response: '{response.message}'")
            return response
            
        except Exception as e:
            print(f"❌ HelloWorld error: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"HelloWorld failed: {str(e)}")
            return geospatial_pb2.HelloWorldResponse()
    
    def EchoParameter(self, request, context):
        """
        Echo Parameter example - processes a value with an operation and returns result
        
        @param request: EchoParameterRequest with value and operation
        @param context: gRPC context  
        @returns: EchoParameterResponse with original and processed values
        
        Example usage from frontend:
        ```typescript
        const result = await window.electronGrpc.echoParameter(42, "square");
        console.log(`${result.originalValue} squared = ${result.processedValue}`);
        ```
        """
        try:
            print(f"🔄 EchoParameter request: {request.value} ({request.operation})")
            
            original_value = request.value
            operation = request.operation.lower()
            
            # Process the value based on operation
            if operation == "square":
                processed_value = original_value * original_value
            elif operation == "double":
                processed_value = original_value * 2
            elif operation == "half":
                processed_value = original_value / 2
            elif operation == "negate":
                processed_value = -original_value
            else:
                # Default operation
                processed_value = original_value + 1
                operation = "increment"
            
            response = geospatial_pb2.EchoParameterResponse()
            response.original_value = original_value
            response.processed_value = processed_value
            response.operation = operation
            
            print(f"🔄 EchoParameter response: {original_value} -> {processed_value} ({operation})")
            return response
            
        except Exception as e:
            print(f"❌ EchoParameter error: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"EchoParameter failed: {str(e)}")
            return geospatial_pb2.EchoParameterResponse()
    
    def AnalyzeCsv(self, request, context):
        """
        Analiza un archivo CSV para detectar nombres de columnas y tipos de datos desde las primeras dos filas
        
        @param request: AnalyzeCsvRequest with file_path, file_name, and rows_to_analyze
        @param context: gRPC context
        @returns: AnalyzeCsvResponse with column info and auto-detected mappings
        """
        try:
            response = self.project_manager.analyze_csv(request.file_path, request.file_name, request.rows_to_analyze)
            return response
            
        except Exception as e:
            print(f"❌ AnalyzeCsv error: {e}")
            response = files_pb2.AnalyzeCsvResponse()
            response.success = False
            response.error_message = str(e)
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"AnalyzeCsv failed: {str(e)}")
            return response

    def SendFile(self, request, context):
        """
        Process the complete CSV file with variable mappings and keep data in memory
        
        @param request: SendFileRequest with file path and variable mappings
        @param context: gRPC context
        @returns: SendFileResponse with processing statistics
        """
        try:
            response = self.project_manager.send_file(request)
            return response
            
        except Exception as e:
            print(f"❌ SendFile error: {e}")
            response = files_pb2.SendFileResponse()
            response.success = False
            response.errors.append(str(e))
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"SendFile failed: {str(e)}")
            return response

    def GetLoadedDataStats(self, request, context):
        """
        Get statistics about the currently loaded CSV data
        
        @param request: GetLoadedDataStatsRequest (empty for now)
        @param context: gRPC context
        @returns: GetLoadedDataStatsResponse with statistics
        """
        try:
            response = self.project_manager.get_loaded_data_stats()
            return response
            
        except Exception as e:
            print(f"❌ GetLoadedDataStats error: {e}")
            response = files_pb2.GetLoadedDataStatsResponse()
            response.has_data = False
            response.total_points = 0
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"GetLoadedDataStats failed: {str(e)}")
            return response
    
    def GetBatchDataColumnar(self, request, context):
        """
        Get batch data in columnar format for efficient processing
        
        @param request: GetBatchDataRequest with bounds, data types, max points, and resolution
        @param context: gRPC context
        @returns: GetBatchDataColumnarResponse with columnar data chunks
        """
        try:
            return self.data_generator.get_batch_data_columnar(request, context)
        except Exception as e:
            print(f"❌ Error in GetBatchDataColumnar: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Columnar batch data error: {str(e)}")
            return geospatial_pb2.GetBatchDataColumnarResponse()
    

    def GetBatchDataColumnarStreamed(self, request, context):
        """
        Stream batch data in columnar format with chunking
        
        @param request: GetBatchDataRequest with bounds, data types, max points, and resolution
        @param context: gRPC context
        @yields: ColumnarDataChunk messages
        """
        try:
            yield from self.data_generator.get_batch_data_columnar_streamed(request, context)
        except Exception as e:
            print(f"❌ Error in GetBatchDataColumnarStreamed: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"Columnar streamed data error: {str(e)}")

    # ========== Project Management Methods ==========
    
    def CreateProject(self, request, context):
        """Create a new project"""
        try:
            return self.project_manager.create_project(request)
        except Exception as e:
            print(f"❌ Error creating project: {e}")
            response = projects_pb2.CreateProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def GetProjects(self, request, context):
        """Get projects with pagination"""
        try:
            return self.project_manager.get_projects(request)
        except Exception as e:
            print(f"❌ Error getting projects: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return projects_pb2.GetProjectsResponse()
    
    def GetProject(self, request, context):
        """Get a single project"""
        try:
            return self.project_manager.get_project(request)
        except Exception as e:
            print(f"❌ Error getting project: {e}")
            response = projects_pb2.GetProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def UpdateProject(self, request, context):
        """Update a project"""
        try:
            return self.project_manager.update_project(request)
        except Exception as e:
            print(f"❌ Error updating project: {e}")
            response = projects_pb2.UpdateProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def DeleteProject(self, request, context):
        """Delete a project"""
        try:
            return self.project_manager.delete_project(request)
        except Exception as e:
            print(f"❌ Error deleting project: {e}")
            response = projects_pb2.DeleteProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    # ========== File Management Methods ==========
    
    def CreateFile(self, request, context):
        """Create a new file"""
        try:
            return self.project_manager.create_file(request)
        except Exception as e:
            print(f"❌ Error creating file: {e}")
            response = projects_pb2.CreateFileResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def GetProjectFiles(self, request, context):
        """Get all files for a project"""
        try:
            return self.project_manager.get_project_files(request)
        except Exception as e:
            print(f"❌ Error getting project files: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return projects_pb2.GetProjectFilesResponse()

    def GetProjectDatasets(self, request, context):
        """Get all datasets for a project"""
        try:
            return self.project_manager.get_project_datasets(request)
        except Exception as e:
            print(f"❌ Error getting project datasets: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(str(e))
            return projects_pb2.GetProjectDatasetsResponse()
    
    def DeleteFile(self, request, context):
        """Delete a file"""
        try:
            return self.project_manager.delete_file(request)
        except Exception as e:
            print(f"❌ Error deleting file: {e}")
            response = projects_pb2.DeleteFileResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    # ========== Enhanced CSV Processing Methods ==========
    
    def AnalyzeCsvForProject(self, request, context):
        """Analyze CSV file for project with enhanced column type detection"""
        try:
            return self.project_manager.analyze_csv_for_project(request)
        except Exception as e:
            print(f"❌ Error analyzing CSV: {e}")
            response = projects_pb2.AnalyzeCsvForProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def ProcessDataset(self, request, context):
        """Process dataset with column mappings"""
        try:
            return self.project_manager.process_dataset(request)
        except Exception as e:
            print(f"❌ Error processing dataset: {e}")
            response = projects_pb2.ProcessDatasetResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def GetDatasetData(self, request, context):
        """Get dataset data with pagination"""
        try:
            return self.project_manager.get_dataset_data(request)
        except Exception as e:
            print(f"❌ Error getting dataset data: {e}")
            response = projects_pb2.GetDatasetDataResponse()
            return response

    # Note: Data boundaries are now calculated directly in GetDatasetData method above
    # No separate boundaries method needed - simpler and more efficient!


def find_free_port(start_port=50051):
    """Find a free port starting from start_port"""
    for port in range(start_port, start_port + 10):
        try:
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                s.bind(('127.0.0.1', port))
                return port
        except OSError:
            continue
    return start_port  # Fallback


def serve():
    """Start the gRPC server"""
    try:
        # Use fixed port for gRPC
        port = 50077
        
        # Create server with increased message size limits (500MB)
        options = [
            ('grpc.max_send_message_length', 500 * 1024 * 1024),  # 500MB
            ('grpc.max_receive_message_length', 500 * 1024 * 1024),  # 500MB
        ]
        server = grpc.server(futures.ThreadPoolExecutor(max_workers=10), options=options)
        
        # Add service to server
        main_service_pb2_grpc.add_GeospatialServiceServicer_to_server(
            GeospatialServicer(), server
        )
        
        # Configure server
        listen_addr = f'127.0.0.1:{port}'
        server.add_insecure_port(listen_addr)
        
        # No need to write port file since we use fixed port 50077
        
        # Start server
        server.start()
        
        print(f"🚀 gRPC GeospatialService started on {listen_addr}")
        print("✅ Ready to accept connections")
        
        try:
            server.wait_for_termination()
        except KeyboardInterrupt:
            print("\n🛑 Shutting down gRPC server...")
            server.stop(grace=5)
                
    except Exception as e:
        print(f"❌ Failed to start gRPC server: {e}")
        
        # Write error to file
        script_dir = Path(__file__).parent.absolute()
        error_file = script_dir / 'grpc_error.txt'
        with open(error_file, 'w') as f:
            f.write(f"Error: {e}\n")
            import traceback
            f.write(traceback.format_exc())
        
        sys.exit(1)


if __name__ == '__main__':
    serve() 