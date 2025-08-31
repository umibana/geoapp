#!/usr/bin/env python
"""
Data Generation Module
Handles columnar data generation for geospatial applications
"""

import time
import random
import math
from typing import Tuple, Dict, Any, Iterator
import numpy as np

# Import protobuf types and gRPC
import grpc
import geospatial_pb2


class DataGenerator:
    """Data generator for columnar geospatial data"""
    
    def __init__(self):
        print("📊 DataGenerator initialized")
    
    def generate_columnar_data(
        self, 
        max_points: int = 1000, 
        resolution: int = 20
    ) -> Tuple[Dict[str, Any], str]:
        """
        Generate simple geospatial data in columnar format.
        
        Args:
            max_points: Maximum number of points to generate
            resolution: Grid resolution for data generation
            
        Returns:
            Tuple of (columnar_data_dict, generation_method)
        """
        # Auto-generate default bounds (Santiago, Chile area)
        lat_min, lat_max = -33.6, -33.3
        lng_min, lng_max = -70.8, -70.5
        
        # Calculate resolution to achieve desired point count
        if max_points <= resolution * resolution:
            actual_resolution = resolution
        else:
            actual_resolution = max(resolution, int(math.sqrt(max_points)) + 1)
        
        lat_grid = np.linspace(lat_min, lat_max, actual_resolution, dtype=np.float64)
        lng_grid = np.linspace(lng_min, lng_max, actual_resolution, dtype=np.float64)
        lat_mesh, lng_mesh = np.meshgrid(lat_grid, lng_grid)
        
        print(f"🔢 Simple columnar data generation: requested={max_points}, resolution={resolution}, actual_resolution={actual_resolution}, max_possible={actual_resolution*actual_resolution}")
        
        generation_start = time.time()
        
        # Flatten to 1D arrays and limit to max_points
        flat_lat = lat_mesh.flatten()[:max_points]
        flat_lng = lng_mesh.flatten()[:max_points]
        
        actual_count = len(flat_lat)
        
        # Generate simple Z values (basic elevation-like pattern)
        z_values = []
        for i in range(actual_count):
            lat, lng = flat_lat[i], flat_lng[i]
            # Simple sine wave pattern for elevation
            z = 100 + 50 * np.sin(lat * 0.1) * np.cos(lng * 0.1)
            z_values.append(z)
        
        # Generate simple additional values
        value1 = []
        value2 = []
        value3 = []
        
        for i in range(actual_count):
            lat, lng = flat_lat[i], flat_lng[i]
            
            # Value1: Simple temperature-like pattern
            temp = 20 + 15 * np.sin(lat * 0.05) + random.uniform(-5, 5)
            value1.append(temp)
            
            # Value2: Simple pressure-like pattern  
            pressure = 1013 + 50 * np.cos(lng * 0.03) + random.uniform(-10, 10)
            value2.append(pressure)
            
            # Value3: Simple humidity-like pattern
            humidity = 50 + 30 * np.sin((lat + lng) * 0.02) + random.uniform(-10, 10)
            value3.append(max(0, min(100, humidity)))  # Clamp to 0-100%
        
        # Create columnar data structure with all values at top level
        columnar_data = {
            'id': [f'point_{i}' for i in range(actual_count)],
            'x': flat_lng.tolist(),    # X = longitude
            'y': flat_lat.tolist(),    # Y = latitude
            'z': z_values,             # Z = simple elevation
            'id_value': [f'sensor_{i % 10}' for i in range(actual_count)],
            'value1': value1,          # Temperature-like values
            'value2': value2,          # Pressure-like values  
            'value3': value3           # Humidity-like values
        }
        
        generation_time = time.time() - generation_start
        
        print(f"⏱️  Simple columnar data generation took: {generation_time:.3f}s for {actual_count} points")
        print(f"⏱️  Generation rate: {actual_count/generation_time:.0f} points/second")
        print(f"📊 Generated columns: id, x, y, z, id_value, value1, value2, value3")
        
        return columnar_data, 'simple_columnar_generation'
    
    def get_batch_data_columnar(self, request, context=None) -> geospatial_pb2.GetBatchDataColumnarResponse:
        """
        Get batch data in columnar format for efficient processing
        
        @param request: GetBatchDataRequest with bounds, data types, max points, and resolution
        @param context: gRPC context (optional)
        @returns: GetBatchDataColumnarResponse with columnar data chunks
        """
        try:
            
            # Use data generator to create columnar data
            columnar_data, generation_method = self.generate_columnar_data(
                max_points=request.max_points,
                resolution=request.resolution or 20
            )
            
            # Create response
            response = geospatial_pb2.GetBatchDataColumnarResponse()
            response.total_count = len(columnar_data['x'])
            response.generation_method = generation_method
            
            # Create columnar data chunk (single chunk for non-streaming)
            chunk = response.columnar_data
            chunk.id.extend(columnar_data['id'])
            chunk.x.extend(columnar_data['x'])
            chunk.y.extend(columnar_data['y'])
            chunk.z.extend(columnar_data['z'])
            chunk.id_value.extend(columnar_data['id_value'])
            chunk.generation_method = generation_method
            chunk.chunk_number = 0
            chunk.total_chunks = 1
            chunk.points_in_chunk = len(columnar_data['x'])
            chunk.is_final_chunk = True
            
            # Add the additional value columns
            additional_keys = ['value1', 'value2', 'value3']
            for key in additional_keys:
                if key in columnar_data:
                    double_array = geospatial_pb2.DoubleArray()
                    double_array.values.extend(columnar_data[key])
                    chunk.additional_data[key].CopyFrom(double_array)
            
            return response
            
        except Exception as e:
            print(f"❌ Error in get_batch_data_columnar: {e}")
            if context:
                context.set_code(grpc.StatusCode.INTERNAL)
                context.set_details(f"Columnar batch data error: {str(e)}")
            return geospatial_pb2.GetBatchDataColumnarResponse()
    
    def get_batch_data_columnar_streamed(self, request, context=None) -> Iterator[geospatial_pb2.ColumnarDataChunk]:
        """
        Stream batch data in columnar format with chunking
        
        @param request: GetBatchDataRequest with bounds, data types, max points, and resolution
        @param context: gRPC context (optional)
        @yields: ColumnarDataChunk messages
        """
        try:
            
            start_time = time.time()
            
            # Use data generator to create columnar data
            columnar_data, generation_method = self.generate_columnar_data(
                max_points=request.max_points,
                resolution=request.resolution or 20
            )
            
            total_points = len(columnar_data['x'])
            chunk_size = 25000  # 25K points per chunk
            total_chunks = (total_points + chunk_size - 1) // chunk_size
            
            print(f"🔄 Streaming {total_points} points in {total_chunks} chunks of {chunk_size} each")
            
            # Stream data in chunks
            for chunk_index in range(total_chunks):
                start_idx = chunk_index * chunk_size
                end_idx = min(start_idx + chunk_size, total_points)
                
                # Create chunk
                chunk = geospatial_pb2.ColumnarDataChunk()
                chunk.chunk_number = chunk_index
                chunk.total_chunks = total_chunks
                chunk.points_in_chunk = end_idx - start_idx
                chunk.is_final_chunk = (chunk_index == total_chunks - 1)
                chunk.generation_method = generation_method
                
                # Add data for this chunk
                chunk.id.extend(columnar_data['id'][start_idx:end_idx])
                chunk.x.extend(columnar_data['x'][start_idx:end_idx])
                chunk.y.extend(columnar_data['y'][start_idx:end_idx])
                chunk.z.extend(columnar_data['z'][start_idx:end_idx])
                chunk.id_value.extend(columnar_data['id_value'][start_idx:end_idx])
                
                # Add additional data columns
                additional_keys = ['value1', 'value2', 'value3']
                for key in additional_keys:
                    if key in columnar_data:
                        double_array = geospatial_pb2.DoubleArray()
                        double_array.values.extend(columnar_data[key][start_idx:end_idx])
                        chunk.additional_data[key].CopyFrom(double_array)
                
                yield chunk
                
                # Brief pause between chunks to prevent overwhelming
                if chunk_index < total_chunks - 1:
                    time.sleep(0.001)  # 1ms pause
            
            processing_time = time.time() - start_time
            print(f"✅ get_batch_data_columnar_streamed finished, streamed {total_points} points in {total_chunks} chunks ({processing_time:.3f}s)")
            
        except Exception as e:
            print(f"❌ Error in get_batch_data_columnar_streamed: {e}")
            if context:
                context.set_code(grpc.StatusCode.INTERNAL)
                context.set_details(f"Columnar streamed data error: {str(e)}")