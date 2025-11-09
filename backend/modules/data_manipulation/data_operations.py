#!/usr/bin/env python
"""
Data manipulation operations module
Handles dataset modification operations (replace, search, filter, column operations, merge)
"""
import json
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy import Engine, text
from sqlmodel import Session, select

from generated import projects_pb2
from modules.others import models, db_connection


class DataManipulationManager:
    """Manager for data manipulation operations"""
    
    def __init__(self, engine: Engine, eda_manager=None):
        """
        Initialize DataManipulationManager
        
        Args:
            engine: SQLAlchemy Engine instance
            eda_manager: Optional EDAManager instance for recalculating statistics
        """
        self.engine = engine
        self.eda_manager = eda_manager
    
    def _recalculate_statistics(self, file_id: str) -> None:
        """Helper to recalculate statistics if EDA manager is available"""
        if self.eda_manager:
            self.eda_manager.recalculate_file_statistics(file_id)
    
    def replace_file_data(self, request: projects_pb2.ReplaceFileDataRequest) -> projects_pb2.ReplaceFileDataResponse:
        """Replace values in file"""
        try:
            # Convert protobuf replacements to list of tuples
            replacements = [(r.from_value, r.to_value) for r in request.replacements]
            # Convert columns - if empty array, treat as None (all columns)
            columns = list(request.columns) if request.columns and len(request.columns) > 0 else None
            
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                response = projects_pb2.ReplaceFileDataResponse()
                response.success = False
                response.error_message = f"Table {table_name} does not exist"
                return response
            
            total_cells_affected = 0
            
            with self.engine.connect() as conn:
                with conn.begin():
                    # Get all columns if none specified
                    if not columns:
                        result = conn.execute(text(f"DESCRIBE {table_name}"))
                        columns = [row[0] for row in result]
                    
                    # Apply replacements to each column
                    for col in columns:
                        for from_val, to_val in replacements:
                            # Count matching rows before update
                            count_query = f"""
                                SELECT COUNT(*) FROM {table_name}
                                WHERE "{col}" = '{from_val}'
                            """
                            count_result = conn.execute(text(count_query)).fetchone()
                            matching_count = int(count_result[0]) if count_result else 0
                            
                            if matching_count > 0:
                                # Handle NULL replacements
                                if to_val.upper() == "NULL" or to_val == "":
                                    update_query = f"""
                                        UPDATE {table_name}
                                        SET "{col}" = NULL
                                        WHERE "{col}" = '{from_val}'
                                    """
                                else:
                                    update_query = f"""
                                        UPDATE {table_name}
                                        SET "{col}" = '{to_val}'
                                        WHERE "{col}" = '{from_val}'
                                    """
                                
                                conn.execute(text(update_query))
                                total_cells_affected += matching_count
            
            # Recalculate statistics after data modification
            if total_cells_affected > 0:
                print(f"🔄 Recalculating statistics after replacing {total_cells_affected} cells")
                self._recalculate_statistics(request.file_id)
            
            response = projects_pb2.ReplaceFileDataResponse()
            response.success = True
            response.rows_affected = total_cells_affected
            return response
            
        except Exception as e:
            response = projects_pb2.ReplaceFileDataResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def search_file_data(self, request: projects_pb2.SearchFileDataRequest) -> projects_pb2.SearchFileDataResponse:
        """Search/filter data in file with pagination"""
        try:
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                response = projects_pb2.SearchFileDataResponse()
                response.success = False
                response.error_message = f"Table {table_name} does not exist"
                return response
            
            with self.engine.connect() as conn:
                # Get total count
                if request.query and request.query.strip():
                    count_query = f"SELECT COUNT(*) FROM {table_name} WHERE {request.query}"
                else:
                    count_query = f"SELECT COUNT(*) FROM {table_name}"
                
                count_result = conn.execute(text(count_query)).fetchone()
                total_rows = int(count_result[0])
                
                # Get data with pagination
                limit = request.limit or 100
                offset = request.offset or 0
                if request.query and request.query.strip():
                    data_query = f"SELECT * FROM {table_name} WHERE {request.query} LIMIT {limit} OFFSET {offset}"
                else:
                    data_query = f"SELECT * FROM {table_name} LIMIT {limit} OFFSET {offset}"
                
                result = conn.execute(text(data_query))
                columns = result.keys()
                
                data_rows = []
                for row in result:
                    row_dict = {col: str(val) if val is not None else "" for col, val in zip(columns, row)}
                    data_rows.append(row_dict)
            
            response = projects_pb2.SearchFileDataResponse()
            response.success = True
            response.file_id = request.file_id
            response.total_rows = total_rows
            response.current_page = (offset // limit) + 1 if limit else 1
            
            for row_dict in data_rows:
                data_row = response.data.add()
                data_row.fields.update(row_dict)
            
            return response
            
        except Exception as e:
            response = projects_pb2.SearchFileDataResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def filter_file_data(self, request: projects_pb2.FilterFileDataRequest) -> projects_pb2.FilterFileDataResponse:
        """Filter file data with option to create new file"""
        try:
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                response = projects_pb2.FilterFileDataResponse()
                response.success = False
                response.error_message = f"Table {table_name} does not exist"
                return response
            
            # Build WHERE clause
            if request.operation.upper() == "LIKE":
                where_clause = f'"{request.column}" LIKE \'%{request.value}%\''
            else:
                # Try to parse as number for numeric comparison, otherwise use string
                try:
                    float(request.value)  # Test if numeric
                    where_clause = f'"{request.column}" {request.operation} {request.value}'  # No quotes for numeric
                except (ValueError, TypeError):
                    where_clause = f'"{request.column}" {request.operation} \'{request.value}\''  # Quotes for string
            
            if request.create_new_file:
                if not request.new_file_name:
                    response = projects_pb2.FilterFileDataResponse()
                    response.success = False
                    response.error_message = "new_file_name required when create_new_file=True"
                    return response
                
                # Get project_id from the original file
                project_id = None
                with Session(self.engine) as session:
                    file_record = session.get(models.File, request.file_id)
                    if file_record:
                        project_id = file_record.project_id
                    else:
                        file_record = session.exec(select(models.File).where(models.File.id == request.file_id)).first()
                        if file_record:
                            project_id = file_record.project_id
                
                if not project_id:
                    response = projects_pb2.FilterFileDataResponse()
                    response.success = False
                    response.error_message = "Could not find project_id for file"
                    return response
                
                # Create new file and table
                new_file_id = db_connection.generate_id()
                new_table_name = f"data_{new_file_id.replace('-', '_')}"
                
                with self.engine.connect() as conn:
                    with conn.begin():
                        # Create filtered table
                        create_query = f"""
                            CREATE TABLE {new_table_name} AS
                            SELECT * FROM {table_name}
                            WHERE {where_clause}
                        """
                        conn.execute(text(create_query))
                        
                        # Get row count
                        count_result = conn.execute(text(f"SELECT COUNT(*) FROM {new_table_name}")).fetchone()
                        total_rows = int(count_result[0])
                
                # Create File metadata record
                file = models.File(
                    id=new_file_id,
                    project_id=project_id,
                    name=request.new_file_name,
                    dataset_type=0,  # UNSPECIFIED
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
                
            else:
                # Filter in place (delete non-matching rows)
                with self.engine.connect() as conn:
                    with conn.begin():
                        delete_query = f"DELETE FROM {table_name} WHERE NOT ({where_clause})"
                        result = conn.execute(text(delete_query))
                        rows_deleted = result.rowcount
                        
                        # Get remaining row count
                        count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                        total_rows = int(count_result[0])
                
                # Recalculate statistics after in-place filtering
                if rows_deleted > 0:
                    print(f"🔄 Recalculating statistics after filtering (deleted {rows_deleted} rows)")
                    self._recalculate_statistics(request.file_id)
                
                response = projects_pb2.FilterFileDataResponse()
                response.success = True
                response.file_id = request.file_id
                response.total_rows = total_rows
                return response
                
        except Exception as e:
            response = projects_pb2.FilterFileDataResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def delete_file_points(self, request: projects_pb2.DeleteFilePointsRequest) -> projects_pb2.DeleteFilePointsResponse:
        """Delete specific points/rows from file"""
        try:
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                response = projects_pb2.DeleteFilePointsResponse()
                response.success = False
                response.error_message = f"Table {table_name} does not exist"
                return response
            
            row_indices = list(request.row_indices)
            
            with self.engine.connect() as conn:
                with conn.begin():
                    if row_indices:
                        # Convert 0-based user indices to 1-based SQL row numbers
                        row_numbers = [str(i + 1) for i in sorted(row_indices)]
                        row_numbers_str = ",".join(row_numbers)
                        
                        # Use CTE with ROW_NUMBER to reliably identify and delete rows
                        delete_query = f"""
                            DELETE FROM {table_name}
                            WHERE rowid IN (
                                SELECT rowid FROM (
                                    SELECT rowid, ROW_NUMBER() OVER () as rn
                                    FROM {table_name}
                                ) numbered_rows
                                WHERE rn IN ({row_numbers_str})
                            )
                        """
                        result = conn.execute(text(delete_query))
                        rows_deleted = result.rowcount
                        
                        # Get remaining count
                        count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                        rows_remaining = int(count_result[0])
                        
                        # Recalculate statistics after row deletion
                        if rows_deleted > 0:
                            print(f"🔄 Recalculating statistics after deleting {rows_deleted} rows")
                            self._recalculate_statistics(request.file_id)
                        
                        response = projects_pb2.DeleteFilePointsResponse()
                        response.success = True
                        response.rows_deleted = rows_deleted
                        response.rows_remaining = rows_remaining
                        return response
                    else:
                        # No rows to delete
                        count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                        rows_remaining = int(count_result[0])
                        response = projects_pb2.DeleteFilePointsResponse()
                        response.success = True
                        response.rows_deleted = 0
                        response.rows_remaining = rows_remaining
                        return response
                        
        except Exception as e:
            response = projects_pb2.DeleteFilePointsResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def add_filtered_column(self, request: projects_pb2.AddFilteredColumnRequest) -> projects_pb2.AddFilteredColumnResponse:
        """Add filtered column (non-destructive)"""
        try:
            print(f"🔍 [BACKEND/DataManipulation] Adding filtered column for file_id: {request.file_id}")
            print(f"🔍 [BACKEND/DataManipulation] New column: {request.new_column_name}")
            print(f"🔍 [BACKEND/DataManipulation] Filter: {request.source_column} {request.operation} {request.value}")
            
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                response = projects_pb2.AddFilteredColumnResponse()
                response.success = False
                response.error_message = f"Table {table_name} does not exist"
                return response
            
            with self.engine.connect() as conn:
                with conn.begin():
                    # Build WHERE clause
                    if request.operation.upper() == "LIKE":
                        where_clause = f'"{request.source_column}" LIKE \'%{request.value}%\''
                    else:
                        # Try to parse as number for numeric comparison, otherwise use string
                        try:
                            float(request.value)  # Test if numeric
                            where_clause = f'"{request.source_column}" {request.operation} {request.value}'  # No quotes for numeric
                        except (ValueError, TypeError):
                            where_clause = f'"{request.source_column}" {request.operation} \'{request.value}\''  # Quotes for string
                    
                    # Add new column with CASE statement
                    alter_query = f"""
                        ALTER TABLE {table_name}
                        ADD COLUMN "{request.new_column_name}" VARCHAR
                    """
                    conn.execute(text(alter_query))
                    print(f"✅ [BACKEND/DataManipulation] Added column '{request.new_column_name}'")
                    
                    # Update with filtered values using CASE
                    update_query = f"""
                        UPDATE {table_name}
                        SET "{request.new_column_name}" = CASE
                            WHEN {where_clause} THEN "{request.source_column}"
                            ELSE NULL
                        END
                    """
                    conn.execute(text(update_query))
                    print(f"✅ [BACKEND/DataManipulation] Updated column with filtered values")
                    
                    # Count how many rows have non-NULL values
                    count_query = f"""
                        SELECT COUNT(*) FROM {table_name}
                        WHERE "{request.new_column_name}" IS NOT NULL
                    """
                    count_result = conn.execute(text(count_query)).fetchone()
                    rows_with_values = int(count_result[0])
            
            # Get total rows to calculate null rows
            with self.engine.connect() as conn:
                count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                total_rows = int(count_result[0])
            
            rows_with_null = total_rows - rows_with_values
            
            # Recalculate statistics to include the new column
            print(f"🔄 [BACKEND/DataManipulation] Recalculating statistics")
            self._recalculate_statistics(request.file_id)
            
            # Update column_mappings for all datasets associated with this file
            print(f"🔄 [BACKEND/DataManipulation] Updating column_mappings for datasets")
            with Session(self.engine) as session:
                datasets = session.exec(select(models.Dataset).where(models.Dataset.file_id == request.file_id)).all()
                
                for dataset in datasets:
                    if dataset.column_mappings:
                        mappings = json.loads(dataset.column_mappings)
                        
                        # Add the new column to mappings as a regular (non-coordinate) column
                        mappings.append({
                            'column_name': request.new_column_name,
                            'column_type': 1,  # NUMERIC (assuming filtered columns are numeric)
                            'mapped_field': request.new_column_name,  # Use column name as mapped field
                            'is_coordinate': False
                        })
                        
                        dataset.column_mappings = json.dumps(mappings)
                        session.add(dataset)
                        print(f"✅ [BACKEND/DataManipulation] Updated column_mappings for dataset {dataset.id}")
                
                session.commit()
            
            print(f"✅ [BACKEND/DataManipulation] Filtered column added: {rows_with_values} matches, {rows_with_null} NULL")
            
            response = projects_pb2.AddFilteredColumnResponse()
            response.success = True
            response.new_column_name = request.new_column_name
            response.rows_with_values = rows_with_values
            response.rows_with_null = rows_with_null
            return response
            
        except Exception as e:
            print(f"❌ [BACKEND/DataManipulation] Exception during add_filtered_column: {str(e)}")
            import traceback
            traceback.print_exc()
            response = projects_pb2.AddFilteredColumnResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def add_file_columns(self, request: projects_pb2.AddFileColumnsRequest) -> projects_pb2.AddFileColumnsResponse:
        """Add new columns to file"""
        try:
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                response = projects_pb2.AddFileColumnsResponse()
                response.success = False
                response.error_message = f"Table {table_name} does not exist"
                return response
            
            # Convert protobuf columns to list of tuples
            new_columns = [(col.column_name, list(col.values)) for col in request.new_columns]
            
            added_columns = []
            
            with self.engine.connect() as conn:
                with conn.begin():
                    # Get current row count
                    count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                    row_count = int(count_result[0])
                    
                    for col_name, values in new_columns:
                        # Validate value count matches row count
                        if len(values) != row_count:
                            response = projects_pb2.AddFileColumnsResponse()
                            response.success = False
                            response.error_message = f"Column '{col_name}' has {len(values)} values but table has {row_count} rows"
                            return response
                        
                        # Add column with default NULL
                        conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN "{col_name}" VARCHAR'))
                        
                        # Update values using row_number
                        temp_values = ",".join([f"({i+1}, '{val}')" for i, val in enumerate(values)])
                        
                        # DuckDB approach: use UPDATE with row_number
                        update_query = f"""
                            UPDATE {table_name}
                            SET "{col_name}" = temp.value
                            FROM (
                                SELECT row_number() OVER () as rn, * FROM (
                                    VALUES {temp_values}
                                ) AS t(rn_val, value)
                            ) AS temp
                            WHERE {table_name}.rowid = temp.rn_val
                        """
                        conn.execute(text(update_query))
                        
                        added_columns.append(col_name)
            
            # Recalculate statistics after adding columns
            if len(added_columns) > 0:
                print(f"🔄 Recalculating statistics after adding {len(added_columns)} columns")
                self._recalculate_statistics(request.file_id)
            
            response = projects_pb2.AddFileColumnsResponse()
            response.success = True
            response.added_columns.extend(added_columns)
            return response
            
        except Exception as e:
            response = projects_pb2.AddFileColumnsResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def duplicate_file_columns(self, request: projects_pb2.DuplicateFileColumnsRequest) -> projects_pb2.DuplicateFileColumnsResponse:
        """Duplicate existing columns with optional custom naming"""
        try:
            print(f"🔄 [BACKEND/DataManipulation] Duplicating columns for file_id: {request.file_id}")
            print(f"🔄 [BACKEND/DataManipulation] Number of columns to duplicate: {len(request.columns)}")
            
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                response = projects_pb2.DuplicateFileColumnsResponse()
                response.success = False
                response.error_message = f"Table {table_name} does not exist"
                return response
            
            # Convert protobuf columns to list of tuples (source_column, new_column_name)
            columns_to_duplicate = [(col.source_column, col.new_column_name) for col in request.columns]
            
            print(f"🔄 [BACKEND/DataManipulation] Columns to duplicate: {columns_to_duplicate}")
            
            duplicated_columns = []
            
            with self.engine.connect() as conn:
                with conn.begin():
                    # Get existing columns
                    result = conn.execute(text(f"DESCRIBE {table_name}"))
                    existing_columns = {row[0] for row in result}
                    
                    for source_col, new_col_name in columns_to_duplicate:
                        if source_col not in existing_columns:
                            continue  # Skip if column doesn't exist
                        
                        # If no custom name provided, auto-generate
                        if not new_col_name or new_col_name.strip() == "":
                            new_col_name = f"{source_col}_copy"
                            counter = 1
                            while new_col_name in existing_columns:
                                new_col_name = f"{source_col}_copy{counter}"
                                counter += 1
                        
                        # Check if new name already exists
                        if new_col_name in existing_columns:
                            continue
                        
                        # Add new column and copy values
                        conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN "{new_col_name}" VARCHAR'))
                        conn.execute(text(f'UPDATE {table_name} SET "{new_col_name}" = "{source_col}"'))
                        
                        duplicated_columns.append(new_col_name)
                        existing_columns.add(new_col_name)
            
            # Recalculate statistics after adding columns
            if len(duplicated_columns) > 0:
                self._recalculate_statistics(request.file_id)
                
                # Update column_mappings for all datasets associated with this file
                with Session(self.engine) as session:
                    datasets = session.exec(select(models.Dataset).where(models.Dataset.file_id == request.file_id)).all()
                    
                    for dataset in datasets:
                        if dataset.column_mappings:
                            mappings = json.loads(dataset.column_mappings)
                            
                            # Add each duplicated column to mappings as a regular (non-coordinate) column
                            for new_col_name in duplicated_columns:
                                mappings.append({
                                    'column_name': new_col_name,
                                    'column_type': 1,  # NUMERIC
                                    'mapped_field': new_col_name,  # Use column name as mapped field
                                    'is_coordinate': False
                                })
                            
                            dataset.column_mappings = json.dumps(mappings)
                            session.add(dataset)
                    
                    session.commit()
            
            print(f"✅ [BACKEND/DataManipulation] Successfully duplicated {len(duplicated_columns)} columns")
            
            response = projects_pb2.DuplicateFileColumnsResponse()
            response.success = True
            response.duplicated_columns.extend(duplicated_columns)
            return response
            
        except Exception as e:
            print(f"❌ [BACKEND/DataManipulation] Exception during duplication: {str(e)}")
            import traceback
            traceback.print_exc()
            response = projects_pb2.DuplicateFileColumnsResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def delete_file_columns(self, request: projects_pb2.DeleteFileColumnsRequest) -> projects_pb2.DeleteFileColumnsResponse:
        """Delete columns from a file"""
        try:
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                response = projects_pb2.DeleteFileColumnsResponse()
                response.success = False
                response.error_message = f"Table {table_name} does not exist"
                return response
            
            deleted_columns = []
            
            with self.engine.connect() as conn:
                with conn.begin():
                    # Get existing columns
                    result = conn.execute(text(f"DESCRIBE {table_name}"))
                    existing_columns = {row[0] for row in result}
                    
                    for col_name in request.column_names:
                        if col_name not in existing_columns:
                            continue  # Skip if column doesn't exist
                        
                        # Drop the column
                        conn.execute(text(f'ALTER TABLE {table_name} DROP COLUMN "{col_name}"'))
                        deleted_columns.append(col_name)
            
            # Recalculate statistics after deleting columns
            if len(deleted_columns) > 0:
                self._recalculate_statistics(request.file_id)
                
                # Update column_mappings for all datasets associated with this file
                with Session(self.engine) as session:
                    datasets = session.exec(select(models.Dataset).where(models.Dataset.file_id == request.file_id)).all()
                    
                    for dataset in datasets:
                        if dataset.column_mappings:
                            mappings = json.loads(dataset.column_mappings)
                            
                            # Remove deleted columns from mappings
                            updated_mappings = [m for m in mappings if m['column_name'] not in deleted_columns]
                            
                            dataset.column_mappings = json.dumps(updated_mappings)
                            session.add(dataset)
                    
                    session.commit()
            
            response = projects_pb2.DeleteFileColumnsResponse()
            response.success = True
            response.deleted_columns.extend(deleted_columns)
            return response
            
        except Exception as e:
            response = projects_pb2.DeleteFileColumnsResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def merge_datasets(self, request: projects_pb2.MergeDatasetsRequest) -> projects_pb2.MergeDatasetsResponse:
        """Merge two datasets by rows or columns"""
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
            
            # Get datasets
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
                
                # Create new table for merged data
                merged_dataset_id = db_connection.generate_id()
                merged_table_name = f"data_{merged_dataset_id.replace('-', '_')}"
                
                with self.engine.connect() as conn:
                    with conn.begin():
                        if mode == "BY_ROWS":
                            # UNION ALL - append rows
                            # Get columns from both tables
                            cols1 = set(row[0] for row in conn.execute(text(f"DESCRIBE {table1}")))
                            cols2 = set(row[0] for row in conn.execute(text(f"DESCRIBE {table2}")))
                            
                            # Check if column sets match
                            if cols1 != cols2:
                                warnings.append("Column sets don't match exactly. Using intersection.")
                                common_cols = cols1.intersection(cols2)
                                col_list = ",".join([f'"{col}"' for col in common_cols])
                            else:
                                col_list = "*"
                            
                            # Create merged table
                            create_query = f"""
                                CREATE TABLE {merged_table_name} AS
                                SELECT {col_list} FROM {table1}
                                UNION ALL
                                SELECT {col_list} FROM {table2}
                            """
                            conn.execute(text(create_query))
                            
                            # Get counts
                            count_result = conn.execute(text(f"SELECT COUNT(*) FROM {merged_table_name}")).fetchone()
                            rows_merged = int(count_result[0])
                            
                            col_result = conn.execute(text(f"DESCRIBE {merged_table_name}"))
                            columns_merged = len(list(col_result))
                            
                        elif mode == "BY_COLUMNS":
                            # JOIN - add columns from second dataset
                            exclude_first_set = set(exclude_first or [])
                            exclude_second_set = set(exclude_second or [])
                            
                            # Get columns
                            cols1_all = [row[0] for row in conn.execute(text(f"DESCRIBE {table1}"))]
                            cols2_all = [row[0] for row in conn.execute(text(f"DESCRIBE {table2}"))]
                            
                            # Filter columns
                            cols1 = [c for c in cols1_all if c not in exclude_first_set]
                            cols2 = [c for c in cols2_all if c not in exclude_second_set]
                            
                            # Build SELECT list
                            select_parts = []
                            select_parts.extend([f't1."{col}"' for col in cols1])
                            
                            # Avoid duplicate column names
                            for col in cols2:
                                if col in cols1:
                                    warnings.append(f"Column '{col}' exists in both datasets. Renaming second to '{col}_2'")
                                    select_parts.append(f't2."{col}" AS "{col}_2"')
                                else:
                                    select_parts.append(f't2."{col}"')
                            
                            select_clause = ", ".join(select_parts)
                            
                            # Create merged table with row-by-row alignment
                            create_query = f"""
                                CREATE TABLE {merged_table_name} AS
                                SELECT {select_clause}
                                FROM (
                                    SELECT *, row_number() OVER () as rn FROM {table1}
                                ) t1
                                JOIN (
                                    SELECT *, row_number() OVER () as rn FROM {table2}
                                ) t2 ON t1.rn = t2.rn
                            """
                            conn.execute(text(create_query))
                            
                            # Get counts
                            count_result = conn.execute(text(f"SELECT COUNT(*) FROM {merged_table_name}")).fetchone()
                            rows_merged = int(count_result[0])
                            
                            col_result = conn.execute(text(f"DESCRIBE {merged_table_name}"))
                            columns_merged = len(list(col_result))
                            
                        else:
                            response = projects_pb2.MergeDatasetsResponse()
                            response.success = False
                            response.error_message = f"Invalid merge mode: {mode}"
                            return response
                
                # Get file info for creating metadata
                file1 = session.get(models.File, dataset1.file_id)
                file2 = session.get(models.File, dataset2.file_id)
                
                # Create new File record
                if file1 and file2:
                    merged_file_id = db_connection.generate_id()
                    merged_file_name = output_file or f"merged_{mode.lower()}"
                    
                    merged_file = models.File(
                        id=merged_file_id,
                        project_id=file1.project_id,  # Use first file's project
                        name=merged_file_name,
                        dataset_type=file1.dataset_type,
                        original_filename=f"{merged_file_name}.csv",
                        file_size=0,
                        created_at=db_connection.get_timestamp(),
                    )
                    
                    session.add(merged_file)
                    session.commit()
                    
                    # Create Dataset record
                    merged_dataset = models.Dataset(
                        id=merged_dataset_id,
                        file_id=merged_file_id,
                        duckdb_table_name=merged_table_name,
                        total_rows=rows_merged,
                        column_mappings=json.dumps([]),  # No column mappings for merged data
                        created_at=db_connection.get_timestamp(),
                    )
                    
                    session.add(merged_dataset)
                    session.commit()
                    session.refresh(merged_dataset)
                    
                    response = projects_pb2.MergeDatasetsResponse()
                    response.success = True
                    response.dataset_id = merged_dataset.id
                    response.rows_merged = rows_merged
                    response.columns_merged = columns_merged
                    response.warnings.extend(warnings)
                    return response
                else:
                    response = projects_pb2.MergeDatasetsResponse()
                    response.success = False
                    response.error_message = "Failed to get file metadata"
                    response.warnings.extend(warnings)
                    return response
                    
        except Exception as e:
            import traceback
            traceback.print_exc()
            response = projects_pb2.MergeDatasetsResponse()
            response.success = False
            response.error_message = str(e)
            return response

