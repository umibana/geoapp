#!/usr/bin/env python
"""
Servidor de gRPC
Contiene la definición de los servicios de la aplicación
"""
import sys
import time
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

    # Importamos las clases necesarias (Distintos modulos del backend)
    def __init__(self):
        self.version = "1.0.0"
        self.db = DatabaseManager()
        self.data_generator = DataGenerator()
        self.project_manager = ProjectManager(self.db)
    
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
    
    def GetProjectFiles(self, request, context):
        return self.project_manager.get_project_files(request)

    def GetProjectDatasets(self, request, context):
        return self.project_manager.get_project_datasets(request)
    
    def DeleteFile(self, request, context):
        return self.project_manager.delete_file(request)
    
    # ---------- Manejo de datasets ----------
    
    def AnalyzeCsvForProject(self, request, context):
        return self.project_manager.analyze_csv_for_project(request)
    
    def ProcessDataset(self, request, context):
        return self.project_manager.process_dataset(request)
    
    def GetDatasetData(self, request, context):
        return self.project_manager.get_dataset_data(request)
    
    def DeleteDataset(self, request, context):
        return self.project_manager.delete_dataset(request)


# Servidor gRPC
# Utilizamos el puerto 50077 para el servidor gRPC
# tambien configuramos el tamaño de los mensajes a 1GB
def serve():
    try:
        port = 50077
        options = [
            ('grpc.max_message_length', 1024 * 1024 * 1024),  # 1GB
            ('grpc.max_receive_message_length', 1024 * 1024 * 1024),  # 1GB
            ('grpc.max_send_message_length', 1024 * 1024 * 1024),  # 1GB
            # ('grpc.default_compression_level', 1),  # Nivel de compresión, uso 6, pero podría usar 1 si queremos menor latencia
            # ('grpc.compression_algorithm', grpc.Compression.Gzip),  # Al
            # Con 6 me toma 2-3s 1 million datos
            # con 1 me toma 1.8-2.3s
            # Sin compresion me toma 1.2-1.5s
        ]
        ## Definimos el servidor gRPC con el maximo de workers 10 y las opciones de maximo de mensaje
        server = grpc.server(futures.ThreadPoolExecutor(max_workers=10), options=options)
        
        # Agregamos el servicio principal al servidor gRPC
        main_service_pb2_grpc.add_GeospatialServiceServicer_to_server(
            GeospatialServicer(), server
        )
        
        listen_addr = f'127.0.0.1:{port}'
        server.add_insecure_port(listen_addr)

        server.start()
        
        print(f"Server gRPC (geospatialService) iniciado en {listen_addr}")
        
        try:
            server.wait_for_termination()
        except KeyboardInterrupt:
            print("\n Cerrando servidor gRPC...")
            server.stop(grace=5)
                
    except Exception as e:
        print(f"❌ Error al iniciar el servidor gRPC: {e}")
        
        # Escribimos el error en un archivo
        script_dir = Path(__file__).parent.absolute()
        error_file = script_dir / 'grpc_error.txt'
        with open(error_file, 'w') as f:
            f.write(f"Error: {e}\n")
            import traceback
            f.write(traceback.format_exc())
        
        sys.exit(1)


if __name__ == '__main__':
    serve() 