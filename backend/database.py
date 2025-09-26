# Manejo de base de datos
# SQLite con SQLModel como ORM
import uuid
import time
import json
import math
import numpy as np
import duckdb
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
        
# Nota: uso la conexión de SQLAlchemy pero accedo a raw DuckDB para performance
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
    
    def import_csv_to_duckdb(self, file_content: bytes, table_name: str) -> bool:
        """
        Import CSV content directly into DuckDB table
        
        Args:
            file_content: Raw CSV bytes
            table_name: Name for the DuckDB table
            
        Returns:
            Tuple of (row_count, column_names)
        """
        try:
            # escribo el contenido del CSV en un archivo temporal para que DuckDB lo lea
            import tempfile
            import os
            
            with tempfile.NamedTemporaryFile(mode='wb', suffix='.csv', delete=False) as temp_file:
                temp_file.write(file_content)
                temp_csv_path = temp_file.name
            
            try:
                # uso la conexión de SQLAlchemy para usar duckdb
                with self.engine.connect() as conn:
                    with conn.begin():  #
                        conn.execute(text(f"""
                            CREATE OR REPLACE TABLE {table_name} AS 
                            SELECT * FROM read_csv_auto('{temp_csv_path}')
                        """))
                return True
                
            finally:
                # elimino el archivo temporal
                os.unlink(temp_csv_path)
                
        except Exception as e:
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
            self.import_csv_to_duckdb(file_content, table_name)
            
            # Verify table was created
            if not self.check_duckdb_table_exists(table_name):
                raise Exception(f"DuckDB table '{table_name}' was not created properly")
                
        except Exception as e:
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
        
        # 3. Generate statistics using pandas describe() on the original CSV
        try:
            column_statistics, numeric_columns, categorical_columns = self.analyze_csv_and_store(file_content)
        except Exception as e:
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
                return True
        except Exception as e:
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
                return False
            
            # First, manually delete all datasets and their statistics that reference this file
            datasets = session.exec(select(Dataset).where(Dataset.file_id == file_id)).all()
            
            for dataset in datasets:
                # Delete dataset column statistics first
                stats = session.exec(select(DatasetColumnStats).where(DatasetColumnStats.dataset_id == dataset.id)).all()
                for stat in stats:
                    session.delete(stat)
                
                # Delete the dataset
                session.delete(dataset)
            
            # Commit the dataset deletions first
            session.commit()
            
            # Also delete associated DuckDB table
            table_name = f"data_{file_id.replace('-', '_')}"
            try:
                with self.engine.connect() as conn:
                    conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
            except Exception:
                pass  # Ignore errors when dropping table
            
            # Now delete the file
            session.delete(f)
            session.commit()
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


    def get_dataset_data_and_stats_combined(self, dataset_id: str, columns: List[str]) -> Tuple[np.ndarray, Dict[str, Dict[str, float]]]:

        try:
            dataset = self.get_dataset_by_id(dataset_id)
            if not dataset:
                return np.array([], dtype=np.float32), {}

            table_name = dataset.duckdb_table_name
            
            # consigo las columnas que necesito
            data_query = f"SELECT {columns[0]}, {columns[1]}, {columns[2]} FROM {table_name}"

            # obtengo los datos usando DuckDB's fetchnumpy para optimizar el rendimiento
            with self.engine.connect() as conn:
                duckdb_conn = conn.connection.connection
                rows_data = duckdb_conn.execute(data_query).fetchnumpy()

            # si no hay datos, devuelvo un array vacío
            if not rows_data or len(rows_data[columns[0]]) == 0:
                return np.array([], dtype=np.float32), {}

            # obtengo las columnas que necesito
            x_data = rows_data[columns[0]]
            y_data = rows_data[columns[1]]
            z_data = rows_data[columns[2]]
            
            # pre-alloco un array para optimizar el rendimiento
            num_points = len(x_data)
            flat_numpy = np.empty(num_points * 3, dtype=np.float32)
            
            # Direct strided assignment for optimal cache performance
            flat_numpy[0::3] = x_data.astype(np.float32, copy=False)
            flat_numpy[1::3] = y_data.astype(np.float32, copy=False)
            flat_numpy[2::3] = z_data.astype(np.float32, copy=False)

            # obtengo las estadisticas desde la base de datos (pandas)
            boundaries = {}
            with Session(self.engine) as session:
                stats = session.exec(
                    select(DatasetColumnStats)
                    .where(DatasetColumnStats.dataset_id == dataset_id)
                    .where(DatasetColumnStats.column_type == "numeric")
                ).all()
                
                for stat in stats:
                    if stat.column_name in columns and stat.min_value is not None and stat.max_value is not None:
                        boundaries[stat.column_name] = {
                            'min_value': float(stat.min_value),
                            'max_value': float(stat.max_value),
                            'valid_count': int(stat.count) if stat.count else num_points
                        }

            return flat_numpy, boundaries

        except Exception as e:
            return np.array([], dtype=np.float32), {}

    
    def store_column_statistics(self, dataset_id: str, column_stats: Dict[str, Dict[str, Any]]):
        """
        Store pandas describe() statistics for dataset columns in the database
        
        Args:
            dataset_id: The dataset ID to store statistics for
            column_stats: Dict with structure {column_name: {stat_name: value}}
        """
        try:
            with Session(self.engine) as session:
                # elimino las estadisticas existentes para este dataset
                # se utiliza cuando se agrega nuevas columnas (recalcular todo....)
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
                
        except Exception as e:
            raise e
    
