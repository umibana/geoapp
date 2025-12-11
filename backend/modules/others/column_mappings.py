#!/usr/bin/env python
"""
Column mappings service for managing dataset column_mappings JSON
"""
import json
from typing import List, Dict, Any, Callable, Optional
from sqlalchemy import Engine
from sqlmodel import Session, select

from . import models


class ColumnMappingsService:
    """
    Service for managing column_mappings JSON in dataset records.
    
    Centralizes all column mapping modifications to avoid code duplication
    across data manipulation operations.
    """
    
    def __init__(self, engine: Engine):
        self.engine = engine
    
    def add_column(
        self, 
        file_id: str, 
        column_name: str, 
        column_type: int = 1,  # 1 = NUMERIC
        mapped_field: Optional[str] = None,
        is_coordinate: bool = False
    ) -> None:
        """
        Add a new column to all datasets associated with a file.
        
        Args:
            file_id: File ID
            column_name: Name of the new column
            column_type: Column type (1=NUMERIC, 0=CATEGORICAL)
            mapped_field: Mapped field name (defaults to column_name)
            is_coordinate: Whether this is a coordinate column
        """
        new_mapping = {
            'column_name': column_name,
            'column_type': column_type,
            'mapped_field': mapped_field or column_name,
            'is_coordinate': is_coordinate
        }
        
        self._modify_mappings(
            file_id,
            lambda mappings: mappings.append(new_mapping)
        )
    
    def add_columns(
        self,
        file_id: str,
        column_names: List[str],
        column_type: int = 1,
        is_coordinate: bool = False
    ) -> None:
        """
        Add multiple columns to all datasets associated with a file.
        
        Args:
            file_id: File ID
            column_names: List of column names to add
            column_type: Column type for all columns
            is_coordinate: Whether these are coordinate columns
        """
        def add_all(mappings):
            for col_name in column_names:
                mappings.append({
                    'column_name': col_name,
                    'column_type': column_type,
                    'mapped_field': col_name,
                    'is_coordinate': is_coordinate
                })
        
        self._modify_mappings(file_id, add_all)
    
    def remove_columns(self, file_id: str, column_names: List[str]) -> None:
        """
        Remove columns from all datasets associated with a file.
        
        Args:
            file_id: File ID
            column_names: List of column names to remove
        """
        column_set = set(column_names)
        
        def remove_matching(mappings):
            # Filter in-place by modifying the list
            mappings[:] = [m for m in mappings if m['column_name'] not in column_set]
        
        self._modify_mappings(file_id, remove_matching)
    
    def rename_columns(self, file_id: str, renames: Dict[str, str]) -> None:
        """
        Rename columns in all datasets associated with a file.
        
        Args:
            file_id: File ID
            renames: Dict mapping old_name -> new_name
        """
        def rename_matching(mappings):
            for mapping in mappings:
                old_name = mapping['column_name']
                if old_name in renames:
                    mapping['column_name'] = renames[old_name]
        
        self._modify_mappings(file_id, rename_matching)
    
    def get_column_mappings(self, file_id: str) -> List[List[Dict[str, Any]]]:
        """
        Get column mappings for all datasets associated with a file.
        
        Args:
            file_id: File ID
            
        Returns:
            List of column mappings lists (one per dataset)
        """
        results = []
        with Session(self.engine) as session:
            datasets = session.exec(
                select(models.Dataset).where(models.Dataset.file_id == file_id)
            ).all()
            
            for dataset in datasets:
                if dataset.column_mappings:
                    results.append(json.loads(dataset.column_mappings))
                else:
                    results.append([])
        
        return results
    
    def get_numeric_columns(self, file_id: str) -> List[str]:
        """
        Get all numeric column names for a file's datasets.
        
        Args:
            file_id: File ID
            
        Returns:
            List of numeric column names
        """
        all_mappings = self.get_column_mappings(file_id)
        
        if not all_mappings:
            return []
        
        # Use first dataset's mappings
        mappings = all_mappings[0]
        return [m['column_name'] for m in mappings if m.get('column_type') == 1]
    
    def get_coordinate_columns(self, file_id: str) -> Dict[str, str]:
        """
        Get coordinate column mappings (x, y, z) for a file.
        
        Args:
            file_id: File ID
            
        Returns:
            Dict mapping 'x'/'y'/'z' to actual column names
        """
        all_mappings = self.get_column_mappings(file_id)
        
        if not all_mappings:
            return {}
        
        coord_columns = {}
        for mapping in all_mappings[0]:
            if mapping.get('is_coordinate') and mapping.get('mapped_field') in ['x', 'y', 'z']:
                coord_columns[mapping['mapped_field']] = mapping['column_name']
        
        return coord_columns
    
    def _modify_mappings(self, file_id: str, modifier_fn: Callable[[List], None]) -> None:
        """
        Apply a modification function to all datasets' column_mappings for a file.
        
        Args:
            file_id: File ID
            modifier_fn: Function that modifies the mappings list in-place
        """
        with Session(self.engine) as session:
            datasets = session.exec(
                select(models.Dataset).where(models.Dataset.file_id == file_id)
            ).all()
            
            for dataset in datasets:
                if dataset.column_mappings:
                    mappings = json.loads(dataset.column_mappings)
                    modifier_fn(mappings)
                    dataset.column_mappings = json.dumps(mappings)
                    session.add(dataset)
            
            session.commit()


def build_column_mappings_list(protobuf_mappings) -> List[Dict[str, Any]]:
    """
    Convert protobuf column mappings to Python list of dicts.
    
    Args:
        protobuf_mappings: Repeated protobuf ColumnMapping messages
        
    Returns:
        List of column mapping dictionaries
    """
    return [
        {
            'column_name': m.column_name,
            'column_type': int(m.column_type),
            'mapped_field': m.mapped_field,
            'is_coordinate': m.is_coordinate
        }
        for m in protobuf_mappings
    ]


def populate_response_mappings(response_dataset, column_mappings: List[Dict[str, Any]]) -> None:
    """
    Populate a protobuf response dataset with column mappings.
    
    Args:
        response_dataset: Protobuf dataset response object
        column_mappings: List of column mapping dictionaries
    """
    for mapping_dict in column_mappings:
        mapping = response_dataset.column_mappings.add()
        mapping.column_name = mapping_dict['column_name']
        mapping.column_type = mapping_dict['column_type']
        mapping.mapped_field = mapping_dict['mapped_field']
        mapping.is_coordinate = mapping_dict['is_coordinate']

