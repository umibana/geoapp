#!/usr/bin/env python
"""
Project management module
Handles project and file operations using DuckDB
"""

import json
from typing import List, Dict, Any, Optional
from sqlalchemy import Engine, text
from sqlmodel import Session, select, func

from generated import projects_pb2
from modules.others import models, db_connection
from modules.others.decorators import grpc_response
from modules.others.file_parsers import FileParser, DuckDBImporter
from modules.others.column_mappings import (
    ColumnMappingsService,
    build_column_mappings_list,
    populate_response_mappings
)
from modules.others.statistics_service import StatisticsService
from modules.others.progress_tracker import progress_tracker
from modules.others.file_cache import file_cache


class ProjectManager:
    """Manager for project and file operations"""
    
    def __init__(self, engine: Engine, eda_manager=None):
        """
        Initialize ProjectManager.
        
        Args:
            engine: SQLAlchemy Engine instance
            eda_manager: Optional EDAManager (for backwards compatibility)
        """
        self.engine = engine
        self.eda_manager = eda_manager
        self.importer = DuckDBImporter(engine)
        self.column_mappings = ColumnMappingsService(engine)
        self.statistics = StatisticsService(engine)
    
    # ========== Project CRUD ==========
    
    @grpc_response(projects_pb2.CreateProjectResponse)
    def create_project(self, request: projects_pb2.CreateProjectRequest) -> projects_pb2.CreateProjectResponse:
        """Create a new project."""
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
        
        response = projects_pb2.CreateProjectResponse()
        response.success = True
        self._populate_project_response(response.project, project)
        return response
    
    @grpc_response(projects_pb2.GetProjectsResponse)
    def get_projects(self, request: projects_pb2.GetProjectsRequest) -> projects_pb2.GetProjectsResponse:
        """Get projects with pagination."""
        with Session(self.engine) as session:
            project_count = session.exec(select(func.count(models.Project.id))).one()
            projects = session.exec(
                select(models.Project)
                .order_by(models.Project.updated_at.desc())
                .limit(request.limit or 100)
                .offset(request.offset)
            ).all()
        
        response = projects_pb2.GetProjectsResponse()
        response.total_count = int(project_count)
        
        for proj in projects:
            self._populate_project_response(response.projects.add(), proj)
        
        return response
    
    @grpc_response(projects_pb2.GetProjectResponse)
    def get_project(self, request: projects_pb2.GetProjectRequest) -> projects_pb2.GetProjectResponse:
        """Get a specific project."""
        with Session(self.engine) as session:
            project = session.get(models.Project, request.project_id)
        
        response = projects_pb2.GetProjectResponse()
        if project:
            response.success = True
            self._populate_project_response(response.project, project)
        else:
            response.success = False
            response.error_message = "Project not found"
        return response
    
    @grpc_response(projects_pb2.UpdateProjectResponse)
    def update_project(self, request: projects_pb2.UpdateProjectRequest) -> projects_pb2.UpdateProjectResponse:
        """Update a project."""
        with Session(self.engine) as session:
            project = session.get(models.Project, request.project_id)
            if not project:
                response = projects_pb2.UpdateProjectResponse()
                response.success = False
                response.error_message = "Project not found"
                return response
            
            project.name = request.name
            project.description = request.description
            project.updated_at = db_connection.get_timestamp()
            session.add(project)
            session.commit()
            session.refresh(project)
        
        response = projects_pb2.UpdateProjectResponse()
        response.success = True
        self._populate_project_response(response.project, project)
        return response
    
    @grpc_response(projects_pb2.DeleteProjectResponse)
    def delete_project(self, request: projects_pb2.DeleteProjectRequest) -> projects_pb2.DeleteProjectResponse:
        """Delete a project."""
        with Session(self.engine) as session:
            project = session.get(models.Project, request.project_id)
            if not project:
                response = projects_pb2.DeleteProjectResponse()
                response.success = False
                response.error_message = "Project not found"
                return response
            
            session.delete(project)
            session.commit()
        
        response = projects_pb2.DeleteProjectResponse()
        response.success = True
        return response
    
    def _populate_project_response(self, resp, project: models.Project) -> None:
        """Populate a project response object."""
        resp.id = project.id
        resp.name = project.name
        resp.description = project.description or ""
        resp.created_at = project.created_at
        resp.updated_at = project.updated_at
    
    # ========== File Creation (Unified) ==========
    
    @grpc_response(projects_pb2.CreateFileResponse)
    def create_file(self, request: projects_pb2.CreateFileRequest) -> projects_pb2.CreateFileResponse:
        """
        Create a new file - unified handler for SAMPLE and BLOCK types.

        Now stores file in memory cache instead of importing to DuckDB immediately.
        DuckDB import happens during process_dataset when user clicks "Guardar Dataset".

        Drill holes require CreateMultiFileRequest.
        """
        # Start progress tracking
        op_id = progress_tracker.start("create_file", "Initializing file import...")

        try:
            # Extract preprocessing options
            progress_tracker.update(op_id, 20, "Parsing request options...")
            skip_rows = request.skip_rows if request.HasField('skip_rows') else 0
            skip_columns = list(request.skip_columns) if request.skip_columns else []
            replace_data = [{'from': r.from_value, 'to': r.to_value} for r in request.replace_data] if request.replace_data else []

            # Validate dataset type
            if request.dataset_type == projects_pb2.DATASET_TYPE_DRILL_HOLES:
                progress_tracker.fail(op_id, "DRILL_HOLES requires CreateMultiFileRequest")
                response = projects_pb2.CreateFileResponse()
                response.success = False
                response.error_message = "DRILL_HOLES requires CreateMultiFileRequest"
                return response

            # Check cancellation
            if progress_tracker.is_cancelled(op_id):
                response = projects_pb2.CreateFileResponse()
                response.success = False
                response.error_message = "Operation cancelled"
                return response

            # Generate file ID
            progress_tracker.update(op_id, 40, "Generating file identifier...")
            file_id = db_connection.generate_id()

            # Build metadata based on dataset type
            progress_tracker.update(op_id, 60, "Building file metadata...")
            extra_metadata = self._build_file_metadata(request)

            # Store file in memory cache (NOT in database yet)
            progress_tracker.update(op_id, 80, "Storing file in cache...")
            file_cache.store(
                file_id=file_id,
                file_content=bytes(request.file_content),
                original_filename=request.original_filename,
                preprocessing={
                    'skip_rows': skip_rows,
                    'skip_columns': skip_columns,
                    'replace_data': replace_data
                },
                metadata={
                    'project_id': request.project_id,
                    'name': request.name,
                    'dataset_type': int(request.dataset_type),
                    'file_size': len(request.file_content),
                    'extra_metadata': extra_metadata
                }
            )

            progress_tracker.complete(op_id)

            # Create a temporary File object for response population
            temp_file = models.File(
                id=file_id,
                project_id=request.project_id,
                name=request.name,
                dataset_type=int(request.dataset_type),
                original_filename=request.original_filename,
                file_size=len(request.file_content),
                created_at=db_connection.get_timestamp(),
                extra_metadata=extra_metadata
            )

            response = projects_pb2.CreateFileResponse()
            response.success = True
            self._populate_file_response(response.file, temp_file)
            return response

        except Exception as e:
            progress_tracker.fail(op_id, str(e))
            raise
    
    @grpc_response(projects_pb2.CreateMultiFileResponse)
    def create_multi_file(self, request: projects_pb2.CreateMultiFileRequest) -> projects_pb2.CreateMultiFileResponse:
        """
        Create multiple files for DRILL_HOLES dataset type.

        Now stores files in memory cache instead of importing to DuckDB immediately.
        DuckDB import happens during process_dataset when user clicks "Guardar Dataset".
        """
        if request.dataset_type != projects_pb2.DATASET_TYPE_DRILL_HOLES:
            response = projects_pb2.CreateMultiFileResponse()
            response.success = False
            response.error_message = "CreateMultiFileRequest is only for DRILL_HOLES"
            return response

        # Extract preprocessing options
        skip_rows = request.skip_rows if request.HasField('skip_rows') else 0
        skip_columns = list(request.skip_columns) if request.skip_columns else []
        replace_data = [{'from': r.from_value, 'to': r.to_value} for r in request.replace_data] if request.replace_data else []

        # Generate group ID
        group_id = db_connection.generate_id()

        # Build drill hole metadata
        drill_hole_metadata = {
            'group_id': group_id,
            'x_variable': request.x_variable if request.HasField('x_variable') else None,
            'y_variable': request.y_variable if request.HasField('y_variable') else None,
            'z_variable': request.z_variable if request.HasField('z_variable') else None,
            'id_variable': request.id_variable if request.HasField('id_variable') else None,
            'depth_variable': request.depth_variable if request.HasField('depth_variable') else None,
            'composite_data': request.composite_data if request.HasField('composite_data') else False,
            'composite_distance': request.composite_distance if request.HasField('composite_distance') else None
        }

        mock_files = []

        for file_upload in request.files:
            file_id = db_connection.generate_id()

            # Create file-specific metadata
            file_metadata = {**drill_hole_metadata, 'file_role': file_upload.file_role}

            # Store file in memory cache (NOT in database yet)
            file_cache.store(
                file_id=file_id,
                file_content=bytes(file_upload.file_content),
                original_filename=file_upload.original_filename,
                preprocessing={
                    'skip_rows': skip_rows,
                    'skip_columns': skip_columns,
                    'replace_data': replace_data
                },
                metadata={
                    'project_id': request.project_id,
                    'name': file_upload.name,
                    'dataset_type': int(request.dataset_type),
                    'file_size': len(file_upload.file_content),
                    'extra_metadata': json.dumps(file_metadata)
                }
            )

            # Create temporary File object for response
            temp_file = models.File(
                id=file_id,
                project_id=request.project_id,
                name=file_upload.name,
                dataset_type=int(request.dataset_type),
                original_filename=file_upload.original_filename,
                file_size=len(file_upload.file_content),
                created_at=db_connection.get_timestamp(),
                extra_metadata=json.dumps(file_metadata)
            )
            mock_files.append(temp_file)

        response = projects_pb2.CreateMultiFileResponse()
        response.success = True
        for f in mock_files:
            self._populate_file_response(response.files.add(), f)
        return response
    
    def _build_file_metadata(self, request) -> Optional[str]:
        """Build metadata JSON based on dataset type."""
        if request.dataset_type == projects_pb2.DATASET_TYPE_BLOCK:
            if request.HasField('block_settings'):
                return json.dumps({
                    'block_settings': {
                        'x': request.block_settings.x,
                        'y': request.block_settings.y,
                        'z': request.block_settings.z
                    }
                })
        return None
    
    def _populate_file_response(self, resp, file: models.File) -> None:
        """Populate a file response object."""
        resp.id = file.id
        resp.project_id = file.project_id
        resp.name = file.name
        resp.dataset_type = file.dataset_type
        resp.original_filename = file.original_filename
        resp.file_size = file.file_size
        resp.created_at = file.created_at
    
    # ========== File Operations ==========
    
    @grpc_response(projects_pb2.GetProjectFilesResponse)
    def get_project_files(self, request: projects_pb2.GetProjectFilesRequest) -> projects_pb2.GetProjectFilesResponse:
        """Get all files for a project."""
        with Session(self.engine) as session:
            files = session.exec(
                select(models.File)
                .where(models.File.project_id == request.project_id)
                .order_by(models.File.created_at.desc())
            ).all()
        
        response = projects_pb2.GetProjectFilesResponse()
        for f in files:
            self._populate_file_response(response.files.add(), f)
        return response
    
    @grpc_response(projects_pb2.GetProjectDatasetsResponse)
    def get_project_datasets(self, request: projects_pb2.GetProjectDatasetsRequest) -> projects_pb2.GetProjectDatasetsResponse:
        """Get all datasets for a project."""
        with Session(self.engine) as session:
            results = session.exec(
                select(models.Dataset, models.File)
                .join(models.File, models.Dataset.file_id == models.File.id)
                .where(models.File.project_id == request.project_id)
                .order_by(models.Dataset.created_at.desc())
            ).all()
        
        response = projects_pb2.GetProjectDatasetsResponse()
        for dataset, file in results:
            ds = response.datasets.add()
            ds.id = dataset.id
            ds.file_id = dataset.file_id
            ds.file_name = file.name
            ds.dataset_type = file.dataset_type
            ds.original_filename = file.original_filename
            ds.total_rows = dataset.total_rows
            ds.created_at = dataset.created_at
            
            # Add column mappings
            if dataset.column_mappings:
                populate_response_mappings(ds, json.loads(dataset.column_mappings))
        
        return response
    
    @grpc_response(projects_pb2.DeleteFileResponse)
    def delete_file(self, request: projects_pb2.DeleteFileRequest) -> projects_pb2.DeleteFileResponse:
        """Delete a file and its associated data."""
        with Session(self.engine) as session:
            file = session.get(models.File, request.file_id)
            if not file:
                response = projects_pb2.DeleteFileResponse()
                response.success = False
                response.error_message = "File not found"
                return response
            
            # Delete datasets and their statistics
            datasets = session.exec(
                select(models.Dataset).where(models.Dataset.file_id == request.file_id)
            ).all()
            
            for dataset in datasets:
                # Delete statistics
                stats = session.exec(
                    select(models.DatasetColumnStats)
                    .where(models.DatasetColumnStats.dataset_id == dataset.id)
                ).all()
                for stat in stats:
                    session.delete(stat)
                session.commit()
                
                # Delete dataset
                session.delete(dataset)
                session.commit()
            
            # Drop DuckDB table
            table_name = db_connection.get_table_name(request.file_id)
            db_connection.drop_table_if_exists(self.engine, table_name)
            
            # Delete file
            session.delete(file)
            session.commit()
        
        response = projects_pb2.DeleteFileResponse()
        response.success = True
        return response
    
    @grpc_response(projects_pb2.UpdateFileResponse)
    def update_file(self, request: projects_pb2.UpdateFileRequest) -> projects_pb2.UpdateFileResponse:
        """Update file metadata (name)."""
        with Session(self.engine) as session:
            file = session.get(models.File, request.file_id)
            if not file:
                response = projects_pb2.UpdateFileResponse()
                response.success = False
                response.error_message = "File not found"
                return response
            
            file.name = request.name
            session.add(file)
            session.commit()
            session.refresh(file)
        
        response = projects_pb2.UpdateFileResponse()
        response.success = True
        self._populate_file_response(response.file, file)
        return response
    
    @grpc_response(projects_pb2.RenameFileColumnResponse)
    def rename_file_column(self, request: projects_pb2.RenameFileColumnRequest) -> projects_pb2.RenameFileColumnResponse:
        """Rename columns in a file's DuckDB table."""
        column_renames = dict(request.column_renames)
        table_name = db_connection.get_table_name(request.file_id)
        
        if not db_connection.check_duckdb_table_exists(self.engine, table_name):
            response = projects_pb2.RenameFileColumnResponse()
            response.success = False
            response.error_message = f"Table {table_name} does not exist"
            return response
        
        renamed = []
        
        with self.engine.connect() as conn:
            with conn.begin():
                existing = set(db_connection.get_table_columns(self.engine, table_name))
                
                for old_name, new_name in column_renames.items():
                    if old_name in existing:
                        conn.execute(text(f'ALTER TABLE {table_name} RENAME COLUMN "{old_name}" TO "{new_name}"'))
                        renamed.append(new_name)
        
        # Update column mappings
        self.column_mappings.rename_columns(request.file_id, column_renames)
        
        # Recalculate statistics
        self.statistics.recalculate_for_file(request.file_id)
        
        response = projects_pb2.RenameFileColumnResponse()
        response.success = True
        response.renamed_columns.extend(renamed)
        return response
    
    # ========== CSV Analysis ==========
    
    @grpc_response(projects_pb2.AnalyzeCsvForProjectResponse)
    def analyze_csv_for_project(self, request: projects_pb2.AnalyzeCsvForProjectRequest) -> projects_pb2.AnalyzeCsvForProjectResponse:
        """
        Analyze CSV file with column type detection.

        Now checks file_cache first (for newly uploaded files), then falls back to DuckDB
        (for backwards compatibility with existing datasets).
        """
        if not request.file_id:
            response = projects_pb2.AnalyzeCsvForProjectResponse()
            response.success = False
            response.error_message = "file_id is required"
            return response

        # Check if file is in cache (newly uploaded, not yet processed)
        cached_file = file_cache.get(request.file_id)

        if cached_file:
            # File is in cache - parse directly from bytes
            metadata = cached_file['metadata']

            # For drill holes, only analyze assay files
            if metadata['dataset_type'] == projects_pb2.DATASET_TYPE_DRILL_HOLES:
                extra_meta = json.loads(metadata['extra_metadata']) if metadata.get('extra_metadata') else {}
                if extra_meta.get('file_role') != 'assay':
                    response = projects_pb2.AnalyzeCsvForProjectResponse()
                    response.success = False
                    response.error_message = f"Cannot analyze {extra_meta.get('file_role')} file. Analyze the assay file."
                    return response

            # Parse CSV from bytes using DuckDB (much faster than pandas!)
            import tempfile
            import os

            preprocessing = cached_file['preprocessing']
            file_content = cached_file['file_content']
            original_filename = cached_file['original_filename']

            try:
                # For GSLIB files, still use FileParser as DuckDB doesn't support that format
                is_gslib = original_filename.lower().endswith('.out')

                if is_gslib:
                    # Use FileParser for GSLIB format
                    import pandas as pd
                    df = FileParser.parse_to_dataframe(
                        content=file_content,
                        filename=original_filename,
                        skip_rows=preprocessing.get('skip_rows', 0),
                        skip_columns=preprocessing.get('skip_columns', []),
                        replace_data=preprocessing.get('replace_data', [])
                    )

                    # Get headers and preview
                    headers = df.columns.tolist()
                    preview_data = df.head(20).values.tolist()
                    row_count = len(df)

                    # Build schema info from pandas dtypes
                    schema = [(col, str(df[col].dtype)) for col in df.columns]

                else:
                    # Use DuckDB for CSV (much faster!)
                    # Write to temporary file
                    with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as temp_file:
                        temp_file.write(file_content)
                        temp_csv_path = temp_file.name

                    try:
                        skip_rows = preprocessing.get('skip_rows', 0)

                        with self.engine.connect() as conn:
                            # Read CSV with DuckDB
                            query = f"""
                                SELECT * FROM read_csv_auto(
                                    '{temp_csv_path}',
                                    skip={skip_rows},
                                    sample_size=-1
                                )
                            """

                            # Get schema
                            schema_result = conn.execute(text(f"""
                                DESCRIBE {query}
                            """))
                            schema = [(row[0], row[1]) for row in schema_result]
                            headers = [col for col, _ in schema]

                            # Apply column skipping if needed
                            skip_columns = preprocessing.get('skip_columns', [])
                            if skip_columns:
                                headers = [h for h in headers if h not in skip_columns]
                                selected_cols = ', '.join([f'"{h}"' for h in headers])
                                query = f"""
                                    SELECT {selected_cols} FROM read_csv_auto(
                                        '{temp_csv_path}',
                                        skip={skip_rows},
                                        sample_size=-1
                                    )
                                """
                                # Re-get schema for selected columns
                                schema_result = conn.execute(text(f"DESCRIBE {query}"))
                                schema = [(row[0], row[1]) for row in schema_result]

                            # Get preview (first 20 rows)
                            preview_result = conn.execute(text(f"{query} LIMIT 20"))
                            preview_data = [list(row) for row in preview_result]

                            # Get total count
                            count_result = conn.execute(text(f"SELECT COUNT(*) FROM ({query}) t"))
                            row_count = int(count_result.fetchone()[0])

                    finally:
                        os.unlink(temp_csv_path)

                # Determine column types from schema and suggest mappings
                numeric_keywords = ['INT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'REAL', 'BIGINT', 'SMALLINT', 'TINYINT']

                suggested_types = []
                suggested_mappings = {}

                for col_name, col_type in schema:
                    is_numeric = any(kw in col_type.upper() for kw in numeric_keywords)

                    if is_numeric:
                        suggested_types.append(projects_pb2.COLUMN_TYPE_NUMERIC)
                        # Suggest coordinate mappings
                        col_lower = col_name.lower()
                        if any(k in col_lower for k in ['x', 'east', 'longitude', 'lon']):
                            suggested_mappings[col_name] = "x"
                        elif any(k in col_lower for k in ['y', 'north', 'latitude', 'lat']):
                            suggested_mappings[col_name] = "y"
                        elif any(k in col_lower for k in ['z', 'elevation', 'height', 'depth']):
                            suggested_mappings[col_name] = "z"
                        else:
                            suggested_mappings[col_name] = ""
                    else:
                        suggested_types.append(projects_pb2.COLUMN_TYPE_CATEGORICAL)
                        suggested_mappings[col_name] = ""

                # Build response
                response = projects_pb2.AnalyzeCsvForProjectResponse()
                response.success = True
                response.headers.extend(headers)
                response.suggested_types.extend(suggested_types)
                response.suggested_mappings.update(suggested_mappings)
                response.total_rows = row_count

                for row in preview_data:
                    preview_row = projects_pb2.PreviewRow()
                    preview_row.values.extend([str(v) for v in row])
                    response.preview_rows.append(preview_row)

                return response

            except Exception as e:
                response = projects_pb2.AnalyzeCsvForProjectResponse()
                response.success = False
                response.error_message = f"Error parsing file: {str(e)}"
                return response

        else:
            # File not in cache - check database (backwards compatibility)
            with Session(self.engine) as session:
                file = session.get(models.File, request.file_id)
                if not file:
                    response = projects_pb2.AnalyzeCsvForProjectResponse()
                    response.success = False
                    response.error_message = "File not found"
                    return response

                # For drill holes, only analyze assay files
                if file.dataset_type == projects_pb2.DATASET_TYPE_DRILL_HOLES and file.extra_metadata:
                    metadata = json.loads(file.extra_metadata)
                    if metadata.get('file_role') != 'assay':
                        response = projects_pb2.AnalyzeCsvForProjectResponse()
                        response.success = False
                        response.error_message = f"Cannot analyze {metadata.get('file_role')} file. Analyze the assay file."
                        return response

            table_name = db_connection.get_table_name(request.file_id)

            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                response = projects_pb2.AnalyzeCsvForProjectResponse()
                response.success = False
                response.error_message = "Table does not exist. Re-upload the file."
                return response

            # Get schema and preview from DuckDB
            schema = db_connection.get_table_schema(self.engine, table_name)
            headers = [col for col, _ in schema]

            with self.engine.connect() as conn:
                preview_result = conn.execute(text(f"SELECT * FROM {table_name} LIMIT 20"))
                preview_data = [list(row) for row in preview_result]

                count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                row_count = int(count_result[0])

            # Determine column types from DuckDB schema
            numeric_keywords = ['INT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'REAL', 'BIGINT', 'SMALLINT', 'TINYINT']

            suggested_types = []
            suggested_mappings = {}

            for col_name, col_type in schema:
                is_numeric = any(kw in col_type.upper() for kw in numeric_keywords)

                if is_numeric:
                    suggested_types.append(projects_pb2.COLUMN_TYPE_NUMERIC)
                    # Suggest coordinate mappings
                    col_lower = col_name.lower()
                    if any(k in col_lower for k in ['x', 'east', 'longitude', 'lon']):
                        suggested_mappings[col_name] = "x"
                    elif any(k in col_lower for k in ['y', 'north', 'latitude', 'lat']):
                        suggested_mappings[col_name] = "y"
                    elif any(k in col_lower for k in ['z', 'elevation', 'height', 'depth']):
                        suggested_mappings[col_name] = "z"
                    else:
                        suggested_mappings[col_name] = ""
                else:
                    suggested_types.append(projects_pb2.COLUMN_TYPE_CATEGORICAL)
                    suggested_mappings[col_name] = ""

            response = projects_pb2.AnalyzeCsvForProjectResponse()
            response.success = True
            response.headers.extend(headers)
            response.suggested_types.extend(suggested_types)
            response.suggested_mappings.update(suggested_mappings)
            response.total_rows = row_count

            for row in preview_data:
                preview_row = projects_pb2.PreviewRow()
                preview_row.values.extend([str(v) for v in row])
                response.preview_rows.append(preview_row)

            return response
    
    # ========== Dataset Processing (Unified) ==========
    
    @grpc_response(projects_pb2.ProcessDatasetResponse)
    def process_dataset(self, request: projects_pb2.ProcessDatasetRequest) -> projects_pb2.ProcessDatasetResponse:
        """
        Process dataset with column mappings - unified handler for all types.

        Now imports from file_cache to DuckDB if file was newly uploaded.
        This is when the actual DuckDB table creation happens (on "Guardar Dataset" click).
        """
        # Start progress tracking
        op_id = progress_tracker.start("process_dataset", "Initializing dataset processing...")

        try:
            # Check if file is in cache (newly uploaded, not yet in database)
            cached_file = file_cache.get(request.file_id)

            if cached_file:
                # File is in cache - import to DuckDB NOW and create File record
                progress_tracker.update(op_id, 5, "Importing file to database...")

                metadata = cached_file['metadata']
                preprocessing = cached_file['preprocessing']
                file_content = cached_file['file_content']
                original_filename = cached_file['original_filename']

                # For drill holes, validate it's an assay file
                if metadata['dataset_type'] == projects_pb2.DATASET_TYPE_DRILL_HOLES:
                    extra_meta = json.loads(metadata.get('extra_metadata', '{}'))
                    if extra_meta.get('file_role') != 'assay':
                        error_msg = f"Can only process assay files. This is a {extra_meta.get('file_role')} file."
                        progress_tracker.fail(op_id, error_msg)
                        response = projects_pb2.ProcessDatasetResponse()
                        response.success = False
                        response.error_message = error_msg
                        return response

                # Check cancellation
                if progress_tracker.is_cancelled(op_id):
                    file_cache.delete(request.file_id)
                    response = projects_pb2.ProcessDatasetResponse()
                    response.success = False
                    response.error_message = "Operation cancelled"
                    return response

                # Generate table name and import to DuckDB
                progress_tracker.update(op_id, 15, "Creating database table...")
                table_name = db_connection.get_table_name(request.file_id)

                self.importer.import_file(
                    file_content,
                    original_filename,
                    table_name,
                    skip_rows=preprocessing.get('skip_rows', 0),
                    skip_columns=preprocessing.get('skip_columns', []),
                    replace_data=preprocessing.get('replace_data', [])
                )

                # Verify table creation
                if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                    file_cache.delete(request.file_id)
                    progress_tracker.fail(op_id, f"Failed to create table '{table_name}'")
                    raise Exception(f"Failed to create table '{table_name}'")

                progress_tracker.update(op_id, 25, "Counting rows...")
                total_rows = db_connection.get_table_row_count(self.engine, table_name)

                # Create File record in database NOW
                progress_tracker.update(op_id, 30, "Saving file record...")
                file = models.File(
                    id=request.file_id,
                    project_id=metadata['project_id'],
                    name=metadata['name'],
                    dataset_type=metadata['dataset_type'],
                    original_filename=original_filename,
                    file_size=metadata['file_size'],
                    created_at=db_connection.get_timestamp(),
                    extra_metadata=metadata.get('extra_metadata')
                )

                with Session(self.engine) as session:
                    session.add(file)
                    session.commit()
                    session.refresh(file)

                # Delete from cache after successful import
                file_cache.delete(request.file_id)

            else:
                # File not in cache - check database (backwards compatibility)
                progress_tracker.update(op_id, 5, "Loading file information...")
                with Session(self.engine) as session:
                    file = session.get(models.File, request.file_id)
                    if not file:
                        progress_tracker.fail(op_id, "File not found")
                        response = projects_pb2.ProcessDatasetResponse()
                        response.success = False
                        response.error_message = "File not found"
                        return response

                # For drill holes, validate it's an assay file
                if file.dataset_type == projects_pb2.DATASET_TYPE_DRILL_HOLES:
                    if not file.extra_metadata:
                        progress_tracker.fail(op_id, "Drill hole file missing metadata")
                        response = projects_pb2.ProcessDatasetResponse()
                        response.success = False
                        response.error_message = "Drill hole file missing metadata"
                        return response

                    metadata = json.loads(file.extra_metadata)
                    if metadata.get('file_role') != 'assay':
                        error_msg = f"Can only process assay files. This is a {metadata.get('file_role')} file."
                        progress_tracker.fail(op_id, error_msg)
                        response = projects_pb2.ProcessDatasetResponse()
                        response.success = False
                        response.error_message = error_msg
                        return response

                # Check cancellation
                if progress_tracker.is_cancelled(op_id):
                    response = projects_pb2.ProcessDatasetResponse()
                    response.success = False
                    response.error_message = "Operation cancelled"
                    return response

                # Get table info
                progress_tracker.update(op_id, 15, "Validating database table...")
                table_name = db_connection.get_table_name(request.file_id)

                if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                    progress_tracker.fail(op_id, f"Table {table_name} not found")
                    response = projects_pb2.ProcessDatasetResponse()
                    response.success = False
                    response.error_message = f"Table {table_name} not found"
                    return response

                progress_tracker.update(op_id, 25, "Counting rows...")
                total_rows = db_connection.get_table_row_count(self.engine, table_name)

            # Check cancellation
            if progress_tracker.is_cancelled(op_id):
                response = projects_pb2.ProcessDatasetResponse()
                response.success = False
                response.error_message = "Operation cancelled"
                return response

            # Build column mappings
            progress_tracker.update(op_id, 35, "Building column mappings...")
            column_mappings_list = build_column_mappings_list(request.column_mappings)

            # Build dataset metadata based on type
            progress_tracker.update(op_id, 45, "Building dataset metadata...")
            extra_metadata = self._build_dataset_metadata(file)
            
            # Create dataset record
            progress_tracker.update(op_id, 55, "Creating dataset record...")
            dataset = models.Dataset(
                id=db_connection.generate_id(),
                file_id=request.file_id,
                duckdb_table_name=table_name,
                total_rows=total_rows,
                column_mappings=json.dumps(column_mappings_list),
                created_at=db_connection.get_timestamp(),
                extra_metadata=extra_metadata
            )
            
            with Session(self.engine) as session:
                session.add(dataset)
                session.commit()
                session.refresh(dataset)
            
            # Check cancellation before expensive stats generation
            if progress_tracker.is_cancelled(op_id):
                response = projects_pb2.ProcessDatasetResponse()
                response.success = False
                response.error_message = "Operation cancelled"
                return response
            
            # Generate and store statistics (heaviest operation)
            progress_tracker.update(op_id, 65, "Generating column statistics...")
            self.statistics.generate_and_store(request.file_id, dataset.id)
            
            progress_tracker.update(op_id, 95, "Finalizing dataset...")
            
            # Build response
            response = projects_pb2.ProcessDatasetResponse()
            response.success = True
            response.processed_rows = total_rows
            
            ds = response.dataset
            ds.id = dataset.id
            ds.file_id = dataset.file_id
            ds.total_rows = dataset.total_rows
            ds.created_at = dataset.created_at
            populate_response_mappings(ds, column_mappings_list)
            
            progress_tracker.complete(op_id)
            return response
            
        except Exception as e:
            progress_tracker.fail(op_id, str(e))
            raise
    
    def _build_dataset_metadata(self, file: models.File) -> Optional[str]:
        """Build dataset metadata based on file type."""
        if not file.extra_metadata:
            return None
        
        file_meta = json.loads(file.extra_metadata)
        
        if file.dataset_type == projects_pb2.DATASET_TYPE_BLOCK:
            if 'block_settings' in file_meta:
                return json.dumps({'block_settings': file_meta['block_settings']})
        
        elif file.dataset_type == projects_pb2.DATASET_TYPE_DRILL_HOLES:
            return json.dumps({
                'group_id': file_meta.get('group_id'),
                'drill_hole_config': file_meta
            })
        
        return None
    
    @grpc_response(projects_pb2.DeleteDatasetResponse)
    def delete_dataset(self, request: projects_pb2.DeleteDatasetRequest) -> projects_pb2.DeleteDatasetResponse:
        """Delete a dataset."""
        import time
        start_time = time.time()
        
        with Session(self.engine) as session:
            dataset = session.get(models.Dataset, request.dataset_id)
            if not dataset:
                response = projects_pb2.DeleteDatasetResponse()
                response.success = False
                response.error_message = "Dataset not found"
                return response
            
            # Delete statistics
            stats = session.exec(
                select(models.DatasetColumnStats)
                .where(models.DatasetColumnStats.dataset_id == request.dataset_id)
            ).all()
            for stat in stats:
                session.delete(stat)
            session.commit()
            
            # Delete dataset
            session.delete(dataset)
            session.commit()
        
        response = projects_pb2.DeleteDatasetResponse()
        response.success = True
        response.delete_time = time.time() - start_time
        return response
