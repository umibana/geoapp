# Database connection utilities
# Shared database connection and initialization functions
import uuid
import time
from sqlalchemy import Engine, create_engine, text
from sqlmodel import SQLModel

# Import models for table creation
from . import models


def get_db_engine(db_path: str = "geospatial.db") -> Engine:
    """
    Create and return SQLAlchemy engine for DuckDB database
    
    Args:
        db_path: Path to the DuckDB database file
        
    Returns:
        SQLAlchemy Engine instance
    """
    db_url = f"duckdb:///{db_path}"
    return create_engine(db_url)


def initialize_database(engine: Engine) -> None:
    """
    Initialize database by creating all SQLModel tables
    
    Args:
        engine: SQLAlchemy Engine instance
    """
    SQLModel.metadata.create_all(engine)


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


