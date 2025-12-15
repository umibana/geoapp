#!/usr/bin/env python
"""
Servidor de gRPC
Contiene la definición de los servicios de la aplicación
"""
import sys
import time
from pathlib import Path
from concurrent import futures
import grpc

from grpc_reflection.v1alpha import reflection

script_dir = Path(__file__).parent.absolute()
generated_dir = script_dir / 'generated'

# Add backend/ to path (for modules.* imports)
if str(script_dir) not in sys.path:
    sys.path.insert(0, str(script_dir))

# Add backend/generated/ to path (for protobuf imports)
if str(generated_dir) not in sys.path:
    sys.path.insert(0, str(generated_dir))

# Importamos los archivos protobuf generados
import geospatial_pb2  # pyright: ignore[reportMissingImports]
import files_pb2  # pyright: ignore[reportMissingImports]
import projects_pb2  # pyright: ignore[reportMissingImports]
import main_service_pb2_grpc  # pyright: ignore[reportMissingImports]
import main_service_pb2  # pyright: ignore[reportMissingImports]

from modules.others import db_connection, models
from modules.others.data_generation import DataGenerator
from modules.others.progress_tracker import progress_tracker, OperationStatus
from modules.project_explorer.project_manager import ProjectManager
from modules.data_manipulation.data_operations import DataManipulationManager
from modules.exploratory_data_analysis.eda_manager import EDAManager
from modules.processing.IDW import IDWManager

class GeospatialServicer(main_service_pb2_grpc.GeospatialServiceServicer):

    # Importamos las clases necesarias (Distintos modulos del backend)
    def __init__(self):
        self.version = "1.0.0"
        
        # Initialize shared database engine
        engine = db_connection.get_db_engine()
        db_connection.initialize_database(engine)
        
        # Initialize managers with shared engine
        self.data_generator = DataGenerator()
        self.eda_manager = EDAManager(engine)
        self.data_manipulation = DataManipulationManager(engine, self.eda_manager)
        self.project_manager = ProjectManager(engine, self.eda_manager)
        self.idw_manager = IDWManager(engine)
    
    """
    -------- Definición de métodos para probar conexión de gRPC -------- 
    """
    def HealthCheck(self, request, context):
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
            print("[OK] Health check: OK")
            return response
            
        except Exception as e:
            print(f"[ERROR] Health check error: {e}")
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
            print(f"[ERROR] HelloWorld error: {e}")
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
            print(f"[ERROR] EchoParameter error: {e}")
            context.set_code(grpc.StatusCode.INTERNAL)
            context.set_details(f"EchoParameter failed: {str(e)}")
            return geospatial_pb2.EchoParameterResponse()
    
    
    def GetColumnarData(self, request, context):
        return self.data_generator.get_columnar_data(request, context)
    


    # ---------- Manejo de proyectos ----------
    # Crud basico,usamos los métodos definidos en project_manager.py para crear un proyecto
    #
    
    def CreateProject(self, request, context):
        return self.project_manager.create_project(request)
    
    def GetProject(self, request, context):
        return self.project_manager.get_project(request)
    
    def UpdateProject(self, request, context):
        return self.project_manager.update_project(request)
    
    def DeleteProject(self, request, context):
        return self.project_manager.delete_project(request)

    # Obtenemos multiples proyectos
    def GetProjects(self, request, context):
        return self.project_manager.get_projects(request)
    
    # ---------- Manejo de archivos ----------

    def CreateFile(self, request, context):
        return self.project_manager.create_file(request)
    
    def CreateMultiFile(self, request, context):
        return self.project_manager.create_multi_file(request)
    
    def GetProjectFiles(self, request, context):
        return self.project_manager.get_project_files(request)

    def GetProjectDatasets(self, request, context):
        return self.project_manager.get_project_datasets(request)
    
    def DeleteFile(self, request, context):
        return self.project_manager.delete_file(request)

    def UpdateFile(self, request, context):
        return self.project_manager.update_file(request)

    def RenameFileColumn(self, request, context):
        return self.project_manager.rename_file_column(request)

    def GetFileStatistics(self, request, context):
        return self.eda_manager.get_file_statistics(request)

    # ---------- Manipulación de datos de archivos ----------

    def ReplaceFileData(self, request, context):
        return self.data_manipulation.replace_file_data(request)

    def UpdateCell(self, request, context):
        return self.data_manipulation.update_cell(request)

    def SearchFileData(self, request, context):
        return self.data_manipulation.search_file_data(request)

    def FilterFileData(self, request, context):
        return self.data_manipulation.filter_file_data(request)

    def DeleteFilePoints(self, request, context):
        return self.data_manipulation.delete_file_points(request)

    def AddFilteredColumn(self, request, context):
        return self.data_manipulation.add_filtered_column(request)

    # ---------- Operaciones avanzadas de columnas ----------

    def AddFileColumns(self, request, context):
        return self.data_manipulation.add_file_columns(request)

    def DuplicateFileColumns(self, request, context):
        return self.data_manipulation.duplicate_file_columns(request)

    def DeleteFileColumns(self, request, context):
        return self.data_manipulation.delete_file_columns(request)

    # ---------- Manejo de datasets ----------

    def AnalyzeCsvForProject(self, request, context):
        return self.project_manager.analyze_csv_for_project(request)
    
    def ProcessDataset(self, request, context):
        return self.project_manager.process_dataset(request)
    
    def GetDatasetData(self, request, context):
        return self.eda_manager.get_dataset_data(request)
    
    def GetDatasetTableData(self, request, context):
        return self.eda_manager.get_dataset_table_data(request)
    
    def DeleteDataset(self, request, context):
        return self.project_manager.delete_dataset(request)

    def MergeDatasets(self, request, context):
        return self.data_manipulation.merge_datasets(request)

    # ---------- Processing / Estimation ----------

    def CalculateIdw(self, request, context):
        return self.idw_manager.calculate_idw(request)

    # ---------- Operation Progress Tracking ----------

    def GetOperationProgress(self, request, context):
        """Get progress for a specific operation."""
        operation_id = request.operation_id
        op = progress_tracker.get(operation_id)
        
        response = projects_pb2.GetOperationProgressResponse()
        if op:
            response.found = True
            response.operation.operation_id = op.operation_id
            response.operation.operation_type = op.operation_type
            response.operation.progress = op.progress
            response.operation.status = self._map_status_to_proto(op.status)
            response.operation.message = op.message
            response.operation.started_at = int(op.started_at)
            response.operation.updated_at = int(op.updated_at)
            response.operation.error = op.error or ""
        else:
            response.found = False
        
        return response

    def GetActiveOperations(self, request, context):
        """Get all active (running) operations."""
        active_ops = progress_tracker.get_active()
        
        response = projects_pb2.GetActiveOperationsResponse()
        for op in active_ops.values():
            op_proto = projects_pb2.OperationProgress(
                operation_id=op.operation_id,
                operation_type=op.operation_type,
                progress=op.progress,
                status=self._map_status_to_proto(op.status),
                message=op.message,
                started_at=int(op.started_at),
                updated_at=int(op.updated_at),
                error=op.error or ""
            )
            response.operations.append(op_proto)
        
        return response

    def CancelOperation(self, request, context):
        """Cancel an operation."""
        success = progress_tracker.cancel(request.operation_id)
        
        response = projects_pb2.CancelOperationResponse()
        response.success = success
        if not success:
            response.error_message = "Operation not found or already completed"
        
        return response

    def _map_status_to_proto(self, status: OperationStatus) -> int:
        """Map internal OperationStatus to proto enum value."""
        mapping = {
            OperationStatus.PENDING: projects_pb2.OPERATION_STATUS_PENDING,
            OperationStatus.RUNNING: projects_pb2.OPERATION_STATUS_RUNNING,
            OperationStatus.COMPLETED: projects_pb2.OPERATION_STATUS_COMPLETED,
            OperationStatus.CANCELLED: projects_pb2.OPERATION_STATUS_CANCELLED,
            OperationStatus.FAILED: projects_pb2.OPERATION_STATUS_FAILED,
        }
        return mapping.get(status, projects_pb2.OPERATION_STATUS_UNSPECIFIED)


# Servidor gRPC
# Utilizamos el puerto 50077 para el servidor gRPC
# tambien configuramos el tamaño de los mensajes a 1GB
            # ('grpc.default_compression_level', 1),  # Nivel de compresión, uso 6, pero podría usar 1 si queremos menor latencia
            # ('grpc.compression_algorithm', grpc.Compression.Gzip),  # Al
            # Con 6 me toma 2-3s 1 million datos
            # con 1 me toma 1.8-2.3s
            # Sin compresion me toma 1.2-1.5s
def serve():
    try:
        port = 50077
        options = [
            ('grpc.max_message_length', 1024 * 1024 * 1024),('grpc.max_receive_message_length', 1024 * 1024 * 1024),  
            ('grpc.max_send_message_length', 1024 * 1024 * 1024),  
        ]
        ## Definimos el servidor gRPC con el maximo de workers 10 y las opciones de maximo de mensaje
        server = grpc.server(futures.ThreadPoolExecutor(max_workers=10), options=options)
        # Agregamos el servicio principal al servidor gRPC
        main_service_pb2_grpc.add_GeospatialServiceServicer_to_server(GeospatialServicer(), server)
        # Esto se hace para que el servidor gRPC sea reflectivo (Osea, exponga métodos en servicio)
        # Muy util para probar API con grpc_cli/grpcurl o Kreya 
        SERVICE_NAMES = (
            main_service_pb2.DESCRIPTOR.services_by_name['GeospatialService'].full_name,
            reflection.SERVICE_NAME,
        )
        reflection.enable_server_reflection(SERVICE_NAMES, server)
        listen_addr = f'localhost:{port}'
        server.add_insecure_port(listen_addr)
        server.start()
        print(f"Server gRPC iniciado en {listen_addr}")
        try:
            server.wait_for_termination()
        except KeyboardInterrupt:
            print("\n Cerrando servidor gRPC...")
            server.stop(grace=5)
    except Exception as e:
        print(f"[ERROR] Error al iniciar el servidor gRPC: {e}")
        try:
            app_data_dir = db_connection.get_app_data_dir()
            error_file = app_data_dir / 'grpc_error.txt'
            with open(error_file, 'w') as f:
                f.write(f"Error: {e}\n")
                import traceback
                f.write(traceback.format_exc())
            print(f"[ERROR] Error details written to: {error_file}")
        except Exception as write_error:
            print(f"[ERROR] Could not write error file: {write_error}")
        sys.exit(1)
if __name__ == '__main__':
    serve() 