# Manejo de base de datos
# SQLite con SQLModel como ORM
import uuid
import time
import json
import math
from typing import List, Dict, Any, Optional, Tuple, Union

from sqlmodel import SQLModel, Field, Relationship, Session, select, create_engine, func
from sqlalchemy import Column, LargeBinary, text, event


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
    file_content: Optional[bytes] = Field(default=None, sa_column=Column(LargeBinary))
    created_at: int
    project: Optional[Project] = Relationship(back_populates="files")
    datasets: List["Dataset"] = Relationship(back_populates="file", sa_relationship_kwargs={"cascade": "all, delete-orphan"})


class Dataset(SQLModel, table=True):
    id: str = Field(primary_key=True)
    file_id: str = Field(foreign_key="file.id")
    total_rows: int
    current_page: int = 0
    column_mappings: Optional[str] = None  # JSON string
    created_at: int
    file: Optional[File] = Relationship(back_populates="datasets")
    rows: List["DatasetData"] = Relationship(back_populates="dataset", sa_relationship_kwargs={"cascade": "all, delete-orphan"})


class DatasetData(SQLModel, table=True):
    id: str = Field(primary_key=True)
    dataset_id: str = Field(foreign_key="dataset.id")
    row_index: int
    data: str  # JSON string
    dataset: Optional[Dataset] = Relationship(back_populates="rows")


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
        self.db_url = f"sqlite:///{self.db_path}"
        self.engine = create_engine(self.db_url, connect_args={"check_same_thread": False})
        
        # Ensure foreign keys are enforced in SQLite
        @event.listens_for(self.engine, "connect")
        def _set_sqlite_pragma(dbapi_connection, connection_record):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()
        
        SQLModel.metadata.create_all(self.engine)

    def generate_id(self) -> str:
        return str(uuid.uuid4())

    def get_timestamp(self) -> int:
        return int(time.time())

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

    def create_file(self, project_id: str, name: str, dataset_type: int,
                    original_filename: str, file_content: bytes) -> File:
        file = File(
            id=self.generate_id(),
            project_id=project_id,
            name=name,
            dataset_type=dataset_type,
            original_filename=original_filename,
            file_size=len(file_content),
            file_content=file_content,
            created_at=self.get_timestamp(),
        )
        with Session(self.engine) as session:
            session.add(file)
            session.commit()
            session.refresh(file)
        return file

    def get_project_files(self, project_id: str) -> List[File]:
        with Session(self.engine) as session:
            files = session.exec(
                select(File).where(File.project_id == project_id).order_by(File.created_at.desc())
            ).all()
            return list(files)

    def get_file_content(self, file_id: str) -> Optional[bytes]:
        with Session(self.engine) as session:
            file = session.get(File, file_id)
            return file.file_content if file else None

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
            session.delete(f)
            session.commit()
            return True

    # ========== Manejo de datasets ==========

    def create_dataset(self, file_id: str, total_rows: int, column_mappings: List[Dict[str, Any]]) -> Dataset:
        dataset = Dataset(
            id=self.generate_id(),
            file_id=file_id,
            total_rows=total_rows,
            current_page=0,
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

    def store_dataset_data(self, dataset_id: str, data_rows: List[Dict[str, str]]):
        with Session(self.engine) as session:
            # Remove existing rows first
            session.exec(text("DELETE FROM datasetdata WHERE dataset_id = :dsid").bindparams(dsid=dataset_id))
            for i, row in enumerate(data_rows):
                session.add(
                    DatasetData(
                        id=self.generate_id(),
                        dataset_id=dataset_id,
                        row_index=i,
                        data=json.dumps(row),
                    )
                )
            session.commit()

    def get_dataset_data(self, dataset_id: str, page: int = 1, page_size: int = 100) -> Tuple[List[Dict[str, str]], int, int]:
        offset = (page - 1) * page_size
        with Session(self.engine) as session:
            total_rows = session.exec(
                select(func.count(DatasetData.id)).where(DatasetData.dataset_id == dataset_id)
            ).one()
            rows = session.exec(
                select(DatasetData.data)
                .where(DatasetData.dataset_id == dataset_id)
                .order_by(DatasetData.row_index)
                .limit(page_size)
                .offset(offset)
            ).all()
        parsed_rows = [json.loads(r) for r in rows]
        total_pages = (total_rows + page_size - 1) // page_size
        return parsed_rows, int(total_rows), int(total_pages)
    
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
    