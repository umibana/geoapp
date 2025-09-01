# Manejo de base de datos
# SQLite con SQLModel como ORM
import uuid
import time
import json
import math
import numpy as np
from typing import List, Dict, Any, Optional, Tuple

from sqlmodel import SQLModel, Field, Relationship, Session, select, create_engine, func
from sqlalchemy import text


# Definicion de modelos de la base de datos

class Project(SQLModel, table=True):
    id: str = Field(primary_key=True)
    name: str
    description: Optional[str] = None
    created_at: int
    updated_at: int
    files: List["File"] = Relationship(back_populates="project", sa_relationship_kwargs={"cascade": "all, delete-orphan"})


class File(SQLModel, table=True):
    id: str = Field(primary_key=True)
    project_id: str = Field(foreign_key="project.id")
    name: str
    dataset_type: int
    original_filename: str
    file_size: int
    created_at: int
    project: Optional[Project] = Relationship(back_populates="files")
    datasets: List["Dataset"] = Relationship(back_populates="file", sa_relationship_kwargs={"cascade": "all, delete-orphan"})


class Dataset(SQLModel, table=True):
    id: str = Field(primary_key=True)
    file_id: str = Field(foreign_key="file.id")
    duckdb_table_name: str  # Name of the DuckDB table containing the actual data
    total_rows: int
    column_mappings: Optional[str] = None  # JSON string for column mappings
    created_at: int
    file: Optional[File] = Relationship(back_populates="datasets")


class DatasetColumnStats(SQLModel, table=True):
    id: str = Field(primary_key=True)
    dataset_id: str = Field(foreign_key="dataset.id")
    column_name: str
    column_type: str  # "numeric" or "categorical"
    count: Optional[float] = None
    mean: Optional[float] = None
    std: Optional[float] = None
    min_value: Optional[float] = None
    q25: Optional[float] = None  # 25th percentile
    q50: Optional[float] = None  # 50th percentile (median)  
    q75: Optional[float] = None  # 75th percentile
    max_value: Optional[float] = None
    null_count: Optional[int] = None
    unique_count: Optional[int] = None
    created_at: int


class DatabaseManager:
    def __init__(self, db_path: str = "geospatial.db"):
        self.db_path = db_path
        self.db_url = f"duckdb:///{self.db_path}"
        self.engine = create_engine(self.db_url)
        
        # Create SQLModel tables
        SQLModel.metadata.create_all(self.engine)

    def generate_id(self) -> str:
        return str(uuid.uuid4())

    def get_timestamp(self) -> int:
        return int(time.time())
    
    def import_csv_to_duckdb(self, file_content: bytes, table_name: str) -> Tuple[int, List[str]]:
        """
        Import CSV content directly into DuckDB table
        
        Args:
            file_content: Raw CSV bytes
            table_name: Name for the DuckDB table
            
        Returns:
            Tuple of (row_count, column_names)
        """
        try:
            # Write CSV content to temporary file for DuckDB to read
            import tempfile
            import os
            
            with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as temp_file:
                temp_file.write(file_content)
                temp_csv_path = temp_file.name
            
            try:
                # Use SQLAlchemy connection with explicit transaction
                with self.engine.connect() as conn:
                    with conn.begin():  # Explicit transaction
                        # Use DuckDB's CSV auto-detection
                        conn.execute(text(f"""
                            CREATE OR REPLACE TABLE {table_name} AS 
                            SELECT * FROM read_csv_auto('{temp_csv_path}')
                        """))
                        
                        # Get row count and column names
                        row_count = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()[0]
                        columns_result = conn.execute(text(f"SELECT * FROM {table_name} LIMIT 0"))
                        columns = [desc[0] for desc in columns_result.cursor.description]
                
                print(f"✅ Imported CSV to DuckDB table '{table_name}': {row_count:,} rows, {len(columns)} columns")
                return row_count, columns
                
            finally:
                # Clean up temp file
                os.unlink(temp_csv_path)
                
        except Exception as e:
            print(f"❌ Error importing CSV to DuckDB: {e}")
            raise e
    
    def analyze_csv_and_store(self, file_content: bytes, sample_size: int = 10000) -> Tuple[Dict[str, Any], List[str], List[str]]:
        """
        Analyze CSV content with pandas describe() for immediate statistics
        
        Args:
            file_content: Raw CSV bytes
            sample_size: Sample size for large datasets (default 10K rows)
            
        Returns:
            Tuple of (statistics_dict, numeric_columns, categorical_columns)
        """
        try:
            import pandas as pd
            import io
            
            # Read CSV into pandas
            df = pd.read_csv(io.BytesIO(file_content))
            total_rows = len(df)
            
            print(f"📊 Analyzing CSV: {total_rows:,} rows × {len(df.columns)} columns")
            
            # Use sample for large datasets
            if sample_size < total_rows and sample_size > 0:
                df_sample = df.sample(n=min(sample_size, total_rows), random_state=42)
                print(f"📊 Using sample of {len(df_sample):,} rows for analysis")
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
            
            print(f"✅ CSV analysis complete: {len(column_statistics)} columns analyzed")
            return column_statistics, numeric_columns, categorical_columns
            
        except Exception as e:
            print(f"❌ Error analyzing CSV: {e}")
            raise e
    
    def get_duckdb_table_statistics(self, table_name: str) -> Dict[str, Any]:
        """
        Get comprehensive statistics directly from DuckDB table using SQL
        
        Args:
            table_name: Name of the DuckDB table
            
        Returns:
            Dictionary of column statistics
        """
        try:
            column_statistics = {}
            
            with self.engine.connect() as conn:
                # Get table schema first
                schema_result = conn.execute(text(f"DESCRIBE {table_name}"))
                columns_info = [(row[0], row[1]) for row in schema_result]
                
                for column_name, column_type in columns_info:
                    # Determine if column is numeric
                    is_numeric = any(t in column_type.upper() for t in ['INT', 'FLOAT', 'DOUBLE', 'DECIMAL', 'NUMERIC', 'BIGINT'])
                    
                    if is_numeric:
                        # Get comprehensive numeric statistics using DuckDB SQL
                        stats_query = text(f"""
                        SELECT 
                            COUNT({column_name}) as count,
                            AVG({column_name}) as mean,
                            STDDEV({column_name}) as std,
                            MIN({column_name}) as min,
                            PERCENTILE_CONT(0.25) WITHIN GROUP (ORDER BY {column_name}) as q25,
                            PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY {column_name}) as q50,
                            PERCENTILE_CONT(0.75) WITHIN GROUP (ORDER BY {column_name}) as q75,
                            MAX({column_name}) as max,
                            COUNT(*) - COUNT({column_name}) as null_count,
                            COUNT(DISTINCT {column_name}) as unique_count
                        FROM {table_name}
                        """)
                        
                        result = conn.execute(stats_query).fetchone()
                        
                        column_statistics[column_name] = {
                            'column_type': 'numeric',
                            'count': float(result[0]) if result[0] else 0,
                            'mean': float(result[1]) if result[1] else None,
                            'std': float(result[2]) if result[2] else None,
                            'min': float(result[3]) if result[3] else None,
                            '25%': float(result[4]) if result[4] else None,
                            '50%': float(result[5]) if result[5] else None,
                            '75%': float(result[6]) if result[6] else None,
                            'max': float(result[7]) if result[7] else None,
                            'null_count': int(result[8]) if result[8] else 0,
                            'unique_count': int(result[9]) if result[9] else 0
                        }
                    else:
                        # Get basic categorical statistics
                        stats_query = text(f"""
                        SELECT 
                            COUNT({column_name}) as count,
                            COUNT(*) - COUNT({column_name}) as null_count,
                            COUNT(DISTINCT {column_name}) as unique_count
                        FROM {table_name}
                        """)
                        
                        result = conn.execute(stats_query).fetchone()
                        
                        column_statistics[column_name] = {
                            'column_type': 'categorical',
                            'count': float(result[0]) if result[0] else 0,
                            'null_count': int(result[1]) if result[1] else 0,
                            'unique_count': int(result[2]) if result[2] else 0
                        }
            
            print(f"✅ Generated DuckDB statistics for {len(column_statistics)} columns")
            return column_statistics
            
        except Exception as e:
            print(f"❌ Error getting DuckDB table statistics: {e}")
            return {}

    # ---------- Manejo de proyectos ----------
    # Manejamos el CRUD para crear un proyecto



    def create_project(self, name: str, description: str = "") -> Project:
        project = Project(
            id=self.generate_id(),
            name=name,
            description=description,
            created_at=self.get_timestamp(),
            updated_at=self.get_timestamp(),
        )
        with Session(self.engine) as session:
            session.add(project)
            session.commit()
            # Refresh to get the committed object with relationships loaded
            session.refresh(project)
        return project


    def get_projects(self, limit: int = 100, offset: int = 0) -> Tuple[List[Project], int]:
        with Session(self.engine) as session:
            project_count = session.exec(select(func.count(Project.id))).one()
            projects = session.exec(
                select(Project).order_by(Project.updated_at.desc()).limit(limit).offset(offset)
            ).all()
        return list(projects), int(project_count)

    def get_project(self, project_id: str) -> Optional[Project]:
        with Session(self.engine) as session:
            project = session.get(Project, project_id)
            if project:
                # Refresh to ensure all relationships are loaded
                session.refresh(project)
            return project

    def update_project(self, project_id: str, name: str, description: str) -> Optional[Project]:
        with Session(self.engine) as session:
            project = session.get(Project, project_id)
            if not project:
                return None
            project.name = name
            project.description = description
            project.updated_at = self.get_timestamp()
            session.add(project)
            session.commit()
            session.refresh(project)
            return project

    def delete_project(self, project_id: str) -> bool:
        with Session(self.engine) as session:
            project = session.get(Project, project_id)
            if not project:
                return False
            session.delete(project)
            session.commit()
            return True

    # ========== Manejo de archivos ==========

    def create_file_with_csv(self, project_id: str, name: str, dataset_type: int,
                    original_filename: str, file_content: bytes) -> Tuple[File, str, Dict[str, Any]]:
        """
        Create file metadata and import CSV directly to DuckDB
        
        Returns:
            Tuple of (File object, duckdb_table_name, statistics dictionary)
        """
        # Generate file ID first
        file_id = self.generate_id()
        table_name = f"data_{file_id.replace('-', '_')}"
        
        # 1. Import CSV to DuckDB first (this is the source of truth)
        try:
            print(f"🔄 Starting DuckDB import for table '{table_name}'")
            row_count, columns = self.import_csv_to_duckdb(file_content, table_name)
            print(f"📊 Successfully imported to DuckDB table '{table_name}': {row_count:,} rows, {len(columns)} columns")
            
            # Verify table was created
            if self.check_duckdb_table_exists(table_name):
                print(f"✅ Verified: DuckDB table '{table_name}' exists and is accessible")
            else:
                print(f"❌ ERROR: DuckDB table '{table_name}' was not created properly")
                
        except Exception as e:
            print(f"❌ DuckDB import failed for table '{table_name}': {e}")
            raise e
        
        # 2. Create File metadata record (no file_content stored)
        file = File(
            id=file_id,
            project_id=project_id,
            name=name,
            dataset_type=dataset_type,
            original_filename=original_filename,
            file_size=len(file_content),
            created_at=self.get_timestamp(),
        )
        
        with Session(self.engine) as session:
            session.add(file)
            session.commit()
            session.refresh(file)
        
        # 3. Generate statistics from DuckDB table
        try:
            column_statistics = self.get_duckdb_table_statistics(table_name)
            print(f"📈 Generated statistics for {len(column_statistics)} columns from DuckDB")
        except Exception as e:
            print(f"⚠️  Statistics generation failed: {e}")
            column_statistics = {}
        
        return file, table_name, column_statistics

    def get_project_files(self, project_id: str) -> List[File]:
        with Session(self.engine) as session:
            files = session.exec(
                select(File).where(File.project_id == project_id).order_by(File.created_at.desc())
            ).all()
            return list(files)

    def check_duckdb_table_exists(self, table_name: str) -> bool:
        """Check if a DuckDB table exists"""
        try:
            with self.engine.connect() as conn:
                conn.execute(text(f"SELECT 1 FROM {table_name} LIMIT 1"))
                print(f"🔍 Table '{table_name}' exists and is accessible")
                return True
        except Exception as e:
            print(f"🔍 Table '{table_name}' check failed: {e}")
            return False
    

    def get_datasets_by_project(self, project_id: str) -> List[Tuple[Dataset, File]]:
        with Session(self.engine) as session:
            # Join datasets with files by project
            datasets = session.exec(
                select(Dataset, File)
                .join(File, Dataset.file_id == File.id)
                .where(File.project_id == project_id)
                .order_by(Dataset.created_at.desc())
            ).all()
            return list(datasets)

    def delete_file(self, file_id: str) -> bool:
        with Session(self.engine) as session:
            f = session.get(File, file_id)
            if not f:
                print(f"❌ File {file_id} not found")
                return False
            
            print(f"🗑️  Starting deletion process for file: {file_id}")
            
            # First, manually delete all datasets and their statistics that reference this file
            datasets = session.exec(select(Dataset).where(Dataset.file_id == file_id)).all()
            print(f"🗑️  Found {len(datasets)} datasets to delete")
            
            for dataset in datasets:
                print(f"🗑️  Deleting dataset: {dataset.id}")
                
                # Delete dataset column statistics first
                stats = session.exec(select(DatasetColumnStats).where(DatasetColumnStats.dataset_id == dataset.id)).all()
                for stat in stats:
                    session.delete(stat)
                print(f"🗑️  Deleted {len(stats)} column statistics for dataset {dataset.id}")
                
                # Delete the dataset
                session.delete(dataset)
                print(f"🗑️  Deleted dataset: {dataset.id}")
            
            # Commit the dataset deletions first
            session.commit()
            print(f"✅ Committed deletion of {len(datasets)} datasets and their statistics")
            
            # Also delete associated DuckDB table
            table_name = f"data_{file_id.replace('-', '_')}"
            try:
                with self.engine.connect() as conn:
                    conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
                print(f"🗑️  Dropped DuckDB table: {table_name}")
            except Exception as e:
                print(f"⚠️  Could not drop DuckDB table {table_name}: {e}")
            
            # Now delete the file
            print(f"🗑️  Now deleting file: {file_id}")
            session.delete(f)
            session.commit()
            print(f"✅ File {file_id} deleted successfully")
            return True

    # ========== Manejo de datasets ==========

    def create_dataset(self, file_id: str, duckdb_table_name: str, total_rows: int, column_mappings: List[Dict[str, Any]]) -> Dataset:
        dataset = Dataset(
            id=self.generate_id(),
            file_id=file_id,
            duckdb_table_name=duckdb_table_name,
            total_rows=total_rows,
            column_mappings=json.dumps(column_mappings),
            created_at=self.get_timestamp(),
        )
        with Session(self.engine) as session:
            session.add(dataset)
            session.commit()
            session.refresh(dataset)
        return dataset

    def get_dataset_by_file(self, file_id: str) -> Optional[Dataset]:
        with Session(self.engine) as session:
            dataset = session.exec(select(Dataset).where(Dataset.file_id == file_id)).first()
            if dataset:
                session.refresh(dataset)
            return dataset

    def get_dataset_by_id(self, dataset_id: str) -> Optional[Dataset]:
        with Session(self.engine) as session:
            dataset = session.get(Dataset, dataset_id)
            if dataset:
                session.refresh(dataset)
            return dataset

    def get_dataset_data_from_duckdb(self, dataset_id: str, page: int = 1, page_size: int = 100) -> Tuple[List[Dict[str, Any]], int, int]:
        """
        Get dataset data directly from DuckDB table with pagination
        
        Args:
            dataset_id: Dataset ID to get data for
            page: Page number (1-based)
            page_size: Number of rows per page
            
        Returns:
            Tuple of (rows, total_rows, total_pages)
        """
        try:
            # Get dataset to find DuckDB table name
            dataset = self.get_dataset_by_id(dataset_id)
            if not dataset:
                return [], 0, 0
            
            table_name = dataset.duckdb_table_name
            offset = (page - 1) * page_size
            
            with self.engine.connect() as conn:
                # Get total row count
                count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                total_rows = int(count_result[0])
                
                # Get paginated data
                data_query = text(f"SELECT * FROM {table_name} LIMIT {page_size} OFFSET {offset}")
                result = conn.execute(data_query)
                
                # Convert to list of dictionaries with type conversion
                columns = [desc[0] for desc in result.cursor.description]
                rows = []
                for row in result:
                    row_dict = {}
                    for i, value in enumerate(row):
                        # Convert DuckDB types to Python native types for protobuf compatibility
                        if value is None:
                            row_dict[columns[i]] = ""
                        elif isinstance(value, (int, float)):
                            row_dict[columns[i]] = float(value) if isinstance(value, float) else int(value)
                        else:
                            # Convert everything else to string
                            row_dict[columns[i]] = str(value)
                    rows.append(row_dict)
                
                total_pages = (total_rows + page_size - 1) // page_size
                
                print(f"📊 Retrieved {len(rows)} rows from DuckDB table '{table_name}' (page {page}/{total_pages})")
                return rows, total_rows, total_pages
                
        except Exception as e:
            print(f"❌ Error getting dataset data from DuckDB: {e}")
            return [], 0, 0
    
    def get_dataset_boundaries(self, dataset_id: str) -> Dict[str, Dict[str, float]]:
        """
        Calculate min/max boundaries for numeric columns in a dataset for chart scaling.
        Returns a dictionary with column names as keys and boundary info as values.
        
        Args:
            dataset_id: The dataset ID to calculate boundaries for
            
        Returns:
            Dict with structure: {
                "column_name": {
                    "min_value": float,
                    "max_value": float, 
                    "valid_count": int
                }
            }
        """
        try:
            boundaries = {}
            
            with Session(self.engine) as session:
                # Get all data rows for this dataset
                rows = session.exec(
                    select(DatasetData.data)
                    .where(DatasetData.dataset_id == dataset_id)
                ).all()
                
                if not rows:
                    return boundaries
                
                # Parse all JSON data
                all_data = [json.loads(row_data) for row_data in rows]
                
                # Collect all column names that appear in the data
                all_columns = set()
                for row in all_data:
                    all_columns.update(row.keys())
                
                # Calculate boundaries for each column
                for column_name in all_columns:
                    numeric_values = []
                    
                    # Extract numeric values from this column
                    for row in all_data:
                        if column_name in row:
                            value = row[column_name]
                            try:
                                # Try to convert to float
                                if value is not None and str(value).strip() != '':
                                    numeric_value = float(value)
                                    # Check if it's a valid number (not NaN or infinite)
                                    if not (math.isnan(numeric_value) or math.isinf(numeric_value)):
                                        numeric_values.append(numeric_value)
                            except (ValueError, TypeError):
                                # Skip non-numeric values
                                continue
                    
                    # Only create boundaries for columns with numeric data
                    if numeric_values:
                        boundaries[column_name] = {
                            'min_value': float(min(numeric_values)),
                            'max_value': float(max(numeric_values)),
                            'valid_count': len(numeric_values)
                        }
                
                print(f"📐 Calculated boundaries for {len(boundaries)} numeric columns")
                return boundaries
                
        except Exception as e:
            print(f"❌ Error calculating dataset boundaries: {e}")
            return {}
    
    def store_column_statistics(self, dataset_id: str, column_stats: Dict[str, Dict[str, Any]]):
        """
        Store pandas describe() statistics for dataset columns in the database
        
        Args:
            dataset_id: The dataset ID to store statistics for
            column_stats: Dict with structure {column_name: {stat_name: value}}
        """
        try:
            with Session(self.engine) as session:
                # Delete existing stats for this dataset using SQLModel query
                existing_stats = session.exec(
                    select(DatasetColumnStats).where(DatasetColumnStats.dataset_id == dataset_id)
                ).all()
                
                for stat in existing_stats:
                    session.delete(stat)
                
                # Store new statistics
                for column_name, stats in column_stats.items():
                    # Skip columns with no valid data or None values for min/max
                    if stats.get('column_type') == 'numeric':
                        min_val = stats.get('min')
                        max_val = stats.get('max')
                        if min_val is None or max_val is None:
                            print(f"⚠️  Skipping statistics for '{column_name}' - no valid min/max values")
                            continue
                    
                    stat_record = DatasetColumnStats(
                        id=self.generate_id(),
                        dataset_id=dataset_id,
                        column_name=column_name,
                        column_type=stats.get('column_type', 'numeric'),
                        count=stats.get('count'),
                        mean=stats.get('mean'),
                        std=stats.get('std'),
                        min_value=stats.get('min'),
                        q25=stats.get('25%'),
                        q50=stats.get('50%'),  # median
                        q75=stats.get('75%'),
                        max_value=stats.get('max'),
                        null_count=stats.get('null_count'),
                        unique_count=stats.get('unique_count'),
                        created_at=self.get_timestamp()
                    )
                    session.add(stat_record)
                
                session.commit()
                print(f"✅ Stored statistics for {len(column_stats)} columns")
                
        except Exception as e:
            print(f"❌ Error storing column statistics: {e}")
    
    def get_dataset_boundaries(self, dataset_id: str) -> Dict[str, Dict[str, float]]:
        """
        Get dataset boundaries from stored pandas describe() statistics.

        Args:
            dataset_id: The dataset ID to get boundaries for
            
        Returns:
            Dict with structure: {
                "column_name": {
                    "min_value": float,
                    "max_value": float, 
                    "valid_count": int
                }
            }
        """
        try:
            boundaries = {}
            
            with Session(self.engine) as session:
                # Get stored statistics for numeric columns
                stats = session.exec(
                    select(DatasetColumnStats)
                    .where(DatasetColumnStats.dataset_id == dataset_id)
                    .where(DatasetColumnStats.column_type == "numeric")
                    .where(DatasetColumnStats.min_value.is_not(None))
                    .where(DatasetColumnStats.max_value.is_not(None))
                ).all()
                
                for stat in stats:
                    boundaries[stat.column_name] = {
                        'min_value': float(stat.min_value),
                        'max_value': float(stat.max_value),
                        'valid_count': int(stat.count) if stat.count else 0
                    }
                
                print(f"📐 Retrieved boundaries for {len(boundaries)} columns from stored statistics")
                return boundaries
                
        except Exception as e:
            print(f"❌ Error getting dataset boundaries from stored stats: {e}")
            # Fallback to the old calculation method if stored stats are not available
            return self._calculate_boundaries_fallback(dataset_id)
    