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

    def update_file(self, file_id: str, name: str) -> Optional[File]:
        """Update file metadata (name only)"""
        with Session(self.engine) as session:
            file = session.get(File, file_id)
            if not file:
                return None
            file.name = name
            session.add(file)
            session.commit()
            session.refresh(file)
            return file

    def rename_file_columns(self, file_id: str, column_renames: Dict[str, str]) -> Tuple[bool, List[str], str]:
        """
        Rename columns in the DuckDB table associated with a file
        Also updates column_mappings in all datasets associated with this file

        Args:
            file_id: The file ID
            column_renames: Dict mapping old_name -> new_name

        Returns:
            Tuple of (success, renamed_columns, error_message)
        """
        try:
            table_name = f"data_{file_id.replace('-', '_')}"

            print(f"🔄 [BACKEND/Database] rename_file_columns called for file_id: {file_id}")
            print(f"🔄 [BACKEND/Database] Table name: {table_name}")
            print(f"🔄 [BACKEND/Database] Column renames: {column_renames}")

            # Check if table exists
            if not self.check_duckdb_table_exists(table_name):
                print(f"❌ [BACKEND/Database] Table {table_name} does not exist")
                return False, [], f"Table {table_name} does not exist"

            renamed_columns = []

            # 1. Rename columns in DuckDB table
            with self.engine.connect() as conn:
                with conn.begin():
                    # Get existing columns first
                    result = conn.execute(text(f"DESCRIBE {table_name}"))
                    existing_columns = {row[0] for row in result}
                    print(f"🔍 [BACKEND/Database] Existing columns in DuckDB table: {existing_columns}")

                    # Rename each column
                    for old_name, new_name in column_renames.items():
                        if old_name not in existing_columns:
                            print(f"⚠️ [BACKEND/Database] Column '{old_name}' not found in table, skipping")
                            continue  # Skip if column doesn't exist

                        # DuckDB syntax for renaming columns
                        print(f"🔄 [BACKEND/Database] Executing: ALTER TABLE {table_name} RENAME COLUMN \"{old_name}\" TO \"{new_name}\"")
                        conn.execute(text(f"ALTER TABLE {table_name} RENAME COLUMN \"{old_name}\" TO \"{new_name}\""))
                        renamed_columns.append(new_name)
                        print(f"✅ [BACKEND/Database] Successfully renamed column: {old_name} -> {new_name}")

            print(f"✅ [BACKEND/Database] DuckDB columns renamed: {renamed_columns}")

            # 2. Update column_mappings in all datasets for this file
            with Session(self.engine) as session:
                # Get all datasets for this file
                datasets = session.exec(select(Dataset).where(Dataset.file_id == file_id)).all()
                print(f"🔍 [BACKEND/Database] Found {len(datasets)} datasets for file_id: {file_id}")

                for dataset in datasets:
                    if dataset.column_mappings:
                        # Parse JSON column mappings
                        import json
                        mappings = json.loads(dataset.column_mappings)
                        print(f"🔍 [BACKEND/Database] Dataset {dataset.id} current mappings: {mappings}")

                        # Update column names in mappings
                        updated = False
                        for mapping in mappings:
                            if mapping['column_name'] in column_renames:
                                old_col_name = mapping['column_name']
                                new_col_name = column_renames[old_col_name]
                                mapping['column_name'] = new_col_name
                                updated = True
                                print(f"✅ [BACKEND/Database] Updated dataset {dataset.id} column mapping: {old_col_name} -> {new_col_name}")

                        if updated:
                            # Save updated mappings back to database
                            dataset.column_mappings = json.dumps(mappings)
                            session.add(dataset)
                            print(f"💾 [BACKEND/Database] Saved updated mappings for dataset {dataset.id}")

                # Commit all dataset updates
                session.commit()
                print(f"✅ [BACKEND/Database] Committed all dataset updates")

            # 3. Recalculate statistics to reflect renamed columns
            print(f"🔄 [BACKEND/Database] Recalculating statistics for file_id: {file_id}")
            self.recalculate_file_statistics(file_id)

            return True, renamed_columns, ""

        except Exception as e:
            print(f"❌ [BACKEND/Database] Exception in rename_file_columns: {str(e)}")
            import traceback
            print(f"❌ Error in rename_file_columns: {e}")
            print(traceback.format_exc())
            return False, [], str(e)

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
            
            # Get all datasets associated with this file
            datasets = session.exec(select(Dataset).where(Dataset.file_id == file_id)).all()
            
            # Delete in proper order to respect foreign key constraints
            for dataset in datasets:
                # 1. First delete ALL statistics for this dataset
                stats_to_delete = session.exec(
                    select(DatasetColumnStats)
                    .where(DatasetColumnStats.dataset_id == dataset.id)
                ).all()
                
                for stat in stats_to_delete:
                    session.delete(stat)
                
                # 2. Commit statistics deletion before deleting dataset
                session.commit()
                
                # 3. Now safely delete the dataset
                session.delete(dataset)
                session.commit()
            
            # Delete associated DuckDB table
            table_name = f"data_{file_id.replace('-', '_')}"
            try:
                with self.engine.connect() as conn:
                    conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
            except Exception:
                pass  # Ignore errors when dropping table
            
            # Finally delete the file
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


    def get_dataset_data_and_stats_combined(self, dataset_id: str, columns: List[str], bounding_box: List[float] = None) -> Tuple[np.ndarray, Dict[str, Dict[str, float]]]:
        """
        Get dataset data with optional bounding box filtering

        Args:
            dataset_id: The dataset ID
            columns: List of column names [x_col, y_col, value_col]
            bounding_box: Optional bounding box [x1, x2, y1, y2] for 2D or [x1, x2, y1, y2, z1, z2] for 3D

        Returns:
            Tuple of (flat_numpy_array, boundaries_dict)
        """
        try:
            print(f"🔍 get_dataset_data_and_stats_combined called - dataset_id={dataset_id}, columns={columns}")

            dataset = self.get_dataset_by_id(dataset_id)
            if not dataset:
                print(f"❌ Dataset not found: {dataset_id}")
                return np.array([], dtype=np.float32), {}

            table_name = dataset.duckdb_table_name
            print(f"📊 Using DuckDB table: {table_name}")

            # consigo las columnas que necesito - quote column names to handle special characters
            data_query = f'SELECT "{columns[0]}", "{columns[1]}", "{columns[2]}" FROM {table_name}'
            print(f"🔍 Executing query: {data_query}")

            # obtengo los datos usando DuckDB's fetchnumpy para optimizar el rendimiento
            with self.engine.connect() as conn:
                duckdb_conn = conn.connection.connection
                rows_data = duckdb_conn.execute(data_query).fetchnumpy()
                print(f"✅ Query executed, checking results...")

            # si no hay datos, devuelvo un array vacío
            if not rows_data or len(rows_data[columns[0]]) == 0:
                print(f"⚠️ No data found - rows_data={rows_data}, column_keys={list(rows_data.keys()) if rows_data else 'None'}")
                return np.array([], dtype=np.float32), {}

            print(f"✅ Data found: {len(rows_data[columns[0]])} rows")

            # obtengo las columnas que necesito
            x_data = rows_data[columns[0]]
            y_data = rows_data[columns[1]]
            z_data = rows_data[columns[2]]

            # Apply bounding box filter if provided
            if bounding_box and len(bounding_box) in [4, 6]:
                x1, x2, y1, y2 = bounding_box[0], bounding_box[1], bounding_box[2], bounding_box[3]
                is_3d = len(bounding_box) == 6
                z1, z2 = (bounding_box[4], bounding_box[5]) if is_3d else (None, None)

                print(f"🔍 Filtering dataset {dataset_id} with bounding box: x[{x1}, {x2}], y[{y1}, {y2}]" +
                      (f", z[{z1}, {z2}]" if is_3d else ""))

                # Apply bounding box filter using numpy boolean masking
                mask = (x_data >= x1) & (x_data <= x2) & (y_data >= y1) & (y_data <= y2)

                # Apply 3D filter if applicable
                if is_3d and z1 is not None and z2 is not None:
                    mask = mask & (z_data >= z1) & (z_data <= z2)

                # Filter data
                x_data = x_data[mask]
                y_data = y_data[mask]
                z_data = z_data[mask]

                print(f"✅ Filtered to {len(x_data)} points from bounding box")

            # pre-alloco un array para optimizar el rendimiento
            num_points = len(x_data)

            if num_points == 0:
                return np.array([], dtype=np.float32), {}

            flat_numpy = np.empty(num_points * 3, dtype=np.float32)

            # Direct strided assignment for optimal cache performance
            flat_numpy[0::3] = x_data.astype(np.float32, copy=False)
            flat_numpy[1::3] = y_data.astype(np.float32, copy=False)
            flat_numpy[2::3] = z_data.astype(np.float32, copy=False)

            # obtengo las estadisticas - si hay filtro, calculo desde los datos filtrados
            if bounding_box and len(bounding_box) in [4, 6]:
                # Calculate boundaries from filtered data
                boundaries = {
                    columns[0]: {
                        'min_value': float(np.min(x_data)),
                        'max_value': float(np.max(x_data)),
                        'valid_count': num_points
                    },
                    columns[1]: {
                        'min_value': float(np.min(y_data)),
                        'max_value': float(np.max(y_data)),
                        'valid_count': num_points
                    },
                    columns[2]: {
                        'min_value': float(np.min(z_data)),
                        'max_value': float(np.max(z_data)),
                        'valid_count': num_points
                    }
                }
            else:
                # Get boundaries from database (existing behavior)
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

        except KeyError as e:
            print(f"❌ Column not found in query results: {e}")
            print(f"❌ Available columns: {list(rows_data.keys()) if 'rows_data' in locals() else 'Query failed'}")
            import traceback
            print(f"❌ Traceback: {traceback.format_exc()}")
            return np.array([], dtype=np.float32), {}
        except Exception as e:
            print(f"❌ Error in get_dataset_data_and_stats_combined: {e}")
            import traceback
            print(f"❌ Traceback: {traceback.format_exc()}")
            return np.array([], dtype=np.float32), {}

    def compute_histogram(self, data: np.ndarray, column_name: str, num_bins: int = 30) -> Dict:
        """
        Compute histogram data for a column using numpy.

        Args:
            data: Numpy array of numeric values
            column_name: Name of the column
            num_bins: Number of bins for histogram (default: 30)

        Returns:
            Dict with histogram data structure matching HistogramData protobuf
        """
        try:
            if len(data) == 0:
                return {}

            # Remove NaN values
            data = data[~np.isnan(data)]

            if len(data) == 0:
                return {}

            min_val = float(np.min(data))
            max_val = float(np.max(data))

            # Compute histogram using numpy
            counts, bin_edges = np.histogram(data, bins=num_bins, range=(min_val, max_val))

            # Create bin range strings
            bin_ranges = []
            for i in range(len(counts)):
                bin_ranges.append(f"{bin_edges[i]:.2f} - {bin_edges[i+1]:.2f}")

            return {
                'bin_ranges': bin_ranges,
                'bin_counts': counts.astype(int).tolist(),
                'bin_edges': bin_edges.tolist(),
                'num_bins': num_bins,
                'min_value': min_val,
                'max_value': max_val,
                'total_count': len(data)
            }

        except Exception as e:
            print(f"❌ Error computing histogram for {column_name}: {e}")
            return {}

    def compute_boxplot(self, data: np.ndarray, column_name: str) -> Dict:
        """
        Compute box plot statistics for a column using numpy.

        Args:
            data: Numpy array of numeric values
            column_name: Name of the column

        Returns:
            Dict with box plot data structure matching BoxPlotData protobuf
        """
        try:
            if len(data) == 0:
                return {}

            # Remove NaN values
            data = data[~np.isnan(data)]

            if len(data) == 0:
                return {}

            # Compute quartiles
            q1 = float(np.percentile(data, 25))
            median = float(np.percentile(data, 50))
            q3 = float(np.percentile(data, 75))

            # IQR and fences
            iqr = q3 - q1
            lower_fence = q1 - 1.5 * iqr
            upper_fence = q3 + 1.5 * iqr

            # Find outliers
            outliers = data[(data < lower_fence) | (data > upper_fence)]

            # Min/max excluding outliers
            non_outliers = data[(data >= lower_fence) & (data <= upper_fence)]
            min_val = float(np.min(non_outliers)) if len(non_outliers) > 0 else float(np.min(data))
            max_val = float(np.max(non_outliers)) if len(non_outliers) > 0 else float(np.max(data))

            return {
                'column_name': column_name,
                'min': min_val,
                'q1': q1,
                'median': median,
                'q3': q3,
                'max': max_val,
                'mean': float(np.mean(data)),
                'outliers': outliers.tolist(),
                'lower_fence': lower_fence,
                'upper_fence': upper_fence,
                'iqr': iqr,
                'total_count': len(data)
            }

        except Exception as e:
            print(f"❌ Error computing box plot for {column_name}: {e}")
            return {}

    def compute_heatmap(self, x_data: np.ndarray, y_data: np.ndarray, value_data: np.ndarray,
                        x_column: str, y_column: str, value_column: str,
                        grid_size: int = 50) -> Dict:
        """
        Compute 2D heatmap aggregation using numpy.

        Args:
            x_data: X coordinate values
            y_data: Y coordinate values
            value_data: Values to aggregate
            x_column: Name of X column
            y_column: Name of Y column
            value_column: Name of value column
            grid_size: Grid size for binning (default: 50x50)

        Returns:
            Dict with heatmap data structure matching HeatmapData protobuf
        """
        try:
            if len(x_data) == 0 or len(y_data) == 0 or len(value_data) == 0:
                return {}

            # Remove NaN values
            mask = ~(np.isnan(x_data) | np.isnan(y_data) | np.isnan(value_data))
            x_data = x_data[mask]
            y_data = y_data[mask]
            value_data = value_data[mask]

            if len(x_data) == 0:
                return {}

            # Calculate bounds
            min_x, max_x = float(np.min(x_data)), float(np.max(x_data))
            min_y, max_y = float(np.min(y_data)), float(np.max(y_data))

            # Calculate bin sizes
            x_bin_size = (max_x - min_x) / grid_size
            y_bin_size = (max_y - min_y) / grid_size

            # Compute bin indices
            x_bins = np.floor((x_data - min_x) / x_bin_size).astype(int)
            y_bins = np.floor((y_data - min_y) / y_bin_size).astype(int)

            # Clip to grid bounds
            x_bins = np.clip(x_bins, 0, grid_size - 1)
            y_bins = np.clip(y_bins, 0, grid_size - 1)

            # Aggregate using dictionary (faster than nested loops)
            cell_sums = {}
            cell_counts = {}

            for i in range(len(x_data)):
                key = (x_bins[i], y_bins[i])
                if key not in cell_sums:
                    cell_sums[key] = 0.0
                    cell_counts[key] = 0
                cell_sums[key] += value_data[i]
                cell_counts[key] += 1

            # Build cells list
            cells = []
            for (x_idx, y_idx), total in cell_sums.items():
                count = cell_counts[(x_idx, y_idx)]
                avg_value = total / count
                cells.append({
                    'x_index': int(x_idx),
                    'y_index': int(y_idx),
                    'avg_value': float(avg_value),
                    'count': int(count)
                })

            # Calculate min/max aggregated values
            avg_values = [cell['avg_value'] for cell in cells]
            min_value = float(np.min(avg_values)) if avg_values else 0.0
            max_value = float(np.max(avg_values)) if avg_values else 0.0

            return {
                'cells': cells,
                'grid_size_x': grid_size,
                'grid_size_y': grid_size,
                'min_value': min_value,
                'max_value': max_value,
                'x_bin_size': x_bin_size,
                'y_bin_size': y_bin_size,
                'min_x': min_x,
                'max_x': max_x,
                'min_y': min_y,
                'max_y': max_y,
                'x_column': x_column,
                'y_column': y_column,
                'value_column': value_column
            }

        except Exception as e:
            print(f"❌ Error computing heatmap: {e}")
            import traceback
            print(traceback.format_exc())
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

    def recalculate_file_statistics(self, file_id: str, sample_size: int = 10000) -> bool:
        """
        Recalculate statistics for a file from its DuckDB table after data manipulation

        Args:
            file_id: The file ID
            sample_size: Sample size for large datasets (default 10K rows)

        Returns:
            True if successful, False otherwise
        """
        try:
            table_name = f"data_{file_id.replace('-', '_')}"

            if not self.check_duckdb_table_exists(table_name):
                print(f"⚠️ Table {table_name} does not exist, skipping statistics recalculation")
                return False

            # Get data from DuckDB into pandas
            import pandas as pd

            with self.engine.connect() as conn:
                duckdb_conn = conn.connection.connection

                # Get total row count first
                count_result = duckdb_conn.execute(f"SELECT COUNT(*) FROM {table_name}").fetchone()
                total_rows = int(count_result[0])

                # Sample if needed
                if sample_size < total_rows and sample_size > 0:
                    # Use DuckDB's SAMPLE for efficient sampling
                    query = f"SELECT * FROM {table_name} USING SAMPLE {sample_size}"
                else:
                    query = f"SELECT * FROM {table_name}"

                result = duckdb_conn.execute(query)
                df = result.df()

            if df.empty:
                print(f"⚠️ No data in table {table_name}, skipping statistics recalculation")
                return False

            # Generate statistics using pandas describe()
            numeric_describe = df.select_dtypes(include=[np.number]).describe()
            numeric_columns = list(numeric_describe.columns)
            categorical_columns = [col for col in df.columns if col not in numeric_columns]

            column_statistics = {}

            # Statistics for numeric columns
            for col in numeric_columns:
                if col in numeric_describe.columns:
                    col_stats = numeric_describe[col]
                    count = col_stats.get('count', 0)

                    if count > 0:
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
                            'total_rows': total_rows
                        }

            # Statistics for categorical columns
            for col in categorical_columns:
                column_statistics[col] = {
                    'column_type': 'categorical',
                    'count': float(df[col].count()),
                    'null_count': int(df[col].isnull().sum()),
                    'unique_count': int(df[col].nunique()),
                    'total_rows': total_rows
                }

            # Find all datasets associated with this file and update their statistics
            with Session(self.engine) as session:
                datasets = session.exec(select(Dataset).where(Dataset.file_id == file_id)).all()

                for dataset in datasets:
                    self.store_column_statistics(dataset.id, column_statistics)
                    print(f"✅ Recalculated statistics for dataset {dataset.id}")

            return True

        except Exception as e:
            import traceback
            print(f"❌ Error recalculating file statistics: {e}")
            print(traceback.format_exc())
            return False

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

                return boundaries

        except Exception as e:
            return {}

    def get_file_statistics(self, file_id: str, column_names: List[str] = None) -> Dict[str, Dict[str, Any]]:
        """
        Get file statistics from associated datasets

        Args:
            file_id: The file ID
            column_names: Optional list of specific columns to get stats for

        Returns:
            Dict with structure: {column_name: {stat_name: value}}
        """
        try:
            # Get the dataset associated with this file
            with Session(self.engine) as session:
                dataset = session.exec(
                    select(Dataset).where(Dataset.file_id == file_id)
                ).first()

                if not dataset:
                    # If no dataset, generate statistics directly from DuckDB
                    table_name = f"data_{file_id.replace('-', '_')}"
                    if not self.check_duckdb_table_exists(table_name):
                        return {}

                    # Use pandas describe on the DuckDB table
                    import pandas as pd
                    import io

                    with self.engine.connect() as conn:
                        duckdb_conn = conn.connection.connection
                        result = duckdb_conn.execute(f"SELECT * FROM {table_name}")
                        df = result.df()

                    if df.empty:
                        return {}

                    # Filter to specific columns if requested
                    if column_names:
                        df = df[[col for col in column_names if col in df.columns]]

                    # Get statistics using pandas describe
                    numeric_describe = df.select_dtypes(include=[np.number]).describe()
                    numeric_columns = list(numeric_describe.columns)
                    categorical_columns = [col for col in df.columns if col not in numeric_columns]

                    statistics = {}

                    # Numeric column statistics
                    for col in numeric_columns:
                        col_stats = numeric_describe[col]
                        statistics[col] = {
                            'column_type': 'numeric',
                            'count': int(col_stats.get('count', 0)),
                            'mean': float(col_stats.get('mean', 0)) if not pd.isna(col_stats.get('mean')) else None,
                            'std': float(col_stats.get('std', 0)) if not pd.isna(col_stats.get('std')) else None,
                            'min': float(col_stats.get('min', 0)) if not pd.isna(col_stats.get('min')) else None,
                            'q25': float(col_stats.get('25%', 0)) if not pd.isna(col_stats.get('25%')) else None,
                            'q50': float(col_stats.get('50%', 0)) if not pd.isna(col_stats.get('50%')) else None,
                            'q75': float(col_stats.get('75%', 0)) if not pd.isna(col_stats.get('75%')) else None,
                            'max': float(col_stats.get('max', 0)) if not pd.isna(col_stats.get('max')) else None,
                            'null_count': int(df[col].isnull().sum()),
                            'unique_count': int(df[col].nunique()),
                        }

                    # Categorical column statistics
                    for col in categorical_columns:
                        value_counts = df[col].value_counts()
                        statistics[col] = {
                            'column_type': 'categorical',
                            'count': int(df[col].count()),
                            'null_count': int(df[col].isnull().sum()),
                            'unique_count': int(df[col].nunique()),
                            'top_values': value_counts.index.tolist()[:10],  # Top 10
                            'top_counts': value_counts.values.tolist()[:10]
                        }

                    return statistics

                # Get statistics from stored dataset stats
                stats_query = select(DatasetColumnStats).where(DatasetColumnStats.dataset_id == dataset.id)

                # Filter by column names if specified
                if column_names:
                    stats_query = stats_query.where(DatasetColumnStats.column_name.in_(column_names))

                stats = session.exec(stats_query).all()

                statistics = {}
                for stat in stats:
                    stat_dict = {
                        'column_type': stat.column_type,
                        'count': int(stat.count) if stat.count else 0,
                        'null_count': int(stat.null_count) if stat.null_count else 0,
                        'unique_count': int(stat.unique_count) if stat.unique_count else 0,
                    }

                    if stat.column_type == 'numeric':
                        stat_dict.update({
                            'mean': float(stat.mean) if stat.mean else None,
                            'std': float(stat.std) if stat.std else None,
                            'min': float(stat.min_value) if stat.min_value is not None else None,
                            'q25': float(stat.q25) if stat.q25 else None,
                            'q50': float(stat.q50) if stat.q50 else None,
                            'q75': float(stat.q75) if stat.q75 else None,
                            'max': float(stat.max_value) if stat.max_value is not None else None,
                        })

                    statistics[stat.column_name] = stat_dict

                return statistics

        except Exception as e:
            print(f"❌ Error getting file statistics: {e}")
            import traceback
            traceback.print_exc()
            return {}

    # ========== Data Manipulation Methods ==========

    def replace_file_data(self, file_id: str, replacements: List[Tuple[str, str]], columns: List[str] = None) -> Tuple[bool, int, str]:
        """
        Replace values in DuckDB table

        Args:
            file_id: The file ID
            replacements: List of (from_value, to_value) tuples
            columns: Optional list of specific columns to apply replacements to

        Returns:
            Tuple of (success, rows_affected, error_message)
        """
        try:
            table_name = f"data_{file_id.replace('-', '_')}"

            if not self.check_duckdb_table_exists(table_name):
                return False, 0, f"Table {table_name} does not exist"

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
                self.recalculate_file_statistics(file_id)

            return True, total_cells_affected, ""

        except Exception as e:
            return False, 0, str(e)

    def search_file_data(self, file_id: str, query: str, limit: int = 100, offset: int = 0) -> Tuple[bool, List[Dict[str, Any]], int, str]:
        """
        Search/filter file data with pagination

        Args:
            file_id: The file ID
            query: SQL WHERE clause (without WHERE keyword)
            limit: Max results
            offset: Pagination offset

        Returns:
            Tuple of (success, data_rows, total_rows, error_message)
        """
        try:
            table_name = f"data_{file_id.replace('-', '_')}"

            if not self.check_duckdb_table_exists(table_name):
                return False, [], 0, f"Table {table_name} does not exist"

            with self.engine.connect() as conn:
                # Get total count
                if query and query.strip():
                    count_query = f"SELECT COUNT(*) FROM {table_name} WHERE {query}"
                else:
                    count_query = f"SELECT COUNT(*) FROM {table_name}"

                count_result = conn.execute(text(count_query)).fetchone()
                total_rows = int(count_result[0])

                # Get data with pagination
                if query and query.strip():
                    data_query = f"SELECT * FROM {table_name} WHERE {query} LIMIT {limit} OFFSET {offset}"
                else:
                    data_query = f"SELECT * FROM {table_name} LIMIT {limit} OFFSET {offset}"

                result = conn.execute(text(data_query))
                columns = result.keys()

                data_rows = []
                for row in result:
                    row_dict = {col: str(val) if val is not None else "" for col, val in zip(columns, row)}
                    data_rows.append(row_dict)

            return True, data_rows, total_rows, ""

        except Exception as e:
            return False, [], 0, str(e)

    def filter_file_data(self, file_id: str, column: str, operation: str, value: str,
                        create_new_file: bool = False, new_file_name: str = None, project_id: str = None) -> Tuple[bool, str, int, str]:
        """
        Filter file data with optional new file creation

        Args:
            file_id: The file ID
            column: Column name to filter
            operation: Comparison operation (=, !=, >, <, >=, <=, LIKE)
            value: Value to compare against
            create_new_file: Whether to create a new file
            new_file_name: Name for new file (required if create_new_file=True)
            project_id: Project ID (required if create_new_file=True)

        Returns:
            Tuple of (success, result_file_id, total_rows, error_message)
        """
        try:
            table_name = f"data_{file_id.replace('-', '_')}"

            if not self.check_duckdb_table_exists(table_name):
                return False, "", 0, f"Table {table_name} does not exist"

            # Build WHERE clause
            if operation.upper() == "LIKE":
                where_clause = f'"{column}" LIKE \'%{value}%\''
            else:
                # Try to parse as number for numeric comparison, otherwise use string
                try:
                    float(value)  # Test if numeric
                    where_clause = f'"{column}" {operation} {value}'  # No quotes for numeric
                except (ValueError, TypeError):
                    where_clause = f'"{column}" {operation} \'{value}\''  # Quotes for string

            if create_new_file:
                if not new_file_name or not project_id:
                    return False, "", 0, "new_file_name and project_id required when create_new_file=True"

                # Create new file and table
                new_file_id = self.generate_id()
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
                file = File(
                    id=new_file_id,
                    project_id=project_id,
                    name=new_file_name,
                    dataset_type=0,  # UNSPECIFIED
                    original_filename=f"{new_file_name}_filtered.csv",
                    file_size=0,
                    created_at=self.get_timestamp(),
                )

                with Session(self.engine) as session:
                    session.add(file)
                    session.commit()

                return True, new_file_id, total_rows, ""

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
                    self.recalculate_file_statistics(file_id)

                return True, file_id, total_rows, ""

        except Exception as e:
            return False, "", 0, str(e)

    def delete_file_points(self, file_id: str, row_indices: List[int]) -> Tuple[bool, int, int, str]:
        """
        Delete specific rows from file by index using ROW_NUMBER

        Args:
            file_id: The file ID
            row_indices: List of row indices to delete (0-based, user-facing)

        Returns:
            Tuple of (success, rows_deleted, rows_remaining, error_message)
        """
        try:
            table_name = f"data_{file_id.replace('-', '_')}"

            if not self.check_duckdb_table_exists(table_name):
                return False, 0, 0, f"Table {table_name} does not exist"

            with self.engine.connect() as conn:
                with conn.begin():
                    if row_indices:
                        # Convert 0-based user indices to 1-based SQL row numbers
                        row_numbers = [str(i + 1) for i in sorted(row_indices)]
                        row_numbers_str = ",".join(row_numbers)

                        # Use CTE with ROW_NUMBER to reliably identify and delete rows
                        # This approach is database-agnostic and doesn't depend on rowid behavior
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
                            self.recalculate_file_statistics(file_id)

                        return True, rows_deleted, rows_remaining, ""
                    else:
                        # No rows to delete
                        count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                        rows_remaining = int(count_result[0])
                        return True, 0, rows_remaining, ""

        except Exception as e:
            return False, 0, 0, str(e)

    def add_filtered_column(self, file_id: str, new_column_name: str, source_column: str,
                           operation: str, value: str) -> Tuple[bool, str, int, str]:
        """
        Add a new column with filtered values (matching values shown, non-matching as NULL)

        Args:
            file_id: The file ID
            new_column_name: Name for the new filtered column
            source_column: Column to filter on
            operation: Comparison operation (=, !=, >, <, >=, <=, LIKE)
            value: Value to compare against

        Returns:
            Tuple of (success, new_column_name, rows_with_values, error_message)
        """
        try:
            table_name = f"data_{file_id.replace('-', '_')}"

            print(f"🔍 [BACKEND/Database] Adding filtered column '{new_column_name}' based on {source_column} {operation} {value}")

            if not self.check_duckdb_table_exists(table_name):
                return False, "", 0, f"Table {table_name} does not exist"

            with self.engine.connect() as conn:
                with conn.begin():
                    # Build WHERE clause
                    if operation.upper() == "LIKE":
                        where_clause = f'"{source_column}" LIKE \'%{value}%\''
                    else:
                        # Try to parse as number for numeric comparison, otherwise use string
                        try:
                            float(value)  # Test if numeric
                            where_clause = f'"{source_column}" {operation} {value}'  # No quotes for numeric
                        except (ValueError, TypeError):
                            where_clause = f'"{source_column}" {operation} \'{value}\''  # Quotes for string

                    # Add new column with CASE statement
                    # If row matches filter, copy the source column value, otherwise NULL
                    alter_query = f"""
                        ALTER TABLE {table_name}
                        ADD COLUMN "{new_column_name}" VARCHAR
                    """
                    conn.execute(text(alter_query))
                    print(f"✅ [BACKEND/Database] Added column '{new_column_name}'")

                    # Update with filtered values using CASE
                    update_query = f"""
                        UPDATE {table_name}
                        SET "{new_column_name}" = CASE
                            WHEN {where_clause} THEN "{source_column}"
                            ELSE NULL
                        END
                    """
                    conn.execute(text(update_query))
                    print(f"✅ [BACKEND/Database] Updated column with filtered values")

                    # Count how many rows have non-NULL values
                    count_query = f"""
                        SELECT COUNT(*) FROM {table_name}
                        WHERE "{new_column_name}" IS NOT NULL
                    """
                    count_result = conn.execute(text(count_query)).fetchone()
                    rows_with_values = int(count_result[0])

                    print(f"✅ [BACKEND/Database] {rows_with_values} rows match the filter")

            # Recalculate statistics to include the new column
            print(f"🔄 [BACKEND/Database] Recalculating statistics")
            self.recalculate_file_statistics(file_id)

            # Update column_mappings for all datasets associated with this file
            print(f"🔄 [BACKEND/Database] Updating column_mappings for datasets")
            with Session(self.engine) as session:
                datasets = session.exec(select(Dataset).where(Dataset.file_id == file_id)).all()

                for dataset in datasets:
                    if dataset.column_mappings:
                        import json
                        mappings = json.loads(dataset.column_mappings)

                        # Add the new column to mappings as a regular (non-coordinate) column
                        mappings.append({
                            'column_name': new_column_name,
                            'column_type': 1,  # NUMERIC (assuming filtered columns are numeric)
                            'mapped_field': new_column_name,  # Use column name as mapped field
                            'is_coordinate': False
                        })

                        dataset.column_mappings = json.dumps(mappings)
                        session.add(dataset)
                        print(f"✅ [BACKEND/Database] Updated column_mappings for dataset {dataset.id}")

                session.commit()

            return True, new_column_name, rows_with_values, ""

        except Exception as e:
            print(f"❌ [BACKEND/Database] Error adding filtered column: {str(e)}")
            import traceback
            traceback.print_exc()
            return False, "", 0, str(e)

    # ========== Advanced Column Operations ==========

    def add_file_columns(self, file_id: str, new_columns: List[Tuple[str, List[str]]]) -> Tuple[bool, List[str], str]:
        """
        Add new columns to file

        Args:
            file_id: The file ID
            new_columns: List of (column_name, values) tuples

        Returns:
            Tuple of (success, added_columns, error_message)
        """
        try:
            table_name = f"data_{file_id.replace('-', '_')}"

            if not self.check_duckdb_table_exists(table_name):
                return False, [], f"Table {table_name} does not exist"

            added_columns = []

            with self.engine.connect() as conn:
                with conn.begin():
                    # Get current row count
                    count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                    row_count = int(count_result[0])

                    for col_name, values in new_columns:
                        # Validate value count matches row count
                        if len(values) != row_count:
                            return False, [], f"Column '{col_name}' has {len(values)} values but table has {row_count} rows"

                        # Add column with default NULL
                        conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN "{col_name}" VARCHAR'))

                        # Update values using row_number
                        # Create a temporary table with values and use UPDATE FROM
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
                self.recalculate_file_statistics(file_id)

            return True, added_columns, ""

        except Exception as e:
            import traceback
            traceback.print_exc()
            return False, [], str(e)

    def duplicate_file_columns(self, file_id: str, columns_to_duplicate: List[Tuple[str, str]]) -> Tuple[bool, List[str], str]:
        """
        Duplicate existing columns with optional custom naming

        Args:
            file_id: The file ID
            columns_to_duplicate: List of (source_column, new_column_name) tuples
                                 If new_column_name is empty, auto-generate as source_column_copy

        Returns:
            Tuple of (success, duplicated_columns, error_message)
        """
        try:
            table_name = f"data_{file_id.replace('-', '_')}"
            
            print(f"🔄 [BACKEND/Database] Duplicating columns for file_id: {file_id}")
            print(f"🔄 [BACKEND/Database] Columns to duplicate: {columns_to_duplicate}")

            if not self.check_duckdb_table_exists(table_name):
                return False, [], f"Table {table_name} does not exist"

            duplicated_columns = []

            with self.engine.connect() as conn:
                with conn.begin():
                    # Get existing columns
                    result = conn.execute(text(f"DESCRIBE {table_name}"))
                    existing_columns = {row[0] for row in result}
                    print(f"🔍 [BACKEND/Database] Existing columns: {existing_columns}")

                    for source_col, new_col_name in columns_to_duplicate:
                        if source_col not in existing_columns:
                            print(f"⚠️ [BACKEND/Database] Source column '{source_col}' not found, skipping")
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
                            print(f"❌ [BACKEND/Database] Column '{new_col_name}' already exists, skipping")
                            continue

                        print(f"🔄 [BACKEND/Database] Duplicating: {source_col} -> {new_col_name}")

                        # Add new column and copy values
                        conn.execute(text(f'ALTER TABLE {table_name} ADD COLUMN "{new_col_name}" VARCHAR'))
                        conn.execute(text(f'UPDATE {table_name} SET "{new_col_name}" = "{source_col}"'))

                        duplicated_columns.append(new_col_name)
                        existing_columns.add(new_col_name)
                        print(f"✅ [BACKEND/Database] Successfully duplicated: {source_col} -> {new_col_name}")

            # Recalculate statistics after adding columns
            if len(duplicated_columns) > 0:
                print(f"🔄 [BACKEND/Database] Recalculating statistics after duplicating {len(duplicated_columns)} columns")
                self.recalculate_file_statistics(file_id)

            return True, duplicated_columns, ""

        except Exception as e:
            print(f"❌ [BACKEND/Database] Error duplicating columns: {str(e)}")
            import traceback
            traceback.print_exc()
            return False, [], str(e)

    # ========== Dataset Merging ==========

    def merge_datasets(self, first_dataset_id: str, second_dataset_id: str, mode: str,
                      exclude_columns_first: List[str] = None, exclude_columns_second: List[str] = None,
                      output_file: str = None) -> Tuple[bool, str, int, int, List[str], str]:
        """
        Merge two datasets by rows or columns

        Args:
            first_dataset_id: First dataset ID
            second_dataset_id: Second dataset ID
            mode: "BY_ROWS" or "BY_COLUMNS"
            exclude_columns_first: Columns to exclude from first dataset (BY_COLUMNS only)
            exclude_columns_second: Columns to exclude from second dataset (BY_COLUMNS only)
            output_file: Optional output file name

        Returns:
            Tuple of (success, result_dataset_id, rows_merged, columns_merged, warnings, error_message)
        """
        try:
            # Get datasets
            dataset1 = self.get_dataset_by_id(first_dataset_id)
            dataset2 = self.get_dataset_by_id(second_dataset_id)

            if not dataset1 or not dataset2:
                return False, "", 0, 0, [], "One or both datasets not found"

            table1 = dataset1.duckdb_table_name
            table2 = dataset2.duckdb_table_name

            warnings = []

            # Create new table for merged data
            merged_dataset_id = self.generate_id()
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
                        exclude_first = set(exclude_columns_first or [])
                        exclude_second = set(exclude_columns_second or [])

                        # Get columns
                        cols1_all = [row[0] for row in conn.execute(text(f"DESCRIBE {table1}"))]
                        cols2_all = [row[0] for row in conn.execute(text(f"DESCRIBE {table2}"))]

                        # Filter columns
                        cols1 = [c for c in cols1_all if c not in exclude_first]
                        cols2 = [c for c in cols2_all if c not in exclude_second]

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
                        # Using row_number() to align rows from both tables
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

                        # Get counts (rn columns are NOT included in SELECT clause, so they're not in final table)
                        count_result = conn.execute(text(f"SELECT COUNT(*) FROM {merged_table_name}")).fetchone()
                        rows_merged = int(count_result[0])

                        col_result = conn.execute(text(f"DESCRIBE {merged_table_name}"))
                        columns_merged = len(list(col_result))  # Actual column count (no rn columns to subtract)

                    else:
                        return False, "", 0, 0, [], f"Invalid merge mode: {mode}"

            # Get file info for creating metadata
            file1 = None
            file2 = None
            with Session(self.engine) as session:
                file1 = session.get(File, dataset1.file_id)
                file2 = session.get(File, dataset2.file_id)

            # Create new File record
            if file1 and file2:
                merged_file_id = self.generate_id()
                merged_file_name = output_file or f"merged_{mode.lower()}"

                merged_file = File(
                    id=merged_file_id,
                    project_id=file1.project_id,  # Use first file's project
                    name=merged_file_name,
                    dataset_type=file1.dataset_type,
                    original_filename=f"{merged_file_name}.csv",
                    file_size=0,
                    created_at=self.get_timestamp(),
                )

                with Session(self.engine) as session:
                    session.add(merged_file)
                    session.commit()

                # Create Dataset record
                merged_dataset = self.create_dataset(
                    merged_file_id,
                    merged_table_name,
                    rows_merged,
                    []  # No column mappings for merged data
                )

                return True, merged_dataset.id, rows_merged, columns_merged, warnings, ""
            else:
                return False, "", 0, 0, warnings, "Failed to get file metadata"

        except Exception as e:
            import traceback
            traceback.print_exc()
            return False, "", 0, 0, [], str(e)

