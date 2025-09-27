#!/usr/bin/env python
"""
Módulo de gestión de proyectos
Maneja operaciones de proyectos y archivos CSV usando DuckDB
"""

import time
import json
import os
from pathlib import Path
from typing import List, Dict, Any
import numpy as np
import pandas as pd

# Importar tipos protobuf
from generated import projects_pb2


class ProjectManager:
    """Gestor de proyectos y operaciones con archivos CSV"""
    
    def __init__(self, db_manager):
        self.db = db_manager
    
    # ========== Métodos de gestión de proyectos ==========
    
    def create_project(self, request: projects_pb2.CreateProjectRequest) -> projects_pb2.CreateProjectResponse:
        """Crear un nuevo proyecto"""
        try:
            
            # Llamar a la función create_project para crear el proyecto
            project_data = self.db.create_project(request.name, request.description)
            
            # Crear la respuesta
            response = projects_pb2.CreateProjectResponse()
            response.success = True
            
            # Llenar los datos del proyecto
            project = response.project
            project.id = project_data.id
            project.name = project_data.name
            project.description = project_data.description
            project.created_at = project_data.created_at
            project.updated_at = project_data.updated_at
            
            return response
            
        except Exception as e:
            response = projects_pb2.CreateProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def get_projects(self, request: projects_pb2.GetProjectsRequest) -> projects_pb2.GetProjectsResponse:
        """Obtener proyectos con paginación"""
        try:
            
            projects_data, total_count = self.db.get_projects(request.limit or 100, request.offset)
            
            response = projects_pb2.GetProjectsResponse()
            response.total_count = total_count
            
            for project_data in projects_data:
                project = response.projects.add()
                project.id = project_data.id
                project.name = project_data.name
                project.description = project_data.description
                project.created_at = project_data.created_at
                project.updated_at = project_data.updated_at
            
            return response
            
        except Exception as e:
            response = projects_pb2.GetProjectsResponse()
            return response
    
    def get_project(self, request: projects_pb2.GetProjectRequest) -> projects_pb2.GetProjectResponse:
        """Obtener un proyecto específico"""
        try:
            
            project_data = self.db.get_project(request.project_id)
            
            response = projects_pb2.GetProjectResponse()
            if project_data:
                response.success = True
                project = response.project
                project.id = project_data.id
                project.name = project_data.name
                project.description = project_data.description
                project.created_at = project_data.created_at
                project.updated_at = project_data.updated_at
            else:
                response.success = False
                response.error_message = "Proyecto no encontrado"
            
            return response
            
        except Exception as e:
            response = projects_pb2.GetProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def update_project(self, request: projects_pb2.UpdateProjectRequest) -> projects_pb2.UpdateProjectResponse:
        """Actualizar un proyecto"""
        try:
            
            updated_project = self.db.update_project(request.project_id, request.name, request.description)
            
            response = projects_pb2.UpdateProjectResponse()
            if updated_project:
                response.success = True
                project = response.project
                project.id = updated_project.id
                project.name = updated_project.name
                project.description = updated_project.description
                project.created_at = updated_project.created_at
                project.updated_at = updated_project.updated_at
            else:
                response.success = False
                response.error_message = "Proyecto no encontrado"
            
            return response
            
        except Exception as e:
            response = projects_pb2.UpdateProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def delete_project(self, request: projects_pb2.DeleteProjectRequest) -> projects_pb2.DeleteProjectResponse:
        """Eliminar un proyecto"""
        try:
            
            success = self.db.delete_project(request.project_id)
            
            response = projects_pb2.DeleteProjectResponse()
            response.success = success
            if not success:
                response.error_message = "Proyecto no encontrado"
            
            return response
            
        except Exception as e:
            response = projects_pb2.DeleteProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    # ========== Métodos de gestión de archivos ==========
    
    def create_file(self, request: projects_pb2.CreateFileRequest) -> projects_pb2.CreateFileResponse:
        """Crear un nuevo archivo con importación directa a DuckDB"""
        try:
            
            # Crear archivo con importación inmediata a DuckDB
            file_data, duckdb_table_name, column_statistics = self.db.create_file_with_csv(
                request.project_id,
                request.name,
                int(request.dataset_type),
                request.original_filename,
                request.file_content
            )
            
            
            response = projects_pb2.CreateFileResponse()
            response.success = True
            
            # Asignación directa de campos
            response.file.id = file_data.id
            response.file.project_id = file_data.project_id
            response.file.name = file_data.name
            response.file.dataset_type = file_data.dataset_type
            response.file.original_filename = file_data.original_filename
            response.file.file_size = file_data.file_size
            response.file.created_at = file_data.created_at
            
            return response
            
        except Exception as e:
            response = projects_pb2.CreateFileResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def get_project_files(self, request: projects_pb2.GetProjectFilesRequest) -> projects_pb2.GetProjectFilesResponse:
        """Obtener todos los archivos de un proyecto"""
        try:
            
            files_data = self.db.get_project_files(request.project_id)
            
            response = projects_pb2.GetProjectFilesResponse()
            
            for file_data in files_data:
                file = response.files.add()
                file.id = file_data.id
                file.project_id = file_data.project_id
                file.name = file_data.name
                file.dataset_type = file_data.dataset_type
                file.original_filename = file_data.original_filename
                file.file_size = file_data.file_size
                file.created_at = file_data.created_at
            
            return response
            
        except Exception as e:
            response = projects_pb2.GetProjectFilesResponse()
            return response

    def get_project_datasets(self, request: projects_pb2.GetProjectDatasetsRequest) -> projects_pb2.GetProjectDatasetsResponse:
        """Obtener todos los datasets de un proyecto"""
        try:
            
            datasets = self.db.get_datasets_by_project(request.project_id)
            
            response = projects_pb2.GetProjectDatasetsResponse()
            
            for dataset_data, file_data in datasets:
                dataset = response.datasets.add()
                dataset.id = dataset_data.id
                dataset.file_id = dataset_data.file_id
                dataset.file_name = file_data.name
                dataset.dataset_type = file_data.dataset_type
                dataset.original_filename = file_data.original_filename
                dataset.total_rows = dataset_data.total_rows
                dataset.created_at = dataset_data.created_at
                
                # Agregar mapeos de columnas - parsear JSON
                column_mappings = json.loads(dataset_data.column_mappings) if dataset_data.column_mappings else []
                for mapping in column_mappings:
                    col_mapping = dataset.column_mappings.add()
                    col_mapping.column_name = mapping['column_name']
                    col_mapping.column_type = mapping['column_type']
                    col_mapping.mapped_field = mapping['mapped_field']
                    col_mapping.is_coordinate = mapping['is_coordinate']
            
            return response
            
        except Exception as e:
            response = projects_pb2.GetProjectDatasetsResponse()
            return response
    
    def delete_file(self, request: projects_pb2.DeleteFileRequest) -> projects_pb2.DeleteFileResponse:
        """Eliminar un archivo"""
        try:
            
            success = self.db.delete_file(request.file_id)
            
            response = projects_pb2.DeleteFileResponse()
            response.success = success
            if not success:
                response.error_message = "Archivo no encontrado"
            
            return response
            
        except Exception as e:
            response = projects_pb2.DeleteFileResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    # ========== Métodos de procesamiento CSV mejorado ==========
    
    def analyze_csv_for_project(self, request: projects_pb2.AnalyzeCsvForProjectRequest) -> projects_pb2.AnalyzeCsvForProjectResponse:
        """Analizar archivo CSV para proyecto con detección mejorada de tipos de columna"""
        try:
            
            # Validar que file_id no esté vacío
            if not request.file_id:
                response = projects_pb2.AnalyzeCsvForProjectResponse()
                response.success = False
                response.error_message = "file_id no puede estar vacío"
                return response
            
            # Obtener datos de la tabla DuckDB (datos ya importados)
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            # Obtener datos de muestra de la tabla DuckDB
            try:
                with self.db.engine.connect() as conn:
                    from sqlalchemy import text
                    # Obtener esquema de la tabla
                    schema_result = conn.execute(text(f"DESCRIBE {table_name}"))
                    headers = [row[0] for row in schema_result]
                    
                    # Obtener primeras 5 filas para vista previa
                    preview_result = conn.execute(text(f"SELECT * FROM {table_name} LIMIT 5"))
                    preview_data = [list(row) for row in preview_result]
                    
                    # Obtener conteo total de filas
                    count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                    row_count = int(count_result[0])
                    
            except Exception as e:
                response = projects_pb2.AnalyzeCsvForProjectResponse()
                response.success = False
                response.error_message = "El archivo necesita ser re-subido para análisis."
                return response
            
            # Convertir datos de vista previa a formato protobuf
            preview_rows = []
            for row_data in preview_data:
                preview_row = projects_pb2.PreviewRow()
                preview_row.values.extend([str(val) for val in row_data])
                preview_rows.append(preview_row)
            
            # Detección simple de tipos
            suggested_types = []
            suggested_mappings = {}
            
            for header in headers:
                # Heurísticas simples para detección de tipo de columna
                if any(keyword in header.lower() for keyword in ['x', 'east', 'longitude', 'lon']):
                    suggested_types.append(projects_pb2.COLUMN_TYPE_NUMERIC)
                    suggested_mappings[header] = "x"
                elif any(keyword in header.lower() for keyword in ['latitude', 'lat', 'north', 'y']):
                    suggested_types.append(projects_pb2.COLUMN_TYPE_NUMERIC)
                    suggested_mappings[header] = "y"
                elif any(keyword in header.lower() for keyword in ['z', 'elevation', 'height', 'depth']):
                    suggested_types.append(projects_pb2.COLUMN_TYPE_NUMERIC)
                    suggested_mappings[header] = "z"
                elif any(keyword in header.lower() for keyword in ['id', 'name', 'type', 'category']):
                    suggested_types.append(projects_pb2.COLUMN_TYPE_CATEGORICAL)
                    suggested_mappings[header] = ""
                else:
                    suggested_types.append(projects_pb2.COLUMN_TYPE_NUMERIC)  # Por defecto numérico
                    suggested_mappings[header] = ""
            
            response = projects_pb2.AnalyzeCsvForProjectResponse()
            response.success = True
            response.headers.extend(headers)
            response.preview_rows.extend(preview_rows)
            response.suggested_types.extend(suggested_types)
            response.suggested_mappings.update(suggested_mappings)
            response.total_rows = row_count
            
            return response
            
        except Exception as e:
            response = projects_pb2.AnalyzeCsvForProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def _generate_statistics_from_duckdb(self, table_name: str) -> Dict[str, Dict[str, Any]]:
        """
        Generate statistics using DuckDB to_df() + pandas describe()
        
        Args:
            table_name: Name of the DuckDB table
            
        Returns:
            Dictionary of column statistics compatible with store_column_statistics
        """
        try:
            # Use DuckDB's to_df() method for efficient DataFrame conversion
            with self.db.engine.connect() as conn:
                duckdb_conn = conn.connection.connection
                # Get all data as DataFrame using DuckDB's native to_df()
                result = duckdb_conn.execute(f"SELECT * FROM {table_name}")
                df = result.df()
            
            if df.empty:
                return {}
                
            # Use pandas describe() for comprehensive statistics
            numeric_describe = df.select_dtypes(include=[np.number]).describe()
            
            # Track column types
            numeric_columns = list(numeric_describe.columns)
            categorical_columns = [col for col in df.columns if col not in numeric_columns]
            
            # Build statistics dictionary compatible with store_column_statistics
            column_statistics = {}
            
            # Statistics for numeric columns
            for col in numeric_columns:
                if col in numeric_describe.columns:
                    col_stats = numeric_describe[col]
                    count = col_stats.get('count', 0)
                    
                    if count > 0:  # Only store columns with valid data
                        column_statistics[col] = {
                            'column_type': 'numeric',
                            'count': float(count),
                            'mean': float(col_stats.get('mean', 0)) if not pd.isna(col_stats.get('mean')) else None,
                            'std': float(col_stats.get('std', 0)) if not pd.isna(col_stats.get('std')) else None,
                            'min': float(col_stats.get('min', 0)) if not pd.isna(col_stats.get('min')) else None,
                            '25%': float(col_stats.get('25%', 0)) if not pd.isna(col_stats.get('25%')) else None,
                            '50%': float(col_stats.get('50%', 0)) if not pd.isna(col_stats.get('50%')) else None,
                            '75%': float(col_stats.get('75%', 0)) if not pd.isna(col_stats.get('75%')) else None,
                            'max': float(col_stats.get('max', 0)) if not pd.isna(col_stats.get('max')) else None,
                            'null_count': int(df[col].isnull().sum()),
                            'unique_count': int(df[col].nunique()),
                            'total_rows': len(df)
                        }
            
            # Statistics for categorical columns  
            for col in categorical_columns:
                column_statistics[col] = {
                    'column_type': 'categorical',
                    'count': float(df[col].count()),
                    'null_count': int(df[col].isnull().sum()),
                    'unique_count': int(df[col].nunique()),
                    'total_rows': len(df)
                }
            
            return column_statistics
            
        except Exception as e:
            print(f"❌ Error generating statistics from DuckDB with pandas: {e}")
            return {}
    
    def process_dataset(self, request: projects_pb2.ProcessDatasetRequest) -> projects_pb2.ProcessDatasetResponse:
        """Procesar dataset con mapeos de columnas - datos ya en DuckDB"""
        try:
            
            # Obtener el nombre de la tabla DuckDB para este archivo
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            # Verificar que la tabla DuckDB existe y obtener conteo de filas
            try:
                with self.db.engine.connect() as conn:
                    from sqlalchemy import text
                    count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                    total_rows = int(count_result[0])
            except Exception as e:
                response = projects_pb2.ProcessDatasetResponse()
                response.success = False
                response.error_message = f"Tabla DuckDB no encontrada: {e}"
                return response
            
            # Crear registro de dataset con referencia a tabla DuckDB
            column_mappings_list = []
            for mapping in request.column_mappings:
                mapping_dict = {
                    'column_name': mapping.column_name,
                    'column_type': int(mapping.column_type),
                    'mapped_field': mapping.mapped_field,
                    'is_coordinate': mapping.is_coordinate
                }
                column_mappings_list.append(mapping_dict)
            
            # Crear registro de dataset que apunte a la tabla DuckDB
            dataset_data = self.db.create_dataset(request.file_id, table_name, total_rows, column_mappings_list)
            dataset_id = dataset_data.id
            
            # Generate and store column statistics for the dataset using pandas describe
            try:
                # We need to get the original file content to run pandas describe
                # For now, let's regenerate statistics directly from DuckDB using SQL queries
                column_statistics = self._generate_statistics_from_duckdb(table_name)
                
                if column_statistics:
                    self.db.store_column_statistics(dataset_id, column_statistics)
            except Exception as e:
                import traceback
                traceback.print_exc()
            
            
            response = projects_pb2.ProcessDatasetResponse()
            response.success = True
            response.processed_rows = total_rows
            
            # Poblar datos del dataset
            dataset = response.dataset
            dataset.id = dataset_id
            dataset.file_id = dataset_data.file_id
            dataset.total_rows = dataset_data.total_rows
            dataset.created_at = dataset_data.created_at
            
            # Agregar mapeos de columnas
            column_mappings = json.loads(dataset_data.column_mappings) if dataset_data.column_mappings else []
            for mapping_dict in column_mappings:
                mapping = dataset.column_mappings.add()
                mapping.column_name = mapping_dict['column_name']
                mapping.column_type = mapping_dict['column_type']
                mapping.mapped_field = mapping_dict['mapped_field']
                mapping.is_coordinate = mapping_dict['is_coordinate']
            
            return response
            
        except Exception as e:
            response = projects_pb2.ProcessDatasetResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    
    
    def get_dataset_data(self, request: projects_pb2.GetDatasetDataRequest) -> projects_pb2.GetDatasetDataResponse:
        try:
            # Use default columns if not specified
            columns = list(request.columns) if request.columns else ["x", "y", "z"]
            
            # Obtener información del dataset primero
            dataset = self.db.get_dataset_by_id(request.dataset_id)
            if not dataset:
                response = projects_pb2.GetDatasetDataResponse()
                return response
            
            data, boundaries = self.db.get_dataset_data_and_stats_combined(
                request.dataset_id, 
                columns
            )
            
            # Direct binary conversion without unnecessary copying
            binary_data = data.tobytes()
            
            # Configurar campos de respuesta
            response = projects_pb2.GetDatasetDataResponse()
            response.binary_data = binary_data
            response.data_length = len(data)
            response.total_count = len(data) // 3  # Each point has 3 values (x,y,z)
   
            # Use boundaries from combined query (already available)
            for col_name, stats in boundaries.items():
                boundary = response.data_boundaries.add()
                boundary.column_name = col_name
                boundary.min_value = float(stats['min_value'])
                boundary.max_value = float(stats['max_value'])
                boundary.valid_count = int(stats['valid_count'])
            
            return response
            
        except Exception as e:
            import traceback
            print(f"❌ Error in ultra-optimized dataset retrieval: {e}")
            print(f"❌ Traceback completo: {traceback.format_exc()}")
            response = projects_pb2.GetDatasetDataResponse()
            return response
    
    def delete_dataset(self, request: projects_pb2.DeleteDatasetRequest) -> projects_pb2.DeleteDatasetResponse:
        """Eliminar un dataset usando operaciones bulk eficientes"""
        try:
            print(f"🗑️  Solicitud de eliminar dataset: {request.dataset_id}")
            
            start_time = time.time()
            success = self.db.delete_dataset(request.dataset_id)
            delete_time = time.time() - start_time
            
            response = projects_pb2.DeleteDatasetResponse()
            response.success = success
            response.delete_time = delete_time
            
            if not success:
                response.error_message = "Dataset no encontrado"
            else:
                print(f"✅ Dataset eliminado en {delete_time:.2f}s")
            
            return response
            
        except Exception as e:
            print(f"❌ Error eliminando dataset: {e}")
            response = projects_pb2.DeleteDatasetResponse()
            response.success = False
            response.error_message = str(e)
            return response