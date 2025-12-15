# Database connection utilities
# Shared database connection and initialization functions
import os
import uuid
import time
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional
from sqlalchemy import Engine, create_engine, text
from sqlmodel import SQLModel

# Import models for table creation
from . import models


# ========== Table Name Utilities ==========

def get_table_name(file_id: str) -> str:
    """
    Convert file_id to DuckDB table name.
    
    Args:
        file_id: UUID string for the file
        
    Returns:
        Table name in format 'data_uuid_with_underscores'
    """
    return f"data_{file_id.replace('-', '_')}"


# ========== Table Query Utilities ==========

def get_table_row_count(engine: Engine, table_name: str) -> int:
    """
    Get row count for a DuckDB table.
    
    Args:
        engine: SQLAlchemy Engine instance
        table_name: Name of the table
        
    Returns:
        Number of rows in the table
    """
    with engine.connect() as conn:
        result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
        return int(result[0])


def get_table_columns(engine: Engine, table_name: str) -> List[str]:
    """
    Get column names for a DuckDB table.
    
    Args:
        engine: SQLAlchemy Engine instance
        table_name: Name of the table
        
    Returns:
        List of column names
    """
    with engine.connect() as conn:
        result = conn.execute(text(f"DESCRIBE {table_name}"))
        return [row[0] for row in result]


def get_table_schema(engine: Engine, table_name: str) -> List[Tuple[str, str]]:
    """
    Get column names and types for a DuckDB table.
    
    Args:
        engine: SQLAlchemy Engine instance
        table_name: Name of the table
        
    Returns:
        List of tuples (column_name, column_type)
    """
    with engine.connect() as conn:
        result = conn.execute(text(f"DESCRIBE {table_name}"))
        return [(row[0], row[1]) for row in result]


def drop_table_if_exists(engine: Engine, table_name: str) -> bool:
    """
    Drop a DuckDB table if it exists.
    
    Args:
        engine: SQLAlchemy Engine instance
        table_name: Name of the table to drop
        
    Returns:
        True if dropped, False if table didn't exist
    """
    try:
        with engine.connect() as conn:
            conn.execute(text(f"DROP TABLE IF EXISTS {table_name}"))
            return True
    except Exception:
        return False


# ========== Database Engine ==========

def get_app_data_dir() -> Path:
    """
    Get the application data directory using XDG Base Directory specification.
    Creates the directory if it doesn't exist.

    Returns:
        Path to the application data directory (~/.local/share/geoapp)
    """
    # Use XDG_DATA_HOME if set, otherwise default to ~/.local/share
    xdg_data = os.environ.get('XDG_DATA_HOME', os.path.expanduser('~/.local/share'))
    app_data_dir = Path(xdg_data) / 'geoapp'

    # Create directory if it doesn't exist
    app_data_dir.mkdir(parents=True, exist_ok=True)

    return app_data_dir


def get_db_engine(db_path: str = None) -> Engine:
    """
    Create and return SQLAlchemy engine for DuckDB database.
    If db_path is not provided, uses XDG data directory (~/.local/share/geoapp/geospatial.db)

    Args:
        db_path: Path to the DuckDB database file (optional)

    Returns:
        SQLAlchemy Engine instance
    """
    if db_path is None:
        # Use XDG data directory for AppImage compatibility
        app_data_dir = get_app_data_dir()
        db_path = str(app_data_dir / 'geospatial.db')

    db_url = f"duckdb:///{db_path}"
    return create_engine(db_url)


def initialize_database(engine: Engine) -> None:
    """
    Initialize database by creating all SQLModel tables
    
    Args:
        engine: SQLAlchemy Engine instance
    """
    SQLModel.metadata.create_all(engine)
    
    # Run migrations
    migrate_add_extra_metadata(engine)



def generate_id() -> str:
    """Generate a UUID string"""
    return str(uuid.uuid4())


def get_timestamp() -> int:
    """Get current Unix timestamp"""
    return int(time.time())


def check_duckdb_table_exists(engine: Engine, table_name: str) -> bool:
    """
    Check if a DuckDB table exists
    
    Args:
        engine: SQLAlchemy Engine instance
        table_name: Name of the table to check
        
    Returns:
        True if table exists, False otherwise
    """
    try:
        with engine.connect() as conn:
            conn.execute(text(f"SELECT 1 FROM {table_name} LIMIT 1"))
            return True
    except Exception as e:
        return False


def migrate_add_extra_metadata(engine: Engine) -> None:
    """
    Migration: Add extra_metadata column to file and dataset tables
    """
    try:
        with engine.connect() as conn:
            # Check if extra_metadata column exists in file table
            try:
                result = conn.execute(text("SELECT extra_metadata FROM file LIMIT 1"))
                print("[OK] Migration: extra_metadata column already exists in file table")
            except Exception:
                # Column doesn't exist, add it
                conn.execute(text("ALTER TABLE file ADD COLUMN extra_metadata VARCHAR"))
                conn.commit()
                print("[OK] Migration: Added extra_metadata column to file table")
            
            # Check if extra_metadata column exists in dataset table
            try:
                result = conn.execute(text("SELECT extra_metadata FROM dataset LIMIT 1"))
                print("[OK] Migration: extra_metadata column already exists in dataset table")
            except Exception:
                # Column doesn't exist, add it
                conn.execute(text("ALTER TABLE dataset ADD COLUMN extra_metadata VARCHAR"))
                conn.commit()
                print("[OK] Migration: Added extra_metadata column to dataset table")
                
    except Exception as e:
        print(f"[WARN] Migration warning: {e}")


