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

    def update_file(self, request: projects_pb2.UpdateFileRequest) -> projects_pb2.UpdateFileResponse:
        """Actualizar metadata de archivo (nombre)"""
        try:

            file_data = self.db.update_file(request.file_id, request.name)

            response = projects_pb2.UpdateFileResponse()
            if file_data:
                response.success = True
                response.file.id = file_data.id
                response.file.project_id = file_data.project_id
                response.file.name = file_data.name
                response.file.dataset_type = file_data.dataset_type
                response.file.original_filename = file_data.original_filename
                response.file.file_size = file_data.file_size
                response.file.created_at = file_data.created_at
            else:
                response.success = False
                response.error_message = "Archivo no encontrado"

            return response

        except Exception as e:
            response = projects_pb2.UpdateFileResponse()
            response.success = False
            response.error_message = str(e)
            return response

    def rename_file_column(self, request: projects_pb2.RenameFileColumnRequest) -> projects_pb2.RenameFileColumnResponse:
        """Renombrar columnas en tabla DuckDB de un archivo"""
        try:

            # Convert protobuf map to Python dict
            column_renames = dict(request.column_renames)

            print(f"🔄 [BACKEND/ProjectManager] Renaming columns for file_id: {request.file_id}")
            print(f"🔄 [BACKEND/ProjectManager] Column renames: {column_renames}")

            success, renamed_columns, error_msg = self.db.rename_file_columns(
                request.file_id,
                column_renames
            )

            print(f"🔄 [BACKEND/ProjectManager] Rename result - success: {success}, renamed_columns: {renamed_columns}")

            response = projects_pb2.RenameFileColumnResponse()
            response.success = success
            response.renamed_columns.extend(renamed_columns)

            if not success:
                response.error_message = error_msg
                print(f"❌ [BACKEND/ProjectManager] Rename failed: {error_msg}")

            return response

        except Exception as e:
            print(f"❌ [BACKEND/ProjectManager] Exception during rename: {str(e)}")
            import traceback
            traceback.print_exc()
            response = projects_pb2.RenameFileColumnResponse()
            response.success = False
            response.error_message = str(e)
            return response

    def get_file_statistics(self, request: projects_pb2.GetFileStatisticsRequest) -> projects_pb2.GetFileStatisticsResponse:
        """Obtener estadísticas de archivo"""
        try:

            print(f"📊 [BACKEND/ProjectManager] Getting file statistics for file_id: {request.file_id}")

            # Get column names filter if provided
            column_names = list(request.columns) if request.columns else None
            print(f"📊 [BACKEND/ProjectManager] Column filter: {column_names}")

            statistics = self.db.get_file_statistics(request.file_id, column_names)
            print(f"📊 [BACKEND/ProjectManager] Retrieved statistics for {len(statistics)} columns")
            print(f"📊 [BACKEND/ProjectManager] Column names: {list(statistics.keys())}")

            response = projects_pb2.GetFileStatisticsResponse()
            response.success = True

            # Build response with statistics
            for col_name, stats in statistics.items():
                col_stat = response.statistics.add()
                col_stat.column_name = col_name
                col_stat.data_type = stats.get('column_type', 'numeric')
                col_stat.count = stats.get('count', 0)
                col_stat.null_count = stats.get('null_count', 0)
                col_stat.unique_count = stats.get('unique_count', 0)

                # Add numeric statistics if available
                if stats.get('column_type') == 'numeric':
                    if stats.get('mean') is not None:
                        col_stat.mean = stats['mean']
                    if stats.get('std') is not None:
                        col_stat.std = stats['std']
                    if stats.get('min') is not None:
                        col_stat.min = stats['min']
                    if stats.get('q25') is not None:
                        col_stat.q25 = stats['q25']
                    if stats.get('q50') is not None:
                        col_stat.q50 = stats['q50']
                    if stats.get('q75') is not None:
                        col_stat.q75 = stats['q75']
                    if stats.get('max') is not None:
                        col_stat.max = stats['max']

                # Add categorical statistics if available
                if stats.get('column_type') == 'categorical':
                    if stats.get('top_values'):
                        col_stat.top_values.extend(stats['top_values'])
                    if stats.get('top_counts'):
                        col_stat.top_counts.extend(stats['top_counts'])

            print(f"✅ [BACKEND/ProjectManager] Returning statistics response with {len(response.statistics)} columns")

            return response

        except Exception as e:
            print(f"❌ [BACKEND/ProjectManager] Error getting file statistics: {str(e)}")
            import traceback
            traceback.print_exc()
            response = projects_pb2.GetFileStatisticsResponse()
            response.success = False
            response.error_message = str(e)
            return response

    # ========== Métodos de manipulación de datos ==========

    def replace_file_data(self, request: projects_pb2.ReplaceFileDataRequest) -> projects_pb2.ReplaceFileDataResponse:
        """Reemplazar valores en archivo"""
        try:

            # Convert protobuf replacements to list of tuples
            replacements = [(r.from_value, r.to_value) for r in request.replacements]
            # Convert columns - if empty array, treat as None (all columns)
            columns = list(request.columns) if request.columns and len(request.columns) > 0 else None

            success, rows_affected, error_msg = self.db.replace_file_data(
                request.file_id,
                replacements,
                columns
            )

            response = projects_pb2.ReplaceFileDataResponse()
            response.success = success
            response.rows_affected = rows_affected

            if not success:
                response.error_message = error_msg

            return response

        except Exception as e:
            response = projects_pb2.ReplaceFileDataResponse()
            response.success = False
            response.error_message = str(e)
            return response

    def search_file_data(self, request: projects_pb2.SearchFileDataRequest) -> projects_pb2.SearchFileDataResponse:
        """Buscar/filtrar datos en archivo con paginación"""
        try:

            success, data_rows, total_rows, error_msg = self.db.search_file_data(
                request.file_id,
                request.query,
                request.limit or 100,
                request.offset or 0
            )

            response = projects_pb2.SearchFileDataResponse()
            response.success = success
            response.file_id = request.file_id
            response.total_rows = total_rows
            response.current_page = (request.offset // request.limit) + 1 if request.limit else 1

            if success:
                for row_dict in data_rows:
                    data_row = response.data.add()
                    data_row.fields.update(row_dict)
            else:
                response.error_message = error_msg

            return response

        except Exception as e:
            response = projects_pb2.SearchFileDataResponse()
            response.success = False
            response.error_message = str(e)
            return response

    def filter_file_data(self, request: projects_pb2.FilterFileDataRequest) -> projects_pb2.FilterFileDataResponse:
        """Filtrar datos de archivo con opción de crear nuevo archivo"""
        try:

            # Get project_id if creating new file
            project_id = None
            if request.create_new_file:
                # Get project_id from the original file using SQLModel session
                from sqlmodel import Session, select
                from database import File

                with Session(self.db.engine) as session:
                    file_record = session.get(File, request.file_id)
                    if file_record:
                        project_id = file_record.project_id
                    else:
                        # Fallback: query directly if get() fails
                        file_record = session.exec(select(File).where(File.id == request.file_id)).first()
                        if file_record:
                            project_id = file_record.project_id

            success, result_file_id, total_rows, error_msg = self.db.filter_file_data(
                request.file_id,
                request.column,
                request.operation,
                request.value,
                request.create_new_file,
                request.new_file_name if request.create_new_file else None,
                project_id
            )

            response = projects_pb2.FilterFileDataResponse()
            response.success = success
            response.file_id = result_file_id
            response.total_rows = total_rows

            if not success:
                response.error_message = error_msg

            return response

        except Exception as e:
            response = projects_pb2.FilterFileDataResponse()
            response.success = False
            response.error_message = str(e)
            return response

    def add_filtered_column(self, request: projects_pb2.AddFilteredColumnRequest) -> projects_pb2.AddFilteredColumnResponse:
        """Agregar columna filtrada (no destructivo)"""
        try:
            print(f"🔍 [BACKEND/ProjectManager] Adding filtered column for file_id: {request.file_id}")
            print(f"🔍 [BACKEND/ProjectManager] New column: {request.new_column_name}")
            print(f"🔍 [BACKEND/ProjectManager] Filter: {request.source_column} {request.operation} {request.value}")

            success, new_column_name, rows_with_values, error_msg = self.db.add_filtered_column(
                request.file_id,
                request.new_column_name,
                request.source_column,
                request.operation,
                request.value
            )

            # Get total rows to calculate null rows
            from sqlmodel import Session, select
            from database import Dataset
            total_rows = 0

            if success:
                # Get row count from DuckDB
                table_name = f"data_{request.file_id.replace('-', '_')}"
                with self.db.engine.connect() as conn:
                    from sqlalchemy import text
                    count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                    total_rows = int(count_result[0])

            rows_with_null = total_rows - rows_with_values if success else 0

            response = projects_pb2.AddFilteredColumnResponse()
            response.success = success
            response.new_column_name = new_column_name
            response.rows_with_values = rows_with_values
            response.rows_with_null = rows_with_null

            if not success:
                response.error_message = error_msg
            else:
                print(f"✅ [BACKEND/ProjectManager] Filtered column added: {rows_with_values} matches, {rows_with_null} NULL")

            return response

        except Exception as e:
            print(f"❌ [BACKEND/ProjectManager] Exception during add_filtered_column: {str(e)}")
            import traceback
            traceback.print_exc()
            response = projects_pb2.AddFilteredColumnResponse()
            response.success = False
            response.error_message = str(e)
            return response

    def delete_file_points(self, request: projects_pb2.DeleteFilePointsRequest) -> projects_pb2.DeleteFilePointsResponse:
        """Eliminar puntos/filas específicas de archivo"""
        try:

            row_indices = list(request.row_indices)

            success, rows_deleted, rows_remaining, error_msg = self.db.delete_file_points(
                request.file_id,
                row_indices
            )

            response = projects_pb2.DeleteFilePointsResponse()
            response.success = success
            response.rows_deleted = rows_deleted
            response.rows_remaining = rows_remaining

            if not success:
                response.error_message = error_msg

            return response

        except Exception as e:
            response = projects_pb2.DeleteFilePointsResponse()
            response.success = False
            response.error_message = str(e)
            return response

    # ========== Operaciones avanzadas de columnas ==========

    def add_file_columns(self, request: projects_pb2.AddFileColumnsRequest) -> projects_pb2.AddFileColumnsResponse:
        """Agregar nuevas columnas a archivo"""
        try:

            # Convert protobuf columns to list of tuples
            new_columns = [(col.column_name, list(col.values)) for col in request.new_columns]

            success, added_columns, error_msg = self.db.add_file_columns(
                request.file_id,
                new_columns
            )

            response = projects_pb2.AddFileColumnsResponse()
            response.success = success
            response.added_columns.extend(added_columns)

            if not success:
                response.error_message = error_msg

            return response

        except Exception as e:
            response = projects_pb2.AddFileColumnsResponse()
            response.success = False
            response.error_message = str(e)
            return response

    def duplicate_file_columns(self, request: projects_pb2.DuplicateFileColumnsRequest) -> projects_pb2.DuplicateFileColumnsResponse:
        """Duplicar columnas existentes con nombres personalizados opcionales"""
        try:

            print(f"🔄 [BACKEND/ProjectManager] Duplicating columns for file_id: {request.file_id}")
            print(f"🔄 [BACKEND/ProjectManager] Number of columns to duplicate: {len(request.columns)}")

            # Convert protobuf columns to list of tuples (source_column, new_column_name)
            columns_to_duplicate = [(col.source_column, col.new_column_name) for col in request.columns]
            
            print(f"🔄 [BACKEND/ProjectManager] Columns to duplicate: {columns_to_duplicate}")

            success, duplicated_columns, error_msg = self.db.duplicate_file_columns(
                request.file_id,
                columns_to_duplicate
            )

            response = projects_pb2.DuplicateFileColumnsResponse()
            response.success = success
            response.duplicated_columns.extend(duplicated_columns)

            if not success:
                response.error_message = error_msg
                print(f"❌ [BACKEND/ProjectManager] Duplication failed: {error_msg}")
            else:
                print(f"✅ [BACKEND/ProjectManager] Successfully duplicated {len(duplicated_columns)} columns")

            return response

        except Exception as e:
            print(f"❌ [BACKEND/ProjectManager] Exception during duplication: {str(e)}")
            import traceback
            traceback.print_exc()
            response = projects_pb2.DuplicateFileColumnsResponse()
            response.success = False
            response.error_message = str(e)
            return response

    # ========== Fusión de datasets ==========

    def merge_datasets(self, request: projects_pb2.MergeDatasetsRequest) -> projects_pb2.MergeDatasetsResponse:
        """Fusionar dos datasets por filas o columnas"""
        try:

            # Convert merge mode enum to string
            mode_map = {
                projects_pb2.MERGE_MODE_BY_ROWS: "BY_ROWS",
                projects_pb2.MERGE_MODE_BY_COLUMNS: "BY_COLUMNS"
            }
            mode = mode_map.get(request.mode, "BY_ROWS")

            exclude_first = list(request.exclude_columns_first) if request.exclude_columns_first else None
            exclude_second = list(request.exclude_columns_second) if request.exclude_columns_second else None
            output_file = request.output_file if request.output_file else None

            success, dataset_id, rows_merged, columns_merged, warnings, error_msg = self.db.merge_datasets(
                request.first_dataset_id,
                request.second_dataset_id,
                mode,
                exclude_first,
                exclude_second,
                output_file
            )

            response = projects_pb2.MergeDatasetsResponse()
            response.success = success
            response.dataset_id = dataset_id
            response.rows_merged = rows_merged
            response.columns_merged = columns_merged
            response.warnings.extend(warnings)

            if not success:
                response.error_message = error_msg

            return response

        except Exception as e:
            response = projects_pb2.MergeDatasetsResponse()
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
            # Columns for visualization (raw data points - typically x, y, z)
            viz_columns = list(request.columns) if request.columns else ["x", "y", "z"]
            print(f"📋 Visualization columns (for raw data): {viz_columns}")

            # Obtener información del dataset primero
            dataset = self.db.get_dataset_by_id(request.dataset_id)
            if not dataset:
                response = projects_pb2.GetDatasetDataResponse()
                return response

            # Get ALL numeric column names from dataset for statistics computation
            import json
            column_mappings = json.loads(dataset.column_mappings) if dataset.column_mappings else []
            print(f"🔍 DEBUG: Raw column_mappings from database: {column_mappings}")
            print(f"🔍 DEBUG: Number of mappings: {len(column_mappings)}")

            all_numeric_columns = [m['column_name'] for m in column_mappings if m['column_type'] == 1]  # NUMERIC only
            print(f"📊 All numeric columns (for statistics): {all_numeric_columns} ({len(all_numeric_columns)} columns)")

            # DEBUG: Show all column types
            for m in column_mappings:
                print(f"🔍 Column '{m['column_name']}': type={m['column_type']} (1=NUMERIC, 0=CATEGORICAL)")

            # Find coordinate columns from mappings (these are used for bounding box filtering)
            coord_columns = {}
            for m in column_mappings:
                if m.get('is_coordinate') and m.get('mapped_field') in ['x', 'y', 'z']:
                    coord_columns[m['mapped_field']] = m['column_name']

            # Build filter_columns list from coordinate mappings (fallback to viz_columns if not found)
            filter_columns_for_bbox = [
                coord_columns.get('x', viz_columns[0] if len(viz_columns) > 0 else 'x'),
                coord_columns.get('y', viz_columns[1] if len(viz_columns) > 1 else 'y'),
                coord_columns.get('z', viz_columns[2] if len(viz_columns) > 2 else 'z')
            ]
            print(f"🔍 Coordinate columns for filtering: {filter_columns_for_bbox} (from column_mappings)")

            # Extract optional filtering parameters
            bounding_box = list(request.bounding_box) if request.bounding_box else None
            shape = request.shape if request.HasField('shape') else None
            color = request.color if request.HasField('color') else None
            function = request.function if request.HasField('function') else None

            # Log optional parameters if provided
            if bounding_box:
                print(f"📦 GetDatasetData with bounding_box: {bounding_box}")
            if shape:
                print(f"🔷 Shape: {shape}")
            if color:
                print(f"🎨 Color: {color}")
            if function:
                print(f"🔧 Function: {function}")

            # Get visualization data (only requested columns for raw data)
            data, boundaries = self.db.get_dataset_data_and_stats_combined(
                request.dataset_id,
                viz_columns,
                bounding_box=bounding_box
            )

            # Get ALL numeric columns data for statistics computation
            print(f"🔍 DEBUG: About to fetch data for columns: {all_numeric_columns}")
            print(f"🔍 DEBUG: Bounding box: {bounding_box}")
            print(f"🔍 DEBUG: Filter columns for bbox: {filter_columns_for_bbox}")

            all_data, all_boundaries = self.db.get_dataset_data_and_stats_combined(
                request.dataset_id,
                all_numeric_columns,
                bounding_box=bounding_box,
                filter_columns=filter_columns_for_bbox  # Use coordinate columns from dataset mapping
            )
            print(f"📊 Fetched {len(all_data)} values for {len(all_numeric_columns)} columns")
            print(f"🔍 DEBUG: all_data type: {type(all_data)}, shape/len: {all_data.shape if hasattr(all_data, 'shape') else len(all_data)}")
            print(f"🔍 DEBUG: all_boundaries keys: {list(all_boundaries.keys()) if all_boundaries else 'None'}")

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

            # ========== Compute statistics for ALL numeric columns ==========
            print(f"🔍 DEBUG: Checking if we should compute statistics...")
            print(f"🔍 DEBUG: len(all_data)={len(all_data)}, len(all_numeric_columns)={len(all_numeric_columns)}")

            if len(all_data) > 0:
                if len(all_numeric_columns) == 0:
                    print(f"⚠️ WARNING: all_data has {len(all_data)} values but all_numeric_columns is empty! Cannot compute statistics.")
                else:
                    num_points = len(all_data) // len(all_numeric_columns)
                    print(f"📊 Computing statistics for {num_points} points across {len(all_numeric_columns)} columns...")

                    # 1. Compute histograms for ALL numeric columns
                    print(f"🔍 DEBUG: Starting histogram computation for {len(all_numeric_columns)} columns...")
                    for i, col_name in enumerate(all_numeric_columns):
                        col_data = all_data[i::len(all_numeric_columns)]  # Extract column data from interleaved format
                        print(f"🔍 DEBUG: Computing histogram for column {i}: '{col_name}', data length: {len(col_data)}")
                        histogram = self.db.compute_histogram(col_data, col_name, num_bins=30)
                        print(f"🔍 DEBUG: Histogram result: {histogram is not None and len(histogram) > 0}")

                        if histogram:
                            hist_proto = response.histograms[col_name]
                            hist_proto.bin_ranges.extend(histogram['bin_ranges'])
                            hist_proto.bin_counts.extend(histogram['bin_counts'])
                            hist_proto.bin_edges.extend(histogram['bin_edges'])
                            hist_proto.num_bins = histogram['num_bins']
                            hist_proto.min_value = histogram['min_value']
                            hist_proto.max_value = histogram['max_value']
                            hist_proto.total_count = histogram['total_count']
                            print(f"  ✅ Histogram for '{col_name}': {histogram['num_bins']} bins")

                    # 2. Compute box plots for ALL numeric columns
                    for i, col_name in enumerate(all_numeric_columns):
                        col_data = all_data[i::len(all_numeric_columns)]  # Extract column data from interleaved format
                        boxplot = self.db.compute_boxplot(col_data, col_name)

                        if boxplot:
                            bp_proto = response.box_plots.add()
                            bp_proto.column_name = boxplot['column_name']
                            bp_proto.min = boxplot['min']
                            bp_proto.q1 = boxplot['q1']
                            bp_proto.median = boxplot['median']
                            bp_proto.q3 = boxplot['q3']
                            bp_proto.max = boxplot['max']
                            bp_proto.mean = boxplot['mean']
                            bp_proto.outliers.extend(boxplot['outliers'])
                            bp_proto.lower_fence = boxplot['lower_fence']
                            bp_proto.upper_fence = boxplot['upper_fence']
                            bp_proto.iqr = boxplot['iqr']
                            bp_proto.total_count = boxplot['total_count']
                            print(f"  ✅ Box plot for '{col_name}': median={boxplot['median']:.2f}, {len(boxplot['outliers'])} outliers")

                    # 3. Compute heatmap (using visualization columns only - x, y, z)
                    if len(viz_columns) >= 3:
                        # Extract x, y, z from all_data for heatmap
                        x_idx = all_numeric_columns.index(viz_columns[0]) if viz_columns[0] in all_numeric_columns else 0
                        y_idx = all_numeric_columns.index(viz_columns[1]) if viz_columns[1] in all_numeric_columns else 1
                        z_idx = all_numeric_columns.index(viz_columns[2]) if viz_columns[2] in all_numeric_columns else 2

                        x_data = all_data[x_idx::len(all_numeric_columns)]
                        y_data = all_data[y_idx::len(all_numeric_columns)]
                        z_data = all_data[z_idx::len(all_numeric_columns)]

                        heatmap = self.db.compute_heatmap(
                            x_data, y_data, z_data,
                            viz_columns[0], viz_columns[1], viz_columns[2],
                            grid_size=50
                        )

                        if heatmap and heatmap.get('cells'):
                            hm_proto = response.heatmap
                            for cell in heatmap['cells']:
                                cell_proto = hm_proto.cells.add()
                                cell_proto.x_index = cell['x_index']
                                cell_proto.y_index = cell['y_index']
                                cell_proto.avg_value = cell['avg_value']
                                cell_proto.count = cell['count']

                            hm_proto.grid_size_x = heatmap['grid_size_x']
                            hm_proto.grid_size_y = heatmap['grid_size_y']
                            hm_proto.min_value = heatmap['min_value']
                            hm_proto.max_value = heatmap['max_value']
                            hm_proto.x_bin_size = heatmap['x_bin_size']
                            hm_proto.y_bin_size = heatmap['y_bin_size']
                            hm_proto.min_x = heatmap['min_x']
                            hm_proto.max_x = heatmap['max_x']
                            hm_proto.min_y = heatmap['min_y']
                            hm_proto.max_y = heatmap['max_y']
                            hm_proto.x_column = heatmap['x_column']
                            hm_proto.y_column = heatmap['y_column']
                            hm_proto.value_column = heatmap['value_column']
                            print(f"  ✅ Heatmap: {len(heatmap['cells'])} cells in {heatmap['grid_size_x']}x{heatmap['grid_size_y']} grid")

                    print(f"✅ Statistics computation complete!")

            return response

        except Exception as e:
            import traceback
            print(f"❌ Error in ultra-optimized dataset retrieval: {e}")
            print(f"❌ Traceback completo: {traceback.format_exc()}")
            response = projects_pb2.GetDatasetDataResponse()
            return response
    
    def get_dataset_table_data(self, request: projects_pb2.GetDatasetTableDataRequest) -> projects_pb2.GetDatasetTableDataResponse:
        """Get paginated table data for dataset (efficient for large datasets)"""
        try:
            print(f"📊 [GetDatasetTableData] dataset_id={request.dataset_id}, limit={request.limit}, offset={request.offset}")
            
            # Get dataset info
            dataset = self.db.get_dataset_by_id(request.dataset_id)
            if not dataset:
                response = projects_pb2.GetDatasetTableDataResponse()
                response.success = False
                response.error_message = "Dataset no encontrado"
                return response
            
            # Get column names - either from request or all numeric columns from mappings
            column_mappings = json.loads(dataset.column_mappings) if dataset.column_mappings else []
            
            if request.columns and len(request.columns) > 0:
                # Use specified columns
                columns_to_fetch = list(request.columns)
            else:
                # Get all numeric columns
                columns_to_fetch = [m['column_name'] for m in column_mappings if m['column_type'] == 1]  # NUMERIC only
            
            if not columns_to_fetch:
                response = projects_pb2.GetDatasetTableDataResponse()
                response.success = False
                response.error_message = "No hay columnas numéricas para mostrar"
                return response
            
            print(f"📊 [GetDatasetTableData] Fetching {len(columns_to_fetch)} columns")
            
            # Build SQL query with pagination
            table_name = f"data_{dataset.file_id.replace('-', '_')}"
            columns_str = ', '.join([f'"{col}"' for col in columns_to_fetch])
            
            query = f"""
                SELECT {columns_str}
                FROM {table_name}
                LIMIT {request.limit}
                OFFSET {request.offset}
            """
            
            # Execute query
            with self.db.engine.connect() as conn:
                from sqlalchemy import text
                result = conn.execute(text(query))
                rows_data = result.fetchall()
            
            print(f"📊 [GetDatasetTableData] Fetched {len(rows_data)} rows")
            
            # Build response
            response = projects_pb2.GetDatasetTableDataResponse()
            response.success = True
            response.total_rows = dataset.total_rows
            response.column_names.extend(columns_to_fetch)
            
            # Convert rows to protobuf format
            for row in rows_data:
                table_row = response.rows.add()
                for i, col_name in enumerate(columns_to_fetch):
                    table_row.values[col_name] = float(row[i]) if row[i] is not None else 0.0
            
            print(f"✅ [GetDatasetTableData] Returning {len(response.rows)} rows")
            return response
            
        except Exception as e:
            print(f"❌ Error getting dataset table data: {e}")
            import traceback
            traceback.print_exc()
            response = projects_pb2.GetDatasetTableDataResponse()
            response.success = False
            response.error_message = str(e)
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