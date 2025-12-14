#!/usr/bin/env python
"""
Inverse Distance Weighting (IDW) Estimation Module
Provides spatial interpolation using the IDW algorithm.
"""
import copy
import logging
import os
from typing import Union, Iterable, Optional, List, Tuple

import numpy as np
from scipy.spatial import KDTree
from sqlalchemy import Engine, text
from sqlmodel import Session, select

from generated import projects_pb2
from modules.others import models, db_connection
from modules.others.decorators import grpc_response

# Get CPU count for parallel processing
CPU_COUNT = os.cpu_count() or 1


class IDWEstimator:
    """
    Inverse Distance Weighting (IDW) spatial interpolation estimator.
    
    Uses a KDTree for efficient nearest neighbor queries and supports
    parallel processing for large datasets.
    """
    
    def __init__(self):
        """Initialize the IDW estimator."""
        self._coords: Optional[np.ndarray] = None
        self._scalars: Optional[np.ndarray] = None
        self._kdtree: Optional[KDTree] = None
    
    def setup(
        self,
        coords: Union[Iterable, np.ndarray],
        scalars: Union[Iterable, np.ndarray]
    ) -> "IDWEstimator":
        """
        Setup the estimator with sample coordinates and values.
        
        Args:
            coords: Sample coordinates. Array of shape (N, D) where N is 
                    the number of samples and D is the dimensionality.
            scalars: Sample values. Array of shape (N,) or (N, 1).
        
        Returns:
            Self for method chaining.
        """
        self._coords = np.array(copy.deepcopy(coords))
        self._scalars = np.array(copy.deepcopy(scalars)).flatten()
        self._kdtree = KDTree(self._coords)
        return self
    
    def _get_distances(
        self,
        coords: np.ndarray,
        k: int = 10,
        parallel: bool = False
    ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Query the KDTree to get the k nearest neighbors distances and values.
        
        Args:
            coords: Points to estimate. Shape (M, D).
            k: Number of nearest neighbors.
            parallel: Run query in parallel or not.
        
        Returns:
            Tuple of (indexes, distances, values) for the k nearest neighbors.
        
        Raises:
            ValueError: If estimator is not initialized.
        """
        if self._kdtree is None or self._scalars is None or self._coords is None:
            logging.error("Uninitialized estimator. Call setup first.")
            raise ValueError("Uninitialized estimator. Call setup first.")
        
        # Query KDTree for k nearest neighbors
        distances, indexes = self._kdtree.query(
            coords,
            k,
            eps=1e-8,
            p=2,  # Euclidean distance
            workers=CPU_COUNT if parallel else 1
        )
        
        # Get the scalar values at those indexes
        values = self._scalars[indexes]
        
        return indexes, distances, values
    
    def estimate_single(
        self,
        coord: Union[Iterable, np.ndarray],
        distances: Optional[np.ndarray] = None,
        values: Optional[np.ndarray] = None,
        k: int = 10,
        p: float = 2.0
    ) -> Optional[float]:
        """
        Calculate IDW for a single unknown location.
        
        If distances and values are set, these are not re-calculated and coord 
        can be None. If coord is not None but distances and values are, then 
        new distances and values are calculated using the existing KDTree.
        
        Args:
            coord: Coordinate of the point to estimate.
            distances: Pre-calculated distances to neighbors.
            values: Pre-calculated values of neighbors.
            k: Number of nearest neighbors to use.
            p: Power parameter for distance weighting (default: 2).
        
        Returns:
            Estimated value or None if calculation fails.
        """
        if distances is None and values is None and coord is not None:
            # Clamp k to available samples
            k = min(k, len(self._scalars)) if self._scalars is not None else k
            _, distances, values = self._get_distances(
                coords=np.array([coord]),
                k=k
            )
            # Flatten for single point
            distances = distances.flatten()
            values = values.flatten()
        
        if distances is not None and values is not None:
            # Handle zero distances (point coincides with a sample)
            if np.any(distances == 0):
                zero_mask = distances == 0
                return float(np.mean(values[zero_mask]))
            
            # Calculate inverse distance weights
            weights = 1.0 / np.power(distances, p)
            
            # Weighted average
            return float(np.sum(weights * values) / np.sum(weights))
        
        return None
    
    def estimate_batch(
        self,
        coords: Union[Iterable, np.ndarray],
        k: int = 10,
        p: float = 2.0,
        parallel: bool = True
    ) -> np.ndarray:
        """
        Calculate IDW for multiple unknown locations efficiently.
        
        Args:
            coords: Coordinates of points to estimate. Shape (M, D).
            k: Number of nearest neighbors to use.
            p: Power parameter for distance weighting (default: 2).
            parallel: Use parallel processing for KDTree queries.
        
        Returns:
            Array of estimated values with shape (M,).
        """
        coords = np.array(coords)
        
        # Clamp k to available samples
        k = min(k, len(self._scalars)) if self._scalars is not None else k
        
        # Get distances and values for all points at once
        _, distances, values = self._get_distances(coords, k=k, parallel=parallel)
        
        # Handle zero distances
        zero_mask = distances == 0
        
        # Calculate weights (avoid division by zero)
        with np.errstate(divide='ignore', invalid='ignore'):
            weights = 1.0 / np.power(distances, p)
        
        # Where distance is zero, set weight to infinity (will be handled)
        weights[zero_mask] = np.inf
        
        # For each row, if any weight is inf, use only those values
        results = np.zeros(len(coords))
        
        for i in range(len(coords)):
            row_weights = weights[i]
            row_values = values[i]
            
            if np.any(np.isinf(row_weights)):
                # Use mean of coincident points
                inf_mask = np.isinf(row_weights)
                results[i] = np.mean(row_values[inf_mask])
            else:
                # Standard weighted average
                results[i] = np.sum(row_weights * row_values) / np.sum(row_weights)
        
        return results


class IDWManager:
    """
    Manager class for IDW operations integrated with gRPC and database.
    """
    
    def __init__(self, engine: Engine):
        """
        Initialize IDWManager.
        
        Args:
            engine: SQLAlchemy Engine instance.
        """
        self.engine = engine
    
    def _get_table_name(self, file_id: str) -> str:
        """Get table name for file."""
        return db_connection.get_table_name(file_id)
    
    def _ensure_table_exists(self, table_name: str) -> bool:
        """Check if table exists."""
        return db_connection.check_duckdb_table_exists(self.engine, table_name)
    
    def _get_dataset_by_file_id(self, file_id: str) -> Optional[models.Dataset]:
        """Get dataset record by file_id."""
        with Session(self.engine) as session:
            statement = select(models.Dataset).where(models.Dataset.file_id == file_id)
            return session.exec(statement).first()
    
    def _get_coordinate_columns(
        self,
        file_id: str,
        x_col: Optional[str] = None,
        y_col: Optional[str] = None,
        z_col: Optional[str] = None
    ) -> Tuple[str, str, Optional[str]]:
        """
        Get coordinate column names from dataset mappings or explicit parameters.
        
        Returns:
            Tuple of (x_column, y_column, z_column).
        """
        # If explicitly provided, use those
        if x_col and y_col:
            return x_col, y_col, z_col
        
        # Try to get from dataset column mappings
        dataset = self._get_dataset_by_file_id(file_id)
        if dataset and dataset.column_mappings:
            import json
            try:
                mappings = json.loads(dataset.column_mappings)
                x_mapped = None
                y_mapped = None
                z_mapped = None
                
                for mapping in mappings:
                    if mapping.get('is_coordinate'):
                        field = mapping.get('mapped_field', '').lower()
                        col_name = mapping.get('column_name')
                        if field == 'x':
                            x_mapped = col_name
                        elif field == 'y':
                            y_mapped = col_name
                        elif field == 'z':
                            z_mapped = col_name
                
                if x_mapped and y_mapped:
                    return x_mapped, y_mapped, z_mapped
            except (json.JSONDecodeError, KeyError):
                pass
        
        # Default fallback
        return 'x', 'y', 'z'
    
    @grpc_response(projects_pb2.CalculateIdwResponse)
    def calculate_idw(
        self,
        request: "projects_pb2.CalculateIdwRequest"
    ) -> "projects_pb2.CalculateIdwResponse":
        """
        Calculate IDW estimation from drill holes to block model.
        
        Args:
            request: CalculateIdwRequest containing block model file_id,
                     drill holes file_id, variable to estimate, and parameters.
        
        Returns:
            CalculateIdwResponse with success status and statistics.
        """
        block_model_file_id = request.block_model_file_id
        drill_holes_file_id = request.drill_holes_file_id
        variable = request.variable
        output_variable = request.output_variable or f"{variable}_est"
        power = request.power if request.power > 0 else 2.0
        num_samples = request.num_samples if request.num_samples > 0 else 5
        
        # Get table names
        block_table = self._get_table_name(block_model_file_id)
        drill_table = self._get_table_name(drill_holes_file_id)
        
        # Validate tables exist
        if not self._ensure_table_exists(block_table):
            response = projects_pb2.CalculateIdwResponse()
            response.success = False
            response.error_message = f"Block model table not found: {block_model_file_id}"
            return response
        
        if not self._ensure_table_exists(drill_table):
            response = projects_pb2.CalculateIdwResponse()
            response.success = False
            response.error_message = f"Drill holes table not found: {drill_holes_file_id}"
            return response
        
        # Get coordinate columns for both datasets
        block_x, block_y, block_z = self._get_coordinate_columns(
            block_model_file_id,
            request.block_x_col if request.block_x_col else None,
            request.block_y_col if request.block_y_col else None,
            request.block_z_col if request.block_z_col else None
        )
        
        drill_x, drill_y, drill_z = self._get_coordinate_columns(
            drill_holes_file_id,
            request.drill_x_col if request.drill_x_col else None,
            request.drill_y_col if request.drill_y_col else None,
            request.drill_z_col if request.drill_z_col else None
        )
        
        with self.engine.connect() as conn:
            # Validate variable exists in drill holes
            drill_columns = db_connection.get_table_columns(self.engine, drill_table)
            if variable not in drill_columns:
                response = projects_pb2.CalculateIdwResponse()
                response.success = False
                response.error_message = f"Variable '{variable}' not found in drill holes dataset"
                return response
            
            # Check if output column exists, if so drop it first
            block_columns = db_connection.get_table_columns(self.engine, block_table)
            
            # Build coordinate column list for drill holes (2D or 3D)
            if drill_z and drill_z in drill_columns:
                drill_coord_cols = f'"{drill_x}", "{drill_y}", "{drill_z}"'
            else:
                drill_coord_cols = f'"{drill_x}", "{drill_y}"'
            
            # Build coordinate column list for block model (2D or 3D)
            if block_z and block_z in block_columns:
                block_coord_cols = f'"{block_x}", "{block_y}", "{block_z}"'
            else:
                block_coord_cols = f'"{block_x}", "{block_y}"'
            
            # Fetch drill holes data (coordinates + variable)
            drill_query = f'''
                SELECT {drill_coord_cols}, "{variable}"
                FROM {drill_table}
                WHERE "{variable}" IS NOT NULL
            '''
            drill_result = conn.execute(text(drill_query)).fetchall()
            
            if len(drill_result) == 0:
                response = projects_pb2.CalculateIdwResponse()
                response.success = False
                response.error_message = f"No valid data found for variable '{variable}' in drill holes"
                return response
            
            # Parse drill holes data
            drill_data = np.array(drill_result)
            drill_coords = drill_data[:, :-1].astype(float)
            drill_values = drill_data[:, -1].astype(float)
            
            # Filter out rows with NaN or inf values in coordinates or values
            valid_coords_mask = np.all(np.isfinite(drill_coords), axis=1)
            valid_values_mask = np.isfinite(drill_values)
            valid_mask = valid_coords_mask & valid_values_mask
            
            drill_coords = drill_coords[valid_mask]
            drill_values = drill_values[valid_mask]
            
            if len(drill_coords) == 0:
                response = projects_pb2.CalculateIdwResponse()
                response.success = False
                response.error_message = f"No valid finite data found for variable '{variable}' in drill holes (all values are NaN or infinite)"
                return response
            
            # Fetch block model coordinates
            block_query = f'''
                SELECT rowid, {block_coord_cols}
                FROM {block_table}
            '''
            block_result = conn.execute(text(block_query)).fetchall()
            
            if len(block_result) == 0:
                response = projects_pb2.CalculateIdwResponse()
                response.success = False
                response.error_message = "Block model is empty"
                return response
            
            block_data = np.array(block_result)
            block_rowids = block_data[:, 0].astype(int)
            block_coords = block_data[:, 1:].astype(float)
            
            # Filter out blocks with NaN or inf coordinates
            valid_block_mask = np.all(np.isfinite(block_coords), axis=1)
            block_rowids = block_rowids[valid_block_mask]
            block_coords = block_coords[valid_block_mask]
            
            if len(block_coords) == 0:
                response = projects_pb2.CalculateIdwResponse()
                response.success = False
                response.error_message = "No valid finite coordinates found in block model"
                return response
            
            # Initialize IDW estimator
            estimator = IDWEstimator()
            estimator.setup(coords=drill_coords, scalars=drill_values)
            
            # Clamp num_samples to available drill holes
            num_samples = min(num_samples, len(drill_values))
            
            # Estimate values for all block centroids
            estimated_values = estimator.estimate_batch(
                coords=block_coords,
                k=num_samples,
                p=power,
                parallel=True
            )
        
        # Write results in a separate connection with explicit transaction
        with self.engine.connect() as conn:
            with conn.begin():
                # Add column if it doesn't exist
                if output_variable not in block_columns:
                    conn.execute(text(
                        f'ALTER TABLE {block_table} ADD COLUMN "{output_variable}" DOUBLE'
                    ))
                
                # Update values using rowid
                # For efficiency, we'll use a CASE statement in batches
                batch_size = 1000
                for i in range(0, len(block_rowids), batch_size):
                    batch_rids = block_rowids[i:i + batch_size]
                    batch_vals = estimated_values[i:i + batch_size]
                    
                    # Build CASE statement
                    cases = " ".join(
                        f"WHEN {rid} THEN {val}"
                        for rid, val in zip(batch_rids, batch_vals)
                    )
                    rowid_list = ",".join(str(rid) for rid in batch_rids)
                    
                    update_sql = f'''
                        UPDATE {block_table}
                        SET "{output_variable}" = CASE rowid {cases} END
                        WHERE rowid IN ({rowid_list})
                    '''
                    conn.execute(text(update_sql))
        
        # Calculate statistics
        min_val = float(np.min(estimated_values))
        max_val = float(np.max(estimated_values))
        mean_val = float(np.mean(estimated_values))
        std_val = float(np.std(estimated_values))
        
        response = projects_pb2.CalculateIdwResponse()
        response.success = True
        response.output_variable = output_variable
        response.blocks_estimated = len(estimated_values)
        response.samples_used = len(drill_values)
        response.min_value = min_val
        response.max_value = max_val
        response.mean_value = mean_val
        response.std_value = std_val
        
        return response

