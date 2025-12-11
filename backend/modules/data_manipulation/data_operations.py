#!/usr/bin/env python
"""
Data manipulation operations module
Handles dataset modification operations (replace, search, filter, column operations, merge)
"""
import json
from typing import List, Dict, Optional
from sqlalchemy import Engine, text
from sqlmodel import Session, select

from generated import projects_pb2
from modules.others import models, db_connection
from modules.others.decorators import grpc_response
from modules.others.column_mappings import ColumnMappingsService
from modules.others.statistics_service import StatisticsService


class DataManipulationManager:
    """Manager for data manipulation operations"""
    
    def __init__(self, engine: Engine, eda_manager=None):
        """
        Initialize DataManipulationManager.
        
        Args:
            engine: SQLAlchemy Engine instance
            eda_manager: Optional EDAManager (for backwards compatibility)
        """
        self.engine = engine
        self.eda_manager = eda_manager
        self.column_mappings = ColumnMappingsService(engine)
        self.statistics = StatisticsService(engine)
    
    def _recalculate_statistics(self, file_id: str) -> None:
        """Recalculate statistics after data modification."""
        self.statistics.recalculate_for_file(file_id)
    
    def _get_table_name(self, file_id: str) -> str:
        """Get table name for file."""
        return db_connection.get_table_name(file_id)
    
    def _ensure_table_exists(self, table_name: str) -> bool:
        """Check if table exists."""
        return db_connection.check_duckdb_table_exists(self.engine, table_name)
    
    def _build_where_clause(self, column: str, operation: str, value: str) -> str:
        """Build SQL WHERE clause for filtering."""
        if operation.upper() == "LIKE":
            return f'"{column}" LIKE \'%{value}%\''
        
        # Try numeric comparison
        try:
            float(value)
            return f'"{column}" {operation} {value}'
        except (ValueError, TypeError):
            return f'"{column}" {operation} \'{value}\''
    
    # ========== Replace Operations ==========
    
    @grpc_response(projects_pb2.ReplaceFileDataResponse)
    def replace_file_data(self, request: projects_pb2.ReplaceFileDataRequest) -> projects_pb2.ReplaceFileDataResponse:
        """Replace values in file."""
        replacements = [(r.from_value, r.to_value) for r in request.replacements]
        columns = list(request.columns) if request.columns and len(request.columns) > 0 else None
        
        table_name = self._get_table_name(request.file_id)
        
        if not self._ensure_table_exists(table_name):
            response = projects_pb2.ReplaceFileDataResponse()
            response.success = False
            response.error_message = f"Table {table_name} does not exist"
            return response
        
        total_cells_affected = 0
        
        with self.engine.connect() as conn:
            with conn.begin():
                # Get all columns if none specified
                if not columns:
                    columns = db_connection.get_table_columns(self.engine, table_name)
                
                for col in columns:
                    for from_val, to_val in replacements:
                        # Count matching rows
                        count_result = conn.execute(text(
                            f'SELECT COUNT(*) FROM {table_name} WHERE "{col}" = \'{from_val}\''
                        )).fetchone()
                        matching = int(count_result[0]) if count_result else 0
                        
                        if matching > 0:
                            # Handle NULL replacements
                            if to_val.upper() == "NULL" or to_val == "":
                                conn.execute(text(
                                    f'UPDATE {table_name} SET "{col}" = NULL WHERE "{col}" = \'{from_val}\''
                                ))
                            else:
                                conn.execute(text(
                                    f'UPDATE {table_name} SET "{col}" = \'{to_val}\' WHERE "{col}" = \'{from_val}\''
                                ))
                            total_cells_affected += matching
        
        if total_cells_affected > 0:
            self._recalculate_statistics(request.file_id)
        
        response = projects_pb2.ReplaceFileDataResponse()
        response.success = True
        response.rows_affected = total_cells_affected
        return response
    
    # ========== Search Operations ==========
    
    @grpc_response(projects_pb2.SearchFileDataResponse)
    def search_file_data(self, request: projects_pb2.SearchFileDataRequest) -> projects_pb2.SearchFileDataResponse:
        """Search/filter data with pagination."""
        table_name = self._get_table_name(request.file_id)
        
        if not self._ensure_table_exists(table_name):
            response = projects_pb2.SearchFileDataResponse()
            response.success = False
            response.error_message = f"Table {table_name} does not exist"
            return response
        
        limit = request.limit or 100
        offset = request.offset or 0
        
        with self.engine.connect() as conn:
            # Build queries with optional WHERE
            where = f"WHERE {request.query}" if request.query and request.query.strip() else ""
            
            count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name} {where}")).fetchone()
            total_rows = int(count_result[0])
            
            data_result = conn.execute(text(
                f"SELECT * FROM {table_name} {where} LIMIT {limit} OFFSET {offset}"
            ))
            columns = data_result.keys()
            
            data_rows = [
                {col: str(val) if val is not None else "" for col, val in zip(columns, row)}
                for row in data_result
            ]
        
        response = projects_pb2.SearchFileDataResponse()
        response.success = True
        response.file_id = request.file_id
        response.total_rows = total_rows
        response.current_page = (offset // limit) + 1 if limit else 1
        
        for row_dict in data_rows:
            data_row = response.data.add()
            data_row.fields.update(row_dict)
        
        return response
    
    # ========== Filter Operations ==========
    
    @grpc_response(projects_pb2.FilterFileDataResponse)
    def filter_file_data(self, request: projects_pb2.FilterFileDataRequest) -> projects_pb2.FilterFileDataResponse:
        """Filter file data with option to create new file."""
        table_name = self._get_table_name(request.file_id)
        
        if not self._ensure_table_exists(table_name):
            response = projects_pb2.FilterFileDataResponse()
            response.success = False
            response.error_message = f"Table {table_name} does not exist"
            return response
        
        where_clause = self._build_where_clause(request.column, request.operation, request.value)
        
        if request.create_new_file:
            return self._filter_to_new_file(request, table_name, where_clause)
        else:
            return self._filter_in_place(request, table_name, where_clause)
    
    def _filter_to_new_file(self, request, table_name: str, where_clause: str) -> projects_pb2.FilterFileDataResponse:
        """Create new file from filtered data."""
        if not request.new_file_name:
            response = projects_pb2.FilterFileDataResponse()
            response.success = False
            response.error_message = "new_file_name required when create_new_file=True"
            return response
        
        # Get project_id from original file
        with Session(self.engine) as session:
            file_record = session.get(models.File, request.file_id)
            if not file_record:
                response = projects_pb2.FilterFileDataResponse()
                response.success = False
                response.error_message = "Could not find project_id for file"
                return response
            project_id = file_record.project_id
        
        # Create new table
        new_file_id = db_connection.generate_id()
        new_table_name = db_connection.get_table_name(new_file_id)
        
        with self.engine.connect() as conn:
            with conn.begin():
                conn.execute(text(
                    f"CREATE TABLE {new_table_name} AS SELECT * FROM {table_name} WHERE {where_clause}"
                ))
                count_result = conn.execute(text(f"SELECT COUNT(*) FROM {new_table_name}")).fetchone()
                total_rows = int(count_result[0])
        
        # Create file record
        file = models.File(
            id=new_file_id,
            project_id=project_id,
            name=request.new_file_name,
            dataset_type=0,
            original_filename=f"{request.new_file_name}_filtered.csv",
            file_size=0,
            created_at=db_connection.get_timestamp(),
        )
        
        with Session(self.engine) as session:
            session.add(file)
            session.commit()
        
        response = projects_pb2.FilterFileDataResponse()
        response.success = True
        response.file_id = new_file_id
        response.total_rows = total_rows
        return response
    
    def _filter_in_place(self, request, table_name: str, where_clause: str) -> projects_pb2.FilterFileDataResponse:
        """Filter in place by deleting non-matching rows."""
        with self.engine.connect() as conn:
            with conn.begin():
                result = conn.execute(text(f"DELETE FROM {table_name} WHERE NOT ({where_clause})"))
                rows_deleted = result.rowcount
                
                count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                total_rows = int(count_result[0])
        
        if rows_deleted > 0:
            self._recalculate_statistics(request.file_id)
        
        response = projects_pb2.FilterFileDataResponse()
        response.success = True
        response.file_id = request.file_id
        response.total_rows = total_rows
        return response
    
    # ========== Row Operations ==========
    
    @grpc_response(projects_pb2.DeleteFilePointsResponse)
    def delete_file_points(self, request: projects_pb2.DeleteFilePointsRequest) -> projects_pb2.DeleteFilePointsResponse:
        """Delete specific rows from file."""
        table_name = self._get_table_name(request.file_id)
        
        if not self._ensure_table_exists(table_name):
            response = projects_pb2.DeleteFilePointsResponse()
            response.success = False
            response.error_message = f"Table {table_name} does not exist"
            return response
        
        row_indices = list(request.row_indices)
        
        with self.engine.connect() as conn:
            with conn.begin():
                if row_indices:
                    # Convert 0-based to 1-based
                    row_numbers_str = ",".join(str(i + 1) for i in sorted(row_indices))
                    
                    result = conn.execute(text(f"""
                        DELETE FROM {table_name}
                        WHERE rowid IN (
                            SELECT rowid FROM (
                                SELECT rowid, ROW_NUMBER() OVER () as rn FROM {table_name}
                            ) WHERE rn IN ({row_numbers_str})
                        )
                    """))
                    rows_deleted = result.rowcount
                else:
                    rows_deleted = 0
                
                count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                rows_remaining = int(count_result[0])
        
        if rows_deleted > 0:
            self._recalculate_statistics(request.file_id)
        
        response = projects_pb2.DeleteFilePointsResponse()
        response.success = True
        response.rows_deleted = rows_deleted
        response.rows_remaining = rows_remaining
        return response
    
    # ========== Column Operations ==========
    
    @grpc_response(projects_pb2.AddFilteredColumnResponse)
    def add_filtered_column(self, request: projects_pb2.AddFilteredColumnRequest) -> projects_pb2.AddFilteredColumnResponse:
        """Add a filtered column (non-destructive)."""
        table_name = self._get_table_name(request.file_id)
        
        if not self._ensure_table_exists(table_name):
            response = projects_pb2.AddFilteredColumnResponse()
            response.success = False
            response.error_message = f"Table {table_name} does not exist"
            return response
        
        where_clause = self._build_where_clause(request.source_column, request.operation, request.value)
        
        with self.engine.connect() as conn:
            with conn.begin():
                # Add column
                conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN "{request.new_column_name}" VARCHAR'))
                
                # Update with filtered values
                conn.execute(text(f'''
                    UPDATE {table_name}
                    SET "{request.new_column_name}" = CASE
                        WHEN {where_clause} THEN "{request.source_column}"
                        ELSE NULL
                    END
                '''))
                
                # Count matches
                count_result = conn.execute(text(
                    f'SELECT COUNT(*) FROM {table_name} WHERE "{request.new_column_name}" IS NOT NULL'
                )).fetchone()
                rows_with_values = int(count_result[0])
        
        # Get total rows
        total_rows = db_connection.get_table_row_count(self.engine, table_name)
        rows_with_null = total_rows - rows_with_values
        
        # Update column mappings and statistics
        self._recalculate_statistics(request.file_id)
        self.column_mappings.add_column(request.file_id, request.new_column_name, column_type=1)
        
        response = projects_pb2.AddFilteredColumnResponse()
        response.success = True
        response.new_column_name = request.new_column_name
        response.rows_with_values = rows_with_values
        response.rows_with_null = rows_with_null
        return response
    
    @grpc_response(projects_pb2.AddFileColumnsResponse)
    def add_file_columns(self, request: projects_pb2.AddFileColumnsRequest) -> projects_pb2.AddFileColumnsResponse:
        """Add new columns to file."""
        table_name = self._get_table_name(request.file_id)
        
        if not self._ensure_table_exists(table_name):
            response = projects_pb2.AddFileColumnsResponse()
            response.success = False
            response.error_message = f"Table {table_name} does not exist"
            return response
        
        new_columns = [(col.column_name, list(col.values)) for col in request.new_columns]
        added_columns = []
        
        with self.engine.connect() as conn:
            with conn.begin():
                row_count = db_connection.get_table_row_count(self.engine, table_name)
                
                for col_name, values in new_columns:
                    if len(values) != row_count:
                        response = projects_pb2.AddFileColumnsResponse()
                        response.success = False
                        response.error_message = f"Column '{col_name}' has {len(values)} values but table has {row_count} rows"
                        return response
                    
                    conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN "{col_name}" VARCHAR'))
                    
                    temp_values = ",".join(f"({i+1}, '{val}')" for i, val in enumerate(values))
                    conn.execute(text(f'''
                        UPDATE {table_name}
                        SET "{col_name}" = temp.value
                        FROM (
                            SELECT row_number() OVER () as rn, * FROM (VALUES {temp_values}) AS t(rn_val, value)
                        ) AS temp
                        WHERE {table_name}.rowid = temp.rn_val
                    '''))
                    
                    added_columns.append(col_name)
        
        if added_columns:
            self._recalculate_statistics(request.file_id)
        
        response = projects_pb2.AddFileColumnsResponse()
        response.success = True
        response.added_columns.extend(added_columns)
        return response
    
    @grpc_response(projects_pb2.DuplicateFileColumnsResponse)
    def duplicate_file_columns(self, request: projects_pb2.DuplicateFileColumnsRequest) -> projects_pb2.DuplicateFileColumnsResponse:
        """Duplicate existing columns."""
        table_name = self._get_table_name(request.file_id)
        
        if not self._ensure_table_exists(table_name):
            response = projects_pb2.DuplicateFileColumnsResponse()
            response.success = False
            response.error_message = f"Table {table_name} does not exist"
            return response
        
        columns_to_dup = [(col.source_column, col.new_column_name) for col in request.columns]
        duplicated = []
        
        with self.engine.connect() as conn:
            with conn.begin():
                existing = set(db_connection.get_table_columns(self.engine, table_name))
                
                for source_col, new_name in columns_to_dup:
                    if source_col not in existing:
                        continue
                    
                    # Auto-generate name if not provided
                    if not new_name or not new_name.strip():
                        new_name = f"{source_col}_copy"
                        counter = 1
                        while new_name in existing:
                            new_name = f"{source_col}_copy{counter}"
                            counter += 1
                    
                    if new_name in existing:
                        continue
                    
                    conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN "{new_name}" VARCHAR'))
                    conn.execute(text(f'UPDATE {table_name} SET "{new_name}" = "{source_col}"'))
                    
                    duplicated.append(new_name)
                    existing.add(new_name)
        
        if duplicated:
            self._recalculate_statistics(request.file_id)
            self.column_mappings.add_columns(request.file_id, duplicated)
        
        response = projects_pb2.DuplicateFileColumnsResponse()
        response.success = True
        response.duplicated_columns.extend(duplicated)
        return response
    
    @grpc_response(projects_pb2.DeleteFileColumnsResponse)
    def delete_file_columns(self, request: projects_pb2.DeleteFileColumnsRequest) -> projects_pb2.DeleteFileColumnsResponse:
        """Delete columns from file."""
        table_name = self._get_table_name(request.file_id)
        
        if not self._ensure_table_exists(table_name):
            response = projects_pb2.DeleteFileColumnsResponse()
            response.success = False
            response.error_message = f"Table {table_name} does not exist"
            return response
        
        deleted = []
        
        with self.engine.connect() as conn:
            with conn.begin():
                existing = set(db_connection.get_table_columns(self.engine, table_name))
                
                for col_name in request.column_names:
                    if col_name in existing:
                        conn.execute(text(f'ALTER TABLE {table_name} DROP COLUMN "{col_name}"'))
                        deleted.append(col_name)
        
        if deleted:
            self._recalculate_statistics(request.file_id)
            self.column_mappings.remove_columns(request.file_id, deleted)
        
        response = projects_pb2.DeleteFileColumnsResponse()
        response.success = True
        response.deleted_columns.extend(deleted)
        return response
    
    # ========== Merge Operations ==========
    
    @grpc_response(projects_pb2.MergeDatasetsResponse)
    def merge_datasets(self, request: projects_pb2.MergeDatasetsRequest) -> projects_pb2.MergeDatasetsResponse:
        """Merge two datasets by rows or columns."""
        mode_map = {
            projects_pb2.MERGE_MODE_BY_ROWS: "BY_ROWS",
            projects_pb2.MERGE_MODE_BY_COLUMNS: "BY_COLUMNS"
        }
        mode = mode_map.get(request.mode, "BY_ROWS")
        
        exclude_first = set(request.exclude_columns_first) if request.exclude_columns_first else set()
        exclude_second = set(request.exclude_columns_second) if request.exclude_columns_second else set()
        
        with Session(self.engine) as session:
            dataset1 = session.get(models.Dataset, request.first_dataset_id)
            dataset2 = session.get(models.Dataset, request.second_dataset_id)
            
            if not dataset1 or not dataset2:
                response = projects_pb2.MergeDatasetsResponse()
                response.success = False
                response.error_message = "One or both datasets not found"
                return response
            
            table1 = dataset1.duckdb_table_name
            table2 = dataset2.duckdb_table_name
            
            warnings = []
            merged_dataset_id = db_connection.generate_id()
            merged_table_name = db_connection.get_table_name(merged_dataset_id)
            
            with self.engine.connect() as conn:
                with conn.begin():
                    if mode == "BY_ROWS":
                        rows_merged, columns_merged = self._merge_by_rows(
                            conn, table1, table2, merged_table_name, warnings
                        )
                    else:
                        rows_merged, columns_merged = self._merge_by_columns(
                            conn, table1, table2, merged_table_name, 
                            exclude_first, exclude_second, warnings
                        )
            
            # Get file info
            file1 = session.get(models.File, dataset1.file_id)
            file2 = session.get(models.File, dataset2.file_id)
            
            if not file1 or not file2:
                response = projects_pb2.MergeDatasetsResponse()
                response.success = False
                response.error_message = "Failed to get file metadata"
                return response
            
            # Create merged file
            merged_file_id = db_connection.generate_id()
            merged_file_name = request.output_file or f"merged_{mode.lower()}"
            
            merged_file = models.File(
                id=merged_file_id,
                project_id=file1.project_id,
                name=merged_file_name,
                dataset_type=file1.dataset_type,
                original_filename=f"{merged_file_name}.csv",
                file_size=0,
                created_at=db_connection.get_timestamp(),
            )
            session.add(merged_file)
            session.commit()
            
            # Create merged dataset
            merged_dataset = models.Dataset(
                id=merged_dataset_id,
                file_id=merged_file_id,
                duckdb_table_name=merged_table_name,
                total_rows=rows_merged,
                column_mappings=json.dumps([]),
                created_at=db_connection.get_timestamp(),
            )
            session.add(merged_dataset)
            session.commit()
        
        response = projects_pb2.MergeDatasetsResponse()
        response.success = True
        response.dataset_id = merged_dataset_id
        response.rows_merged = rows_merged
        response.columns_merged = columns_merged
        response.warnings.extend(warnings)
        return response
    
    def _merge_by_rows(self, conn, table1: str, table2: str, merged_table: str, warnings: List[str]):
        """Merge tables by appending rows."""
        cols1 = set(db_connection.get_table_columns(self.engine, table1))
        cols2 = set(db_connection.get_table_columns(self.engine, table2))
        
        if cols1 != cols2:
            warnings.append("Column sets don't match exactly. Using intersection.")
            common_cols = cols1.intersection(cols2)
            col_list = ",".join(f'"{col}"' for col in common_cols)
        else:
            col_list = "*"
        
        conn.execute(text(f"""
            CREATE TABLE {merged_table} AS
            SELECT {col_list} FROM {table1}
            UNION ALL
            SELECT {col_list} FROM {table2}
        """))
        
        count_result = conn.execute(text(f"SELECT COUNT(*) FROM {merged_table}")).fetchone()
        rows_merged = int(count_result[0])
        
        columns_merged = len(db_connection.get_table_columns(self.engine, merged_table))
        
        return rows_merged, columns_merged
    
    def _merge_by_columns(self, conn, table1: str, table2: str, merged_table: str,
                          exclude_first: set, exclude_second: set, warnings: List[str]):
        """Merge tables by joining columns."""
        cols1_all = db_connection.get_table_columns(self.engine, table1)
        cols2_all = db_connection.get_table_columns(self.engine, table2)
        
        cols1 = [c for c in cols1_all if c not in exclude_first]
        cols2 = [c for c in cols2_all if c not in exclude_second]
        
        select_parts = [f't1."{col}"' for col in cols1]
        
        for col in cols2:
            if col in cols1:
                warnings.append(f"Column '{col}' exists in both. Renaming to '{col}_2'")
                select_parts.append(f't2."{col}" AS "{col}_2"')
            else:
                select_parts.append(f't2."{col}"')
        
        select_clause = ", ".join(select_parts)
        
        conn.execute(text(f"""
            CREATE TABLE {merged_table} AS
            SELECT {select_clause}
            FROM (SELECT *, row_number() OVER () as rn FROM {table1}) t1
            JOIN (SELECT *, row_number() OVER () as rn FROM {table2}) t2 ON t1.rn = t2.rn
        """))
        
        count_result = conn.execute(text(f"SELECT COUNT(*) FROM {merged_table}")).fetchone()
        rows_merged = int(count_result[0])
        
        columns_merged = len(db_connection.get_table_columns(self.engine, merged_table))
        
        return rows_merged, columns_merged
