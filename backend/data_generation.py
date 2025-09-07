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
        
        # Generando puntos en la grid usando numpy

        # Hacemos flatten debido a como se generan los puntos en numpy (2D)
        flat_lat = lat_mesh.flatten()[:max_points]
        flat_lng = lng_mesh.flatten()[:max_points]
        
        actual_count = len(flat_lat)
        
        if seed is not None:
            np.random.seed(seed)  
        else:
            ## Si no hay seed, usamos un seed aleatorio basado en tiempo
            import time
            random_seed = int(time.time() * 1000000) % 2**32
            np.random.seed(random_seed)

        # Agregamos variación aleatoria a las coordenadas x,y
        lat_variation = np.random.uniform(-0.01, 0.01, actual_count)  # ±0.01 grados lat
        lng_variation = np.random.uniform(-0.01, 0.01, actual_count)  # ±0.01 grados lng
        
        # Aplicamos la variación sin clipear para permitir bounds dinámicos
        flat_lat = flat_lat + lat_variation
        flat_lng = flat_lng + lng_variation

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
        }
        
        return columnar_data
    


    def get_columnar_data(self, request, context=None) -> geospatial_pb2.GetColumnarDataResponse:
        try:
            # Generate the columnar data first
            seed = request.seed if hasattr(request, 'seed') and request.seed > 0 else None
            columnar_data = self.generate_columnar_data(
                max_points=request.max_points,
                seed=seed
            )
            
            # Create response
            response = geospatial_pb2.GetColumnarDataResponse()
            response.total_count = len(columnar_data['x'])
            
            # Enviar como Float32Array binario optimizado para el frontend
            num_points = len(columnar_data['x'])
            flat_numpy = np.zeros(num_points * 3, dtype=np.float32, order='C')
            
            # Llenar el array eficientemente usando operaciones numpy
            flat_numpy[0::3] = np.array(columnar_data['x'], dtype=np.float32)  # coordenadas x
            flat_numpy[1::3] = np.array(columnar_data['y'], dtype=np.float32)  # coordenadas y  
            flat_numpy[2::3] = np.array(columnar_data['z'], dtype=np.float32)  # coordenadas z
            
            # Asegurar que el array sea contiguo
            aligned_array = np.ascontiguousarray(flat_numpy, dtype=np.float32)
            # Si no, es método gRPC/Protobuf, preparamos la respuesta
            # Convertir a bytes para protobuf
            binary_data = aligned_array.tobytes()
            
            # Configurar campos de respuesta
            response.binary_data = binary_data
            response.data_length = len(aligned_array)
            
            # Calculamos los limites para el gráfico y los seteamos en la response
            # 
            response.bounds['x'].min_value = np.min(columnar_data['x'])
            response.bounds['x'].max_value = np.max(columnar_data['x'])
            
            response.bounds['y'].min_value = np.min(columnar_data['y'])
            response.bounds['y'].max_value = np.max(columnar_data['y'])
            
            response.bounds['z'].min_value = np.min(columnar_data['z'])
            response.bounds['z'].max_value = np.max(columnar_data['z'])

            response.generated_at = time.time()
            
            # CRÍTICO: Calcular el tamaño del mensaje Protocol Buffer completo serializado
            # Esto incluye binary_data + metadata (total_count, bounds, generated_at, etc.)
            serialized_message = response.SerializeToString()
            
            # Agregar el tamaño del mensaje serializado completo para medición justa
            # Esto asegura que comparemos el mismo concepto: el payload completo de red
            response.message_size_bytes = len(serialized_message)
            
            return response
            
        except Exception as e:
            # Error en el procesamiento de datos
            if context:
                context.set_code(grpc.StatusCode.INTERNAL)
                context.set_details(f"Error de datos en formato flat: {str(e)}")
            return geospatial_pb2.GetColumnarDataResponse()
    



    def get_columnar_data_JSON(self, max_points: int = 1000, seed: int = None) -> geospatial_pb2.GetColumnarDataResponse:
            # Generate the columnar data first
            columnar_data = self.generate_columnar_data(
                max_points=max_points,
                seed=seed
            )
            
            # Enviar como Float32Array binario optimizado para el frontend
            num_points = len(columnar_data['x'])
            flat_numpy = np.zeros(num_points * 3, dtype=np.float32, order='C')
            
            # Llenar el array eficientemente usando operaciones numpy
            flat_numpy[0::3] = np.array(columnar_data['x'], dtype=np.float32)  # coordenadas x
            flat_numpy[1::3] = np.array(columnar_data['y'], dtype=np.float32)  # coordenadas y  
            flat_numpy[2::3] = np.array(columnar_data['z'], dtype=np.float32)  # coordenadas z
            
            # Asegurar que el array sea contiguo
            aligned_array = np.ascontiguousarray(flat_numpy, dtype=np.float32)
            array_list = aligned_array.tolist()
            return {
                    'data': array_list,
                    'total_count': num_points,
                    'bounds': {
                        'x': {
                            'min_value': np.min(columnar_data['x']),
                            'max_value': np.max(columnar_data['x'])
                        },
                        'y': {
                            'min_value': np.min(columnar_data['y']),
                            'max_value': np.max(columnar_data['y'])
                        },
                        'z': {
                            'min_value': np.min(columnar_data['z']),
                            'max_value': np.max(columnar_data['z'])
                        }
                    },
                    # Agregamos el tiempo de cuando estuvo lista la respuesta, para calcular tiempo de respuesta 
                    'generated_at': time.time()
                }
    
