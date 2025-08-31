#!/usr/bin/env python
# Generador de datos geoespaciales
# Usamos formato x:[], y:[], z:[], id_value:[], value1:[], value2:[], value3:[]
# Estos datos se utilizan como prueba de sistema

import time
import math
from typing import Iterator
import numpy as np
import sys
from pathlib import Path

# Add generated directory to path for protobuf imports
script_dir = Path(__file__).parent.absolute()
sys.path.insert(0, str(script_dir / 'generated'))

# Import protobuf types and gRPC
import grpc
import geospatial_pb2


class DataGenerator:
    
    def __init__(self):
        pass
    
    # Función para generar datos
    # Usamos formato x:[], y:[], z:[], id_value:[], value1:[], value2:[], value3:[]
    # Se debe pasar el numero de puntos a generar
    def generate_columnar_data(
        self, 
        max_points: int = 1000,
        seed: int = None
    ):
    # Primero, definimos el bounding box (Simulando analisis de pandas y sus min-max)
        lat_min, lat_max = -33.6, -33.3
        lng_min, lng_max = -70.8, -70.5
        
        # Calculamos la resolución de la grid basada en el numero de puntos a generar
        actual_resolution = int(math.sqrt(max_points)) + 1
        # Generamos los puntos
        lat_grid = np.linspace(lat_min, lat_max, actual_resolution, dtype=np.float64)
        lng_grid = np.linspace(lng_min, lng_max, actual_resolution, dtype=np.float64)
        lat_mesh, lng_mesh = np.meshgrid(lat_grid, lng_grid)
        
        print("🔢 Generando puntos en la grid usando numpy")

        # Hacemos flatten debido a como se generan los puntos en numpy (2D)
        flat_lat = lat_mesh.flatten()[:max_points]
        flat_lng = lng_mesh.flatten()[:max_points]
        
        actual_count = len(flat_lat)
        
        if seed is not None:
            np.random.seed(seed)  
        else:
            ## Si no hay seed, usamos un seed aleatorio
            np.random.seed()

        # Generamos valores de prueba con numpy
        z_values = 100 + 50 * np.sin(flat_lat * 0.1) * np.cos(flat_lng * 0.1)

        noise1 = np.random.uniform(-5, 5, actual_count)
        value1 = 20 + 15 * np.sin(flat_lat * 0.05) + noise1
        
        noise2 = np.random.uniform(-10, 10, actual_count)
        value2 = 1013 + 50 * np.cos(flat_lng * 0.03) + noise2
        
        noise3 = np.random.uniform(-10, 10, actual_count)
        value3_raw = 50 + 30 * np.sin((flat_lat + flat_lng) * 0.02) + noise3
        value3 = np.clip(value3_raw, 0, 100) 
        
        # Creamos la estructura de datos columnar con todos los numpy arrays convertidos a listas
        # Se deja de este formato para despues comprobar diferencia con JSON/Protocol Buffers
        columnar_data = {
            'id': [f'point_{i}' for i in range(actual_count)],
            'x': flat_lng.tolist(),    # X = longitude
            'y': flat_lat.tolist(),    # Y = latitude
            'z': z_values.tolist(),    # Z = elevacion
            'id_value': [f'sensor_{i % 10}' for i in range(actual_count)],
            'value1': value1.tolist(), 
            'value2': value2.tolist(), 
            'value3': value3.tolist()  
        }
        
        return columnar_data
    
    # Conseguir datos en formato columnar
    # Se trata un solo chunk, para no streaming (Y reutilizar codigo de streaming)
    def get_batch_data_columnar(self, request, context=None) -> geospatial_pb2.GetBatchDataColumnarResponse:
        try:
            
            # Usamos el generador de datos para crear los datos columnar
            columnar_data = self.generate_columnar_data(
                max_points=request.max_points
            )
            
            # Creamos la respuesta de gRPC
            response = geospatial_pb2.GetBatchDataColumnarResponse()
            response.total_count = len(columnar_data['x'])
            
            # Creamos el chunk de datos columnar (un solo chunk para no streaming)
            chunk = response.columnar_data
            chunk.id.extend(columnar_data['id'])
            chunk.x.extend(columnar_data['x'])
            chunk.y.extend(columnar_data['y'])
            chunk.z.extend(columnar_data['z'])
            chunk.id_value.extend(columnar_data['id_value'])
            chunk.chunk_number = 0
            chunk.total_chunks = 1
            chunk.points_in_chunk = len(columnar_data['x'])
            chunk.is_final_chunk = True
            
            # Agregamos las columnas adicionales de valores (Repeated en Protocol Buffer)
            additional_keys = ['value1', 'value2', 'value3']
            for key in additional_keys:
                if key in columnar_data:
                    double_array = geospatial_pb2.DoubleArray()
                    double_array.values.extend(columnar_data[key])
                    chunk.additional_data[key].CopyFrom(double_array)
            
            return response
            
        except Exception as e:
            print(f"❌ Error en get_batch_data_columnar: {e}")
            if context:
                context.set_code(grpc.StatusCode.INTERNAL)
                context.set_details(f"Error de datos en formato columnar: {str(e)}")
            return geospatial_pb2.GetBatchDataColumnarResponse()
    
    # Conseguir datos en formato columnar streaming
    # Se trata varios chunks, para streaming
    def get_batch_data_columnar_streamed(self, request, context=None) -> Iterator[geospatial_pb2.ColumnarDataChunk]:

        try:
            
            # Usamos el generador de datos para crear los datos columnar
            columnar_data = self.generate_columnar_data(
                max_points=request.max_points
            )
            
            total_points = len(columnar_data['x'])
            # Definimos el tamaño de los chunks (25K puntos por chunk, ajustable)
            chunk_size = 25000 
            total_chunks = (total_points + chunk_size - 1) // chunk_size
            
            print(f"🔄 Streaming {total_points} puntos en {total_chunks} chunks de {chunk_size} cada uno")
            
            # Streaming de datos en chunks
            for chunk_index in range(total_chunks):
                start_idx = chunk_index * chunk_size
                end_idx = min(start_idx + chunk_size, total_points)
                
                # Creamos el chunk
                chunk = geospatial_pb2.ColumnarDataChunk()
                chunk.chunk_number = chunk_index
                chunk.total_chunks = total_chunks
                chunk.points_in_chunk = end_idx - start_idx
                chunk.is_final_chunk = (chunk_index == total_chunks - 1)
                # Agregamos los datos para este chunk
                chunk.id.extend(columnar_data['id'][start_idx:end_idx])
                chunk.x.extend(columnar_data['x'][start_idx:end_idx])
                chunk.y.extend(columnar_data['y'][start_idx:end_idx])
                chunk.z.extend(columnar_data['z'][start_idx:end_idx])
                chunk.id_value.extend(columnar_data['id_value'][start_idx:end_idx])
                
                # Agregamos las columnas adicionales de valores (Repeated en Protocol Buffer)
                additional_keys = ['value1', 'value2', 'value3']
                for key in additional_keys:
                    if key in columnar_data:
                        double_array = geospatial_pb2.DoubleArray()
                        double_array.values.extend(columnar_data[key][start_idx:end_idx])
                        chunk.additional_data[key].CopyFrom(double_array)
                # Usamos yield para streaming
                yield chunk
                
                # Pausa entre chunks para evitar sobrecargar la memoria
                if chunk_index < total_chunks - 1:
                    time.sleep(0.001)  # 1ms de pausa
            
            print(f"✅ get_batch_data_columnar_streamed terminado, streaming de {total_points} puntos en {total_chunks} chunks")
            
        except Exception as e:
            print(f"❌ Error en get_batch_data_columnar_streamed: {e}")
            if context:
                context.set_code(grpc.StatusCode.INTERNAL)
                context.set_details(f"Error de datos en formato columnar streaming: {str(e)}")