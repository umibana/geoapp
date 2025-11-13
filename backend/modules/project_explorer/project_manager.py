#!/usr/bin/env python
"""
Módulo de gestión de proyectos
Maneja operaciones de proyectos y archivos CSV usando DuckDB
"""

import json
import time
import tempfile
import os
import io
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import pandas as pd
from sqlalchemy import Engine, text
from sqlmodel import Session, select, func

# Importar tipos protobuf
from generated import projects_pb2
from modules.others import models, db_connection


class ProjectManager:
    """Gestor de proyectos y operaciones con archivos CSV"""
    
    def __init__(self, engine: Engine, eda_manager=None):
        """
        Initialize ProjectManager
        
        Args:
            engine: SQLAlchemy Engine instance
            eda_manager: Optional EDAManager instance for statistics generation
        """
        self.engine = engine
        self.eda_manager = eda_manager
    
    # ========== Private helper methods for CSV import ==========
    
    def _import_csv_to_duckdb(self, file_content: bytes, table_name: str) -> bool:
        """
        Import CSV content directly into DuckDB table
        
        Args:
            file_content: Raw CSV bytes
            table_name: Name for the DuckDB table
            
        Returns:
            True if successful
        """
        try:
            # Write CSV content to temporary file for DuckDB to read
            with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as temp_file:
                temp_file.write(file_content)
                temp_csv_path = temp_file.name
            
            try:
                # Use SQLAlchemy connection to execute DuckDB query
                with self.engine.connect() as conn:
                    with conn.begin():
                        conn.execute(text(f"""
                            CREATE OR REPLACE TABLE {table_name} AS 
                            SELECT * FROM read_csv_auto('{temp_csv_path}')
                        """))
                return True
                
            finally:
                # Delete temporary file
                os.unlink(temp_csv_path)
                
        except Exception as e:
            raise e
    
    def _analyze_csv_and_store(self, file_content: bytes, sample_size: int = 10000) -> Tuple[Dict[str, Any], List[str], List[str]]:
        """
        Analyze CSV content with pandas describe() for immediate statistics
        
        Args:
            file_content: Raw CSV bytes
            sample_size: Sample size for large datasets (default 10K rows)
            
        Returns:
            Tuple of (statistics_dict, numeric_columns, categorical_columns)
        """
        try:
            # Read CSV into pandas
            df = pd.read_csv(io.BytesIO(file_content))
            total_rows = len(df)
            
            # Use sample for large datasets
            if sample_size < total_rows and sample_size > 0:
                df_sample = df.sample(n=min(sample_size, total_rows), random_state=42)
            else:
                df_sample = df
            
            # Get comprehensive statistics using pandas describe()
            numeric_describe = df_sample.select_dtypes(include=[np.number]).describe()
            
            # Track column types
            numeric_columns = list(numeric_describe.columns)
            categorical_columns = [col for col in df.columns if col not in numeric_columns]
            
            # Build statistics dictionary
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
                            'null_count': int(df_sample[col].isnull().sum()),
                            'unique_count': int(df_sample[col].nunique()),
                            'total_rows': total_rows
                        }
            
            # Statistics for categorical columns  
            for col in categorical_columns:
                column_statistics[col] = {
                    'column_type': 'categorical',
                    'count': float(df_sample[col].count()),
                    'null_count': int(df_sample[col].isnull().sum()),
                    'unique_count': int(df_sample[col].nunique()),
                    'total_rows': total_rows
                }
            
            return column_statistics, numeric_columns, categorical_columns
            
        except Exception as e:
            raise e
    
    # ========== Métodos de gestión de proyectos ==========
    
    def create_project(self, request: projects_pb2.CreateProjectRequest) -> projects_pb2.CreateProjectResponse:
        """Crear un nuevo proyecto"""
        try:
            project = models.Project(
                id=db_connection.generate_id(),
                name=request.name,
                description=request.description,
                created_at=db_connection.get_timestamp(),
                updated_at=db_connection.get_timestamp(),
            )
            
            with Session(self.engine) as session:
                session.add(project)
                session.commit()
                session.refresh(project)
            
            # Crear la respuesta
            response = projects_pb2.CreateProjectResponse()
            response.success = True
            
            # Llenar los datos del proyecto
            project_resp = response.project
            project_resp.id = project.id
            project_resp.name = project.name
            project_resp.description = project.description
            project_resp.created_at = project.created_at
            project_resp.updated_at = project.updated_at
            
            return response
            
        except Exception as e:
            response = projects_pb2.CreateProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def get_projects(self, request: projects_pb2.GetProjectsRequest) -> projects_pb2.GetProjectsResponse:
        """Obtener proyectos con paginación"""
        try:
            with Session(self.engine) as session:
                project_count = session.exec(select(func.count(models.Project.id))).one()
                projects = session.exec(
                    select(models.Project).order_by(models.Project.updated_at.desc()).limit(request.limit or 100).offset(request.offset)
                ).all()
            
            response = projects_pb2.GetProjectsResponse()
            response.total_count = int(project_count)
            
            for project_data in projects:
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
            with Session(self.engine) as session:
                project_data = session.get(models.Project, request.project_id)
                if project_data:
                    session.refresh(project_data)
            
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
            with Session(self.engine) as session:
                project = session.get(models.Project, request.project_id)
                if not project:
                    response = projects_pb2.UpdateProjectResponse()
                    response.success = False
                    response.error_message = "Proyecto no encontrado"
                    return response
                
                project.name = request.name
                project.description = request.description
                project.updated_at = db_connection.get_timestamp()
                session.add(project)
                session.commit()
                session.refresh(project)
            
            response = projects_pb2.UpdateProjectResponse()
            response.success = True
            project_resp = response.project
            project_resp.id = project.id
            project_resp.name = project.name
            project_resp.description = project.description
            project_resp.created_at = project.created_at
            project_resp.updated_at = project.updated_at
            
            return response
            
        except Exception as e:
            response = projects_pb2.UpdateProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def delete_project(self, request: projects_pb2.DeleteProjectRequest) -> projects_pb2.DeleteProjectResponse:
        """Eliminar un proyecto"""
        try:
            with Session(self.engine) as session:
                project = session.get(models.Project, request.project_id)
                if not project:
                    response = projects_pb2.DeleteProjectResponse()
                    response.success = False
                    response.error_message = "Proyecto no encontrado"
                    return response
                
                session.delete(project)
                session.commit()
            
            response = projects_pb2.DeleteProjectResponse()
            response.success = True
            
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
            # Generate file ID first
            file_id = db_connection.generate_id()
            table_name = f"data_{file_id.replace('-', '_')}"
            
            # 1. Import CSV to DuckDB first (this is the source of truth)
            self._import_csv_to_duckdb(request.file_content, table_name)
            
            # Verify table was created
            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                raise Exception(f"DuckDB table '{table_name}' was not created properly")
            
            # 2. Create File metadata record (no file_content stored)
            file = models.File(
                id=file_id,
                project_id=request.project_id,
                name=request.name,
                dataset_type=int(request.dataset_type),
                original_filename=request.original_filename,
                file_size=len(request.file_content),
                created_at=db_connection.get_timestamp(),
            )
            
            with Session(self.engine) as session:
                session.add(file)
                session.commit()
                session.refresh(file)
            
            # 3. Generate statistics using pandas describe() on the original CSV
            try:
                column_statistics, numeric_columns, categorical_columns = self._analyze_csv_and_store(
                    request.file_content
                )
            except Exception as e:
                column_statistics = {}
            
            response = projects_pb2.CreateFileResponse()
            response.success = True
            
            # Asignación directa de campos
            response.file.id = file.id
            response.file.project_id = file.project_id
            response.file.name = file.name
            response.file.dataset_type = file.dataset_type
            response.file.original_filename = file.original_filename
            response.file.file_size = file.file_size
            response.file.created_at = file.created_at
            
            return response
            
        except Exception as e:
            response = projects_pb2.CreateFileResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def get_project_files(self, request: projects_pb2.GetProjectFilesRequest) -> projects_pb2.GetProjectFilesResponse:
        """Obtener todos los archivos de un proyecto"""
        try:
            with Session(self.engine) as session:
                files_data = session.exec(
                    select(models.File).where(models.File.project_id == request.project_id).order_by(models.File.created_at.desc())
                ).all()
            
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
            with Session(self.engine) as session:
                # Join datasets with files by project
                datasets = session.exec(
                    select(models.Dataset, models.File)
                    .join(models.File, models.Dataset.file_id == models.File.id)
                    .where(models.File.project_id == request.project_id)
                    .order_by(models.Dataset.created_at.desc())
                ).all()
            
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
            with Session(self.engine) as session:
                f = session.get(models.File, request.file_id)
                if not f:
                    response = projects_pb2.DeleteFileResponse()
                    response.success = False
                    response.error_message = "Archivo no encontrado"
                    return response
                
                # Get all datasets associated with this file
                datasets = session.exec(select(models.Dataset).where(models.Dataset.file_id == request.file_id)).all()
                
                # Delete in proper order to respect foreign key constraints
                for dataset in datasets:
                    # 1. First delete ALL statistics for this dataset
                    stats_to_delete = session.exec(
                        select(models.DatasetColumnStats)
                        .where(models.DatasetColumnStats.dataset_id == dataset.id)
                    ).all()
                    
                    for stat in stats_to_delete:
                        session.delete(stat)
                    
                    # 2. Commit statistics deletion before deleting dataset
                    session.commit()
                    
                    # 3. Now safely delete the dataset
                    session.delete(dataset)
                    session.commit()
                
                # Delete associated DuckDB table
                table_name = f"data_{request.file_id.replace('-', '_')}"
                try:
                    with self.engine.connect() as conn:
                        conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
                except Exception:
                    pass  # Ignore errors when dropping table
                
                # Finally delete the file
                session.delete(f)
                session.commit()
            
            response = projects_pb2.DeleteFileResponse()
            response.success = True
            
            return response

        except Exception as e:
            response = projects_pb2.DeleteFileResponse()
            response.success = False
            response.error_message = str(e)
            return response

    def update_file(self, request: projects_pb2.UpdateFileRequest) -> projects_pb2.UpdateFileResponse:
        """Actualizar metadata de archivo (nombre)"""
        try:
            with Session(self.engine) as session:
                file = session.get(models.File, request.file_id)
                if not file:
                    response = projects_pb2.UpdateFileResponse()
                    response.success = False
                    response.error_message = "Archivo no encontrado"
                    return response
                
                file.name = request.name
                session.add(file)
                session.commit()
                session.refresh(file)
            
            response = projects_pb2.UpdateFileResponse()
            response.success = True
            response.file.id = file.id
            response.file.project_id = file.project_id
            response.file.name = file.name
            response.file.dataset_type = file.dataset_type
            response.file.original_filename = file.original_filename
            response.file.file_size = file.file_size
            response.file.created_at = file.created_at

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

            table_name = f"data_{request.file_id.replace('-', '_')}"

            # Check if table exists
            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                response = projects_pb2.RenameFileColumnResponse()
                response.success = False
                response.error_message = f"Table {table_name} does not exist"
                return response

            renamed_columns = []

            # 1. Rename columns in DuckDB table
            with self.engine.connect() as conn:
                with conn.begin():
                    # Get existing columns first
                    result = conn.execute(text(f"DESCRIBE {table_name}"))
                    existing_columns = {row[0] for row in result}

                    # Rename each column
                    for old_name, new_name in column_renames.items():
                        if old_name not in existing_columns:
                            continue  # Skip if column doesn't exist

                        # DuckDB syntax for renaming columns
                        conn.execute(text(f"ALTER TABLE {table_name} RENAME COLUMN \"{old_name}\" TO \"{new_name}\""))
                        renamed_columns.append(new_name)

            # 2. Update column_mappings in all datasets for this file
            with Session(self.engine) as session:
                # Get all datasets for this file
                datasets = session.exec(select(models.Dataset).where(models.Dataset.file_id == request.file_id)).all()

                for dataset in datasets:
                    if dataset.column_mappings:
                        # Parse JSON column mappings
                        mappings = json.loads(dataset.column_mappings)

                        # Update column names in mappings
                        updated = False
                        for mapping in mappings:
                            if mapping['column_name'] in column_renames:
                                old_col_name = mapping['column_name']
                                new_col_name = column_renames[old_col_name]
                                mapping['column_name'] = new_col_name
                                updated = True

                        if updated:
                            # Save updated mappings back to database
                            dataset.column_mappings = json.dumps(mappings)
                            session.add(dataset)

                # Commit all dataset updates
                session.commit()

            # 3. Recalculate statistics to reflect renamed columns
            if self.eda_manager:
                self.eda_manager.recalculate_file_statistics(request.file_id)

            print(f"🔄 [BACKEND/ProjectManager] Rename result - success: True, renamed_columns: {renamed_columns}")

            response = projects_pb2.RenameFileColumnResponse()
            response.success = True
            response.renamed_columns.extend(renamed_columns)

            return response

        except Exception as e:
            print(f"❌ [BACKEND/ProjectManager] Exception during rename: {str(e)}")
            import traceback
            traceback.print_exc()
            response = projects_pb2.RenameFileColumnResponse()
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
                with self.engine.connect() as conn:
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
            
            # Get column types from DuckDB schema for accurate type detection
            with self.engine.connect() as conn:
                schema_result = conn.execute(text(f"DESCRIBE {table_name}"))
                schema_data = [(row[0], row[1]) for row in schema_result]  # (column_name, column_type)
            
            print(f"🔍 [AnalyzeCSV] DuckDB schema for {table_name}:")
            for col_name, col_type in schema_data:
                print(f"  - {col_name}: {col_type}")
            
            # Map DuckDB types to our column types
            suggested_types = []
            suggested_mappings = {}
            
            for header in headers:
                # Find the DuckDB type for this column
                duckdb_type = None
                for col_name, col_type in schema_data:
                    if col_name == header:
                        duckdb_type = col_type.upper()
                        break
                
                # Determine if numeric or categorical based on DuckDB type
                is_numeric = False
                if duckdb_type:
                    # Numeric types in DuckDB
                    numeric_keywords = ['INT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'REAL', 'BIGINT', 'SMALLINT', 'TINYINT']
                    is_numeric = any(keyword in duckdb_type for keyword in numeric_keywords)
                
                print(f"  📊 Column '{header}': DuckDB type='{duckdb_type}', is_numeric={is_numeric}")
                
                # Set column type
                if is_numeric:
                    suggested_types.append(projects_pb2.COLUMN_TYPE_NUMERIC)
                    print(f"    ✅ Set as NUMERIC (value={projects_pb2.COLUMN_TYPE_NUMERIC})")
                else:
                    suggested_types.append(projects_pb2.COLUMN_TYPE_CATEGORICAL)
                    print(f"    ✅ Set as CATEGORICAL (value={projects_pb2.COLUMN_TYPE_CATEGORICAL})")
                
                # Suggest coordinate mappings based on column names (only for numeric columns)
                if is_numeric:
                    if any(keyword in header.lower() for keyword in ['x', 'east', 'longitude', 'lon']):
                        suggested_mappings[header] = "x"
                    elif any(keyword in header.lower() for keyword in ['latitude', 'lat', 'north', 'y']):
                        suggested_mappings[header] = "y"
                    elif any(keyword in header.lower() for keyword in ['z', 'elevation', 'height', 'depth']):
                        suggested_mappings[header] = "z"
                    else:
                        suggested_mappings[header] = ""
                else:
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

    def process_dataset(self, request: projects_pb2.ProcessDatasetRequest) -> projects_pb2.ProcessDatasetResponse:
        """Procesar dataset con mapeos de columnas - datos ya en DuckDB"""
        try:
            print(f"🔍 [ProcessDataset] Received {len(request.column_mappings)} column mappings")
            if len(request.column_mappings) > 0:
                print(f"🔍 [ProcessDataset] First mapping: column_name={request.column_mappings[0].column_name}, column_type={request.column_mappings[0].column_type} (type: {type(request.column_mappings[0].column_type)})")

            # Obtener el nombre de la tabla DuckDB para este archivo
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            # Verificar que la tabla DuckDB existe y obtener conteo de filas
            try:
                with self.engine.connect() as conn:
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

            print(f"🔍 [ProcessDataset] Storing {len(column_mappings_list)} mappings to database")
            if len(column_mappings_list) > 0:
                print(f"🔍 [ProcessDataset] First stored mapping: {column_mappings_list[0]}")
            
            # Crear registro de dataset que apunte a la tabla DuckDB
            dataset = models.Dataset(
                id=db_connection.generate_id(),
                file_id=request.file_id,
                duckdb_table_name=table_name,
                total_rows=total_rows,
                column_mappings=json.dumps(column_mappings_list),
                created_at=db_connection.get_timestamp(),
            )
            
            with Session(self.engine) as session:
                session.add(dataset)
                session.commit()
                session.refresh(dataset)
            
            dataset_id = dataset.id
            
            # Generate and store column statistics for the dataset using pandas describe
            if self.eda_manager:
                try:
                    # Generate statistics directly from DuckDB using file_id
                    column_statistics = self.eda_manager._generate_statistics_from_duckdb(request.file_id)

                    if column_statistics:
                        self.eda_manager.store_column_statistics(dataset_id, column_statistics)
                except Exception as e:
                    import traceback
                    traceback.print_exc()
            
            response = projects_pb2.ProcessDatasetResponse()
            response.success = True
            response.processed_rows = total_rows
            
            # Poblar datos del dataset
            dataset_resp = response.dataset
            dataset_resp.id = dataset_id
            dataset_resp.file_id = dataset.file_id
            dataset_resp.total_rows = dataset.total_rows
            dataset_resp.created_at = dataset.created_at
            
            # Agregar mapeos de columnas
            column_mappings = json.loads(dataset.column_mappings) if dataset.column_mappings else []
            for mapping_dict in column_mappings:
                mapping = dataset_resp.column_mappings.add()
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
    
    def delete_dataset(self, request: projects_pb2.DeleteDatasetRequest) -> projects_pb2.DeleteDatasetResponse:
        """Eliminar un dataset usando operaciones bulk eficientes"""
        try:
            print(f"🗑️  Solicitud de eliminar dataset: {request.dataset_id}")
            
            start_time = time.time()
            
            with Session(self.engine) as session:
                dataset = session.get(models.Dataset, request.dataset_id)
                if not dataset:
                    response = projects_pb2.DeleteDatasetResponse()
                    response.success = False
                    response.error_message = "Dataset no encontrado"
                    return response
                
                # 1. Delete all statistics for this dataset
                stats_to_delete = session.exec(
                    select(models.DatasetColumnStats)
                    .where(models.DatasetColumnStats.dataset_id == request.dataset_id)
                ).all()
                
                for stat in stats_to_delete:
                    session.delete(stat)
                
                session.commit()
                
                # 2. Delete the dataset record
                session.delete(dataset)
                session.commit()
            
            delete_time = time.time() - start_time
            
            response = projects_pb2.DeleteDatasetResponse()
            response.success = True
            response.delete_time = delete_time
            
            print(f"✅ Dataset eliminado en {delete_time:.2f}s")
            
            return response
            
        except Exception as e:
            print(f"❌ Error eliminando dataset: {e}")
            response = projects_pb2.DeleteDatasetResponse()
            response.success = False
            response.error_message = str(e)
            return response
