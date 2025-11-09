# Database models using SQLModel for auto-generated database tables
from typing import List, Optional
from sqlmodel import SQLModel, Field, Relationship


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

