#!/usr/bin/env python
"""
Servidor híbrido gRPC + Flask
Contiene la definición de los servicios de la aplicación
Ejecuta tanto gRPC (puerto 50077) como REST API (puerto 5000)
"""
import sys
import time
import socket
import json
import threading
from pathlib import Path
from concurrent import futures
from flask import Response

# Añadir el directorio actual al path de Python para encontrar archivos generados
script_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(script_dir))
sys.path.insert(0, str(script_dir / 'generated'))

try:
    import msgpack
except ImportError:
    print("⚠️ Warning: msgpack not installed. Install with: pip install msgpack")
    msgpack = None

import grpc
from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np

# Importar los archivos protobuf generados
import geospatial_pb2
import files_pb2
import projects_pb2
import main_service_pb2_grpc

from database import DatabaseManager
from data_generation import DataGenerator
from project_manager import ProjectManager
from db_benchmark import DatabaseBenchmark


class GeospatialServicer(main_service_pb2_grpc.GeospatialServiceServicer):

    # Importamos las clases necesarias (Distintos modulos del backend)
    def __init__(self):
        self.version = "1.0.0"
        self.db = DatabaseManager()
        self.data_generator = DataGenerator()
        self.project_manager = ProjectManager(self.db)
        self.database_benchmark = DatabaseBenchmark()
    
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

    # ---------- Benchmark de bases de datos ----------

    def RunDatabaseBenchmark(self, request, context):
        """
        Ejecuta benchmark comparativo entre SQLite y DuckDB
        """
        return self.database_benchmark.run_benchmark(request)


# =============================================================================
# FLASK REST API SETUP
# =============================================================================

# Instancia global del servicer para usar en Flask endpoints
servicer_instance = None

# Crear Flask app
app = Flask(__name__)


# =============================================================================
# HELPER FUNCTIONS FOR REST API
# =============================================================================

def create_mock_context():
    """Crea un contexto mock para llamadas gRPC desde REST"""
    class MockContext:
        def set_code(self, code):
            pass
        def set_details(self, details):
            pass
    return MockContext()


def convert_protobuf_to_dict(proto_obj):
    """
    Convierte un objeto protobuf a diccionario Python.
    Soporta campos repetidos, mapas y mensajes anidados.
    """
    from google.protobuf.json_format import MessageToDict
    return MessageToDict(proto_obj, preserving_proto_field_name=True)


CORS(app)  # Permitir CORS para desarrollo

# Configure Flask for large payloads
app.config['MAX_CONTENT_LENGTH'] = 1024 * 1024 * 4096  # 4GB max request size

# =============================================================================
# FLASK REST ENDPOINTS - BASIC TESTING
# =============================================================================

@app.route('/api/health', methods=['GET'])
def rest_health_check():
    """REST equivalent of HealthCheck"""
    request_obj = geospatial_pb2.HealthCheckRequest()
    response = servicer_instance.HealthCheck(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

@app.route('/api/hello', methods=['POST'])
def rest_hello_world():
    """REST equivalent of HelloWorld"""
    data = request.get_json()
    request_obj = geospatial_pb2.HelloWorldRequest()
    request_obj.message = data.get('message', '')
    response = servicer_instance.HelloWorld(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

@app.route('/api/echo', methods=['POST'])
def rest_echo_parameter():
    """REST equivalent of EchoParameter"""
    data = request.get_json()
    request_obj = geospatial_pb2.EchoParameterRequest()
    request_obj.value = data.get('value', 0)
    request_obj.operation = data.get('operation', '')
    response = servicer_instance.EchoParameter(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

# =============================================================================
# FLASK REST ENDPOINT
# =============================================================================


@app.route('/api/columnar-data', methods=['POST'])
def rest_get_columnar_data():
    """ getColumnarData con JSON en vez de protobuf"""
    data = request.get_json()
    
    columnar_data = servicer_instance.data_generator.get_columnar_data_JSON(
        max_points=data.get('max_points', 1000),
        seed=data.get('seed')
    )
    # Debug: Calcular tamaño del payload JSON (Debería verificar con Wireshark!)
    json_payload_size = len(json.dumps(columnar_data))
    print(f"Tamaño JSON: {json_payload_size:,} bytes ({json_payload_size/1024:.2f} KB) para {data.get('max_points', 1000):,} puntos")
    
    return columnar_data

@app.route('/api/columnar-data-msgpack', methods=['POST'])
def rest_get_columnar_data_msgpack():
    """ getColumnarData con MessagePack en vez de JSON o protobuf"""
    if not msgpack:
        return jsonify({"error": "MessagePack not available. Install with: pip install msgpack"}), 500
    
    data = request.get_json()
    
    columnar_data = servicer_instance.data_generator.get_columnar_data_JSON(
        max_points=data.get('max_points', 1000),
        seed=data.get('seed')
    )
    
    # Pack data with MessagePack
    msgpack_data = msgpack.packb(columnar_data)
    
    # Debug: Calculate MessagePack payload size vs JSON
    msgpack_payload_size = len(msgpack_data)
    print(f"Tamaño MessagePack: {msgpack_payload_size:,} bytes ({msgpack_payload_size/1024:.2f} KB) para {data.get('max_points', 1000):,} puntos")
    
    # Return binary MessagePack data with proper content type
    return Response(msgpack_data, content_type='application/msgpack')

# =============================================================================
# FLASK REST ENDPOINTS - PROJECT MANAGEMENT
# =============================================================================

@app.route('/api/projects', methods=['GET'])
def rest_get_projects():
    """REST equivalent of GetProjects"""
    request_obj = projects_pb2.GetProjectsRequest()
    response = servicer_instance.GetProjects(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

@app.route('/api/projects', methods=['POST'])
def rest_create_project():
    """REST equivalent of CreateProject"""
    data = request.get_json()
    request_obj = projects_pb2.CreateProjectRequest()
    request_obj.name = data.get('name', '')
    request_obj.description = data.get('description', '')
    response = servicer_instance.CreateProject(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

@app.route('/api/projects/<project_id>', methods=['GET'])
def rest_get_project(project_id):
    """REST equivalent of GetProject"""
    request_obj = projects_pb2.GetProjectRequest()
    request_obj.id = project_id
    response = servicer_instance.GetProject(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

@app.route('/api/projects/<project_id>', methods=['PUT'])
def rest_update_project(project_id):
    """REST equivalent of UpdateProject"""
    data = request.get_json()
    request_obj = projects_pb2.UpdateProjectRequest()
    request_obj.id = project_id
    request_obj.name = data.get('name', '')
    request_obj.description = data.get('description', '')
    response = servicer_instance.UpdateProject(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

@app.route('/api/projects/<project_id>', methods=['DELETE'])
def rest_delete_project(project_id):
    """REST equivalent of DeleteProject"""
    request_obj = projects_pb2.DeleteProjectRequest()
    request_obj.id = project_id
    response = servicer_instance.DeleteProject(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

# =============================================================================
# FLASK REST ENDPOINTS - FILE MANAGEMENT
# =============================================================================

@app.route('/api/projects/<project_id>/files', methods=['GET'])
def rest_get_project_files(project_id):
    """REST equivalent of GetProjectFiles"""
    request_obj = projects_pb2.GetProjectFilesRequest()
    request_obj.project_id = project_id
    response = servicer_instance.GetProjectFiles(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

@app.route('/api/projects/<project_id>/files', methods=['POST'])
def rest_create_file(project_id):
    """REST equivalent of CreateFile"""
    data = request.get_json()
    request_obj = projects_pb2.CreateFileRequest()
    request_obj.project_id = project_id
    request_obj.filename = data.get('filename', '')
    request_obj.filepath = data.get('filepath', '')
    response = servicer_instance.CreateFile(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

@app.route('/api/files/<file_id>', methods=['DELETE'])
def rest_delete_file(file_id):
    """REST equivalent of DeleteFile"""
    request_obj = projects_pb2.DeleteFileRequest()
    request_obj.id = file_id
    response = servicer_instance.DeleteFile(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

# =============================================================================
# FLASK REST ENDPOINTS - DATASET MANAGEMENT
# =============================================================================

@app.route('/api/projects/<project_id>/datasets', methods=['GET'])
def rest_get_project_datasets(project_id):
    """REST equivalent of GetProjectDatasets"""
    request_obj = projects_pb2.GetProjectDatasetsRequest()
    request_obj.project_id = project_id
    response = servicer_instance.GetProjectDatasets(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

@app.route('/api/datasets/<dataset_id>', methods=['DELETE'])
def rest_delete_dataset(dataset_id):
    """REST equivalent of DeleteDataset"""
    request_obj = projects_pb2.DeleteDatasetRequest()
    request_obj.id = dataset_id
    response = servicer_instance.DeleteDataset(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

@app.route('/api/datasets/<dataset_id>/data', methods=['GET'])
def rest_get_dataset_data(dataset_id):
    """REST equivalent of GetDatasetData"""
    request_obj = projects_pb2.GetDatasetDataRequest()
    request_obj.dataset_id = dataset_id
    response = servicer_instance.GetDatasetData(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

@app.route('/api/datasets/analyze', methods=['POST'])
def rest_analyze_csv_for_project():
    """REST equivalent of AnalyzeCsvForProject"""
    data = request.get_json()
    request_obj = projects_pb2.AnalyzeCsvForProjectRequest()
    request_obj.project_id = data.get('project_id', '')
    request_obj.file_path = data.get('file_path', '')
    response = servicer_instance.AnalyzeCsvForProject(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))

@app.route('/api/datasets/process', methods=['POST'])
def rest_process_dataset():
    """REST equivalent of ProcessDataset"""
    data = request.get_json()
    request_obj = projects_pb2.ProcessDatasetRequest()
    request_obj.dataset_id = data.get('dataset_id', '')
    response = servicer_instance.ProcessDataset(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))


# =============================================================================
# FLASK REST ENDPOINTS - DATABASE BENCHMARK
# =============================================================================

@app.route('/api/benchmark/database', methods=['POST'])
def rest_run_database_benchmark():
    """REST equivalent of RunDatabaseBenchmark - SQLite vs DuckDB comparison"""
    data = request.get_json()
    request_obj = geospatial_pb2.DatabaseBenchmarkRequest()
    request_obj.num_rows = data.get('num_rows', 10000)
    request_obj.seed = data.get('seed', 0)
    request_obj.run_insert = data.get('run_insert', True)
    request_obj.run_query = data.get('run_query', True)
    request_obj.run_aggregation = data.get('run_aggregation', True)
    request_obj.run_filter = data.get('run_filter', True)
    response = servicer_instance.RunDatabaseBenchmark(request_obj, create_mock_context())
    return jsonify(convert_protobuf_to_dict(response))


def run_flask_server():
    """Ejecutar el servidor Flask en un hilo separado"""
    print("🌐 Starting Flask REST API server on http://127.0.0.1:5000")
    app.run(host='127.0.0.1', port=5000, debug=False, use_reloader=False)


# =============================================================================
# GRPC SERVER SETUP
# =============================================================================

# Servidor híbrido: gRPC (puerto 50077) + Flask REST (puerto 5000)
def serve():
    try:
        global servicer_instance
        
        # Crear instancia del servicer para usar en ambos servidores
        servicer_instance = GeospatialServicer()
        
        # =============================================================================
        # CONFIGURAR SERVIDOR gRPC
        # =============================================================================
        grpc_port = 50077
        options = [
            ('grpc.max_send_message_length', 500 * 1024 * 1024),  # 500MB
            ('grpc.max_receive_message_length', 500 * 1024 * 1024),  # 500MB
        ]
        grpc_server = grpc.server(futures.ThreadPoolExecutor(max_workers=10), options=options)
        
        # Agregar servicer al servidor gRPC
        main_service_pb2_grpc.add_GeospatialServiceServicer_to_server(
            servicer_instance, grpc_server
        )
        
        grpc_listen_addr = f'127.0.0.1:{grpc_port}'
        grpc_server.add_insecure_port(grpc_listen_addr)
        grpc_server.start()
        
        print(f"🚀 gRPC server started on {grpc_listen_addr}")
        
        # =============================================================================
        # INICIAR SERVIDOR FLASK EN HILO SEPARADO
        # =============================================================================
        flask_thread = threading.Thread(target=run_flask_server, daemon=True)
        flask_thread.start()
        
        print("🎯 Hybrid server running:")
        print(f"   • gRPC API (Protocol Buffers): http://127.0.0.1:{grpc_port}")
        print(f"   • REST API (JSON): http://127.0.0.1:5000")
        print("   • Press Ctrl+C to stop both servers")
        
        try:
            grpc_server.wait_for_termination()
        except KeyboardInterrupt:
            print("\n🛑 Stopping hybrid server...")
            grpc_server.stop(grace=5)
            print("✅ Both gRPC and Flask servers stopped")
                
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