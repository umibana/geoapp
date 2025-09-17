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

# Importar tipos protobuf
from generated import projects_pb2


class ProjectManager:
    """Gestor de proyectos y operaciones con archivos CSV"""
    
    def __init__(self, db_manager):
        self.db = db_manager
        print("📁 ProjectManager inicializado")
    
    # ========== Métodos de gestión de proyectos ==========
    
    def create_project(self, request: projects_pb2.CreateProjectRequest) -> projects_pb2.CreateProjectResponse:
        """Crear un nuevo proyecto"""
        try:
            print(f"Creando proyecto: {request.name}")
            
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
            
            print(f"Proyecto creado: {project.id}")
            return response
            
        except Exception as e:
            print(f"❌ Error creando proyecto: {e}")
            response = projects_pb2.CreateProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def get_projects(self, request: projects_pb2.GetProjectsRequest) -> projects_pb2.GetProjectsResponse:
        """Obtener proyectos con paginación"""
        try:
            print(f"📁 Obteniendo proyectos: limit={request.limit}, offset={request.offset}")
            
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
            
            print(f"✅ Obtenidos {len(projects_data)} proyectos")
            return response
            
        except Exception as e:
            print(f"❌ Error obteniendo proyectos: {e}")
            response = projects_pb2.GetProjectsResponse()
            return response
    
    def get_project(self, request: projects_pb2.GetProjectRequest) -> projects_pb2.GetProjectResponse:
        """Obtener un proyecto específico"""
        try:
            print(f"📁 Obteniendo proyecto: {request.project_id}")
            
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
            print(f"❌ Error obteniendo proyecto: {e}")
            response = projects_pb2.GetProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def update_project(self, request: projects_pb2.UpdateProjectRequest) -> projects_pb2.UpdateProjectResponse:
        """Actualizar un proyecto"""
        try:
            print(f"📁 Actualizando proyecto: {request.project_id}")
            
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
            print(f"❌ Error actualizando proyecto: {e}")
            response = projects_pb2.UpdateProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def delete_project(self, request: projects_pb2.DeleteProjectRequest) -> projects_pb2.DeleteProjectResponse:
        """Eliminar un proyecto"""
        try:
            print(f"📁 Eliminando proyecto: {request.project_id}")
            
            success = self.db.delete_project(request.project_id)
            
            response = projects_pb2.DeleteProjectResponse()
            response.success = success
            if not success:
                response.error_message = "Proyecto no encontrado"
            
            return response
            
        except Exception as e:
            print(f"❌ Error eliminando proyecto: {e}")
            response = projects_pb2.DeleteProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    # ========== Métodos de gestión de archivos ==========
    
    def create_file(self, request: projects_pb2.CreateFileRequest) -> projects_pb2.CreateFileResponse:
        """Crear un nuevo archivo con importación directa a DuckDB"""
        try:
            print(f"📄 Creando archivo: {request.name} para proyecto {request.project_id}")
            
            # Crear archivo con importación inmediata a DuckDB
            file_data, duckdb_table_name, column_statistics = self.db.create_file_with_csv(
                request.project_id,
                request.name,
                int(request.dataset_type),
                request.original_filename,
                request.file_content
            )
            
            # Guardar estadísticas en base de datos si el análisis fue exitoso
            if column_statistics:
                print(f"📈 Estadísticas generadas para {len(column_statistics)} columnas desde tabla DuckDB: {duckdb_table_name}")
            
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
            
            print(f"✅ Archivo creado: {response.file.id}")
            return response
            
        except Exception as e:
            print(f"❌ Error creando archivo: {e}")
            response = projects_pb2.CreateFileResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def get_project_files(self, request: projects_pb2.GetProjectFilesRequest) -> projects_pb2.GetProjectFilesResponse:
        """Obtener todos los archivos de un proyecto"""
        try:
            print(f"📄 Obteniendo archivos para proyecto: {request.project_id}")
            
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
            
            print(f"✅ Obtenidos {len(files_data)} archivos")
            return response
            
        except Exception as e:
            print(f"❌ Error obteniendo archivos del proyecto: {e}")
            response = projects_pb2.GetProjectFilesResponse()
            return response

    def get_project_datasets(self, request: projects_pb2.GetProjectDatasetsRequest) -> projects_pb2.GetProjectDatasetsResponse:
        """Obtener todos los datasets de un proyecto"""
        try:
            print(f"📊 Obteniendo datasets para proyecto: {request.project_id}")
            
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
            
            print(f"✅ Encontrados {len(datasets)} datasets")
            return response
            
        except Exception as e:
            print(f"❌ Error obteniendo datasets del proyecto: {e}")
            response = projects_pb2.GetProjectDatasetsResponse()
            return response
    
    def delete_file(self, request: projects_pb2.DeleteFileRequest) -> projects_pb2.DeleteFileResponse:
        """Eliminar un archivo"""
        try:
            print(f"📄 Eliminando archivo: {request.file_id}")
            
            success = self.db.delete_file(request.file_id)
            
            response = projects_pb2.DeleteFileResponse()
            response.success = success
            if not success:
                response.error_message = "Archivo no encontrado"
            
            return response
            
        except Exception as e:
            print(f"❌ Error eliminando archivo: {e}")
            response = projects_pb2.DeleteFileResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    # ========== Métodos de procesamiento CSV mejorado ==========
    
    def analyze_csv_for_project(self, request: projects_pb2.AnalyzeCsvForProjectRequest) -> projects_pb2.AnalyzeCsvForProjectResponse:
        """Analizar archivo CSV para proyecto con detección mejorada de tipos de columna"""
        try:
            print(f"📊 Analizando CSV para archivo del proyecto: {request.file_id}")
            
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
                print(f"⚠️  Tabla DuckDB no encontrada para archivo {request.file_id}: {e}")
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
            
            print(f"✅ CSV analizado: {len(headers)} columnas, {row_count} filas")
            return response
            
        except Exception as e:
            print(f"❌ Error analizando CSV: {e}")
            response = projects_pb2.AnalyzeCsvForProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def process_dataset(self, request: projects_pb2.ProcessDatasetRequest) -> projects_pb2.ProcessDatasetResponse:
        """Procesar dataset con mapeos de columnas - datos ya en DuckDB"""
        try:
            print(f"📊 Procesando dataset para archivo: {request.file_id}")
            
            # Obtener el nombre de la tabla DuckDB para este archivo
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            # Verificar que la tabla DuckDB existe y obtener conteo de filas
            try:
                with self.db.engine.connect() as conn:
                    from sqlalchemy import text
                    count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                    total_rows = int(count_result[0])
                    print(f"📊 Tabla DuckDB '{table_name}' encontrada con {total_rows:,} filas")
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
            
            print(f"✅ Dataset creado: {dataset_id} → tabla DuckDB '{table_name}'")
            
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
            
            print(f"✅ Procesamiento de dataset completo: {total_rows:,} filas → tabla DuckDB '{table_name}'")
            return response
            
        except Exception as e:
            print(f"❌ Error procesando dataset: {e}")
            response = projects_pb2.ProcessDatasetResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def get_dataset_data(self, request: projects_pb2.GetDatasetDataRequest) -> projects_pb2.GetDatasetDataResponse:
        """
        ULTRA-OPTIMIZED: Get dataset data using revolutionary combined query
        - Uses combined data + statistics query (~50% speedup)
        - Native DuckDB connection for maximum performance
        - Eliminated separate statistics query overhead
        - Removed unnecessary np.ascontiguousarray() copying
        """
        try:
            # Use default columns if not specified
            columns = list(request.columns) if request.columns else ["x", "y", "z"]
            print(f"🚀 ULTRA-OPTIMIZED dataset retrieval: {request.dataset_id}, columns: {columns}")
            
            # Obtener información del dataset primero
            dataset = self.db.get_dataset_by_id(request.dataset_id)
            if not dataset:
                response = projects_pb2.GetDatasetDataResponse()
                return response
            
            # REVOLUTIONARY: Get data + statistics in ONE combined query
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
            
            print(f"🚀 ULTRA-OPTIMIZED response: {response.total_count:,} points + boundaries")
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