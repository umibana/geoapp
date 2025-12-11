#!/usr/bin/env python
"""
Statistics service for generating and storing dataset column statistics
"""
import json
from typing import Dict, Any, List, Optional
import numpy as np
import pandas as pd
from sqlalchemy import Engine, text
from sqlmodel import Session, select

from . import models, db_connection


class StatisticsService:
    """
    Service for computing and storing column statistics.
    
    Centralizes all pandas describe() based statistics generation
    to avoid code duplication across managers.
    """
    
    def __init__(self, engine: Engine):
        self.engine = engine
    
    def generate_statistics_from_table(self, table_name: str) -> Dict[str, Dict[str, Any]]:
        """
        Generate statistics from a DuckDB table using pandas describe().
        
        Args:
            table_name: DuckDB table name
            
        Returns:
            Dictionary of column statistics: {column_name: {stat_name: value}}
        """
        if not db_connection.check_duckdb_table_exists(self.engine, table_name):
            return {}
        
        # Get data from DuckDB into pandas
        with self.engine.connect() as conn:
            duckdb_conn = conn.connection.connection
            result = duckdb_conn.execute(f"SELECT * FROM {table_name}")
            df = result.df()
        
        if df.empty:
            return {}
        
        return self._compute_statistics_from_dataframe(df)
    
    def generate_statistics_from_file(self, file_id: str) -> Dict[str, Dict[str, Any]]:
        """
        Generate statistics for a file from its DuckDB table.
        
        Args:
            file_id: File ID
            
        Returns:
            Dictionary of column statistics
        """
        table_name = db_connection.get_table_name(file_id)
        return self.generate_statistics_from_table(table_name)
    
    def _compute_statistics_from_dataframe(self, df: pd.DataFrame) -> Dict[str, Dict[str, Any]]:
        """
        Compute statistics from a pandas DataFrame.
        
        Args:
            df: pandas DataFrame
            
        Returns:
            Dictionary of column statistics
        """
        total_rows = len(df)
        
        # Get numeric statistics using pandas describe()
        numeric_describe = df.select_dtypes(include=[np.number]).describe()
        numeric_columns = list(numeric_describe.columns)
        categorical_columns = [col for col in df.columns if col not in numeric_columns]
        
        column_statistics = {}
        
        # Statistics for numeric columns
        for col in numeric_columns:
            col_stats = numeric_describe[col]
            count = col_stats.get('count', 0)
            
            if count > 0:
                column_statistics[col] = {
                    'column_type': 'numeric',
                    'count': float(count),
                    'mean': self._safe_float(col_stats.get('mean')),
                    'std': self._safe_float(col_stats.get('std')),
                    'min': self._safe_float(col_stats.get('min')),
                    '25%': self._safe_float(col_stats.get('25%')),
                    '50%': self._safe_float(col_stats.get('50%')),
                    '75%': self._safe_float(col_stats.get('75%')),
                    'max': self._safe_float(col_stats.get('max')),
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
        
        return column_statistics
    
    def _safe_float(self, value) -> Optional[float]:
        """Convert value to float, returning None for NaN/None values."""
        if value is None or pd.isna(value):
            return None
        return float(value)
    
    def store_statistics(self, dataset_id: str, column_stats: Dict[str, Dict[str, Any]]) -> None:
        """
        Store column statistics for a dataset in the database.
        
        Args:
            dataset_id: Dataset ID
            column_stats: Dictionary of column statistics
        """
        with Session(self.engine) as session:
            # Delete existing statistics
            existing_stats = session.exec(
                select(models.DatasetColumnStats)
                .where(models.DatasetColumnStats.dataset_id == dataset_id)
            ).all()
            
            for stat in existing_stats:
                session.delete(stat)
            
            # Store new statistics
            for column_name, stats in column_stats.items():
                # Skip numeric columns with no valid min/max
                if stats.get('column_type') == 'numeric':
                    if stats.get('min') is None or stats.get('max') is None:
                        continue
                
                stat_record = models.DatasetColumnStats(
                    id=db_connection.generate_id(),
                    dataset_id=dataset_id,
                    column_name=column_name,
                    column_type=stats.get('column_type', 'numeric'),
                    count=stats.get('count'),
                    mean=stats.get('mean'),
                    std=stats.get('std'),
                    min_value=stats.get('min'),
                    q25=stats.get('25%'),
                    q50=stats.get('50%'),
                    q75=stats.get('75%'),
                    max_value=stats.get('max'),
                    null_count=stats.get('null_count'),
                    unique_count=stats.get('unique_count'),
                    created_at=db_connection.get_timestamp()
                )
                session.add(stat_record)
            
            session.commit()
    
    def generate_and_store(self, file_id: str, dataset_id: str) -> bool:
        """
        Generate statistics from file and store for dataset.
        
        Args:
            file_id: File ID (for table lookup)
            dataset_id: Dataset ID (for storage)
            
        Returns:
            True if successful
        """
        try:
            stats = self.generate_statistics_from_file(file_id)
            if stats:
                self.store_statistics(dataset_id, stats)
                return True
            return False
        except Exception as e:
            print(f"[ERROR] Failed to generate/store statistics: {e}")
            return False
    
    def recalculate_for_file(self, file_id: str) -> bool:
        """
        Recalculate statistics for all datasets associated with a file.
        
        Args:
            file_id: File ID
            
        Returns:
            True if successful
        """
        try:
            stats = self.generate_statistics_from_file(file_id)
            if not stats:
                return False
            
            # Find all datasets for this file and update
            with Session(self.engine) as session:
                datasets = session.exec(
                    select(models.Dataset).where(models.Dataset.file_id == file_id)
                ).all()
                
                for dataset in datasets:
                    self.store_statistics(dataset.id, stats)
                    print(f"[OK] Recalculated statistics for dataset {dataset.id}")
            
            return True
            
        except Exception as e:
            print(f"[ERROR] Error recalculating statistics: {e}")
            import traceback
            traceback.print_exc()
            return False
    
    def get_stored_statistics(self, dataset_id: str) -> Dict[str, Dict[str, Any]]:
        """
        Get stored statistics for a dataset.
        
        Args:
            dataset_id: Dataset ID
            
        Returns:
            Dictionary of column statistics
        """
        statistics = {}
        
        with Session(self.engine) as session:
            stats = session.exec(
                select(models.DatasetColumnStats)
                .where(models.DatasetColumnStats.dataset_id == dataset_id)
            ).all()
            
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
    
    def get_boundaries(self, dataset_id: str) -> Dict[str, Dict[str, float]]:
        """
        Get dataset boundaries (min/max) from stored statistics.
        
        Args:
            dataset_id: Dataset ID
            
        Returns:
            Dictionary: {column_name: {min_value, max_value, valid_count}}
        """
        boundaries = {}
        
        with Session(self.engine) as session:
            stats = session.exec(
                select(models.DatasetColumnStats)
                .where(models.DatasetColumnStats.dataset_id == dataset_id)
                .where(models.DatasetColumnStats.column_type == "numeric")
                .where(models.DatasetColumnStats.min_value.is_not(None))
                .where(models.DatasetColumnStats.max_value.is_not(None))
            ).all()
            
            for stat in stats:
                boundaries[stat.column_name] = {
                    'min_value': float(stat.min_value),
                    'max_value': float(stat.max_value),
                    'valid_count': int(stat.count) if stat.count else 0
                }
        
        return boundaries

