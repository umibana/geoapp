#!/usr/bin/env python
"""
Exploratory Data Analysis (EDA) manager module
Handles data fetching, statistics computation, and visualization data
"""
import json
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import pandas as pd
from sqlalchemy import Engine, text
from sqlmodel import Session, select

from generated import projects_pb2
from modules.others import models, db_connection
from modules.others.decorators import grpc_response
from modules.others.statistics_service import StatisticsService
from modules.others.column_mappings import is_numeric_column_type


class EDAManager:
    """Manager for exploratory data analysis operations"""
    
    def __init__(self, engine: Engine):
        """
        Initialize EDAManager.
        
        Args:
            engine: SQLAlchemy Engine instance
        """
        self.engine = engine
        self.statistics = StatisticsService(engine)
    
    # ========== Dataset Access ==========
    
    def get_dataset_by_id(self, dataset_id: str) -> Optional[models.Dataset]:
        """Get dataset by ID."""
        with Session(self.engine) as session:
            dataset = session.get(models.Dataset, dataset_id)
            if dataset:
                session.refresh(dataset)
            return dataset
    
    # ========== Delegate Methods for Backwards Compatibility ==========
    
    def store_column_statistics(self, dataset_id: str, column_stats: Dict[str, Dict[str, Any]]) -> None:
        """Store statistics for dataset columns."""
        self.statistics.store_statistics(dataset_id, column_stats)
    
    def recalculate_file_statistics(self, file_id: str) -> bool:
        """Recalculate statistics for a file."""
        return self.statistics.recalculate_for_file(file_id)
    
    def get_dataset_boundaries(self, dataset_id: str) -> Dict[str, Dict[str, float]]:
        """Get dataset boundaries from stored statistics."""
        return self.statistics.get_boundaries(dataset_id)
    
    def _generate_statistics_from_duckdb(self, file_id: str) -> Dict[str, Dict[str, Any]]:
        """Generate statistics from DuckDB table."""
        return self.statistics.generate_statistics_from_file(file_id)
    
    # ========== Data Fetching ==========
    
    def get_dataset_data_and_stats_combined(
        self, 
        dataset_id: str, 
        columns: List[str], 
        bounding_box: List[float] = None,
        filter_columns: List[str] = None
    ) -> Tuple[np.ndarray, Dict[str, Dict[str, float]]]:
        """
        Get dataset data with optional bounding box filtering.

        Args:
            dataset_id: The dataset ID
            columns: List of column names to fetch
            bounding_box: Optional [x1, x2, y1, y2] or [x1, x2, y1, y2, z1, z2]
            filter_columns: Optional [x_col, y_col, z_col] for bbox filtering

        Returns:
            Tuple of (flat_numpy_array, boundaries_dict)
        """
        try:
            dataset = self.get_dataset_by_id(dataset_id)
            if not dataset:
                return np.array([], dtype=np.float32), {}

            table_name = dataset.duckdb_table_name
            quoted_columns = [f'"{col}"' for col in columns]
            data_query = f'SELECT {", ".join(quoted_columns)} FROM {table_name}'

            with self.engine.connect() as conn:
                duckdb_conn = conn.connection.connection
                rows_data = duckdb_conn.execute(data_query).fetchnumpy()

            if not rows_data or len(rows_data[columns[0]]) == 0:
                return np.array([], dtype=np.float32), {}

            # Apply bounding box filter
            if bounding_box and len(bounding_box) in [4, 6]:
                rows_data = self._apply_bbox_filter(rows_data, columns, bounding_box, filter_columns)

            num_points = len(rows_data[columns[0]])
            if num_points == 0:
                return np.array([], dtype=np.float32), {}

            # Interleave columns into flat array
            flat_numpy = self._interleave_columns(rows_data, columns, num_points)

            # Calculate boundaries
            boundaries = self._calculate_boundaries(rows_data, columns)

            return flat_numpy, boundaries

        except Exception as e:
            print(f"[ERROR] Error in get_dataset_data_and_stats_combined: {e}")
            return np.array([], dtype=np.float32), {}
    
    def _apply_bbox_filter(
        self, 
        rows_data: dict, 
        columns: List[str], 
        bounding_box: List[float],
        filter_columns: Optional[List[str]]
    ) -> dict:
        """Apply bounding box filter to data."""
        x1, x2, y1, y2 = bounding_box[0:4]
        is_3d = len(bounding_box) == 6
        z1, z2 = (bounding_box[4], bounding_box[5]) if is_3d else (None, None)

        # Determine filter columns
        if filter_columns and len(filter_columns) >= 2:
            x_col, y_col = filter_columns[0], filter_columns[1]
            z_col = filter_columns[2] if len(filter_columns) >= 3 else None
        else:
            x_col, y_col = columns[0], columns[1]
            z_col = columns[2] if len(columns) >= 3 else None

        # Build mask
        mask = (
            (rows_data[x_col] >= x1) & (rows_data[x_col] <= x2) & 
            (rows_data[y_col] >= y1) & (rows_data[y_col] <= y2)
        )

        if is_3d and z1 is not None and z2 is not None and z_col:
            mask = mask & (rows_data[z_col] >= z1) & (rows_data[z_col] <= z2)

        # Apply mask to all columns
        for col in columns:
            rows_data[col] = rows_data[col][mask]

        return rows_data
    
    def _interleave_columns(self, rows_data: dict, columns: List[str], num_points: int) -> np.ndarray:
        """Interleave column data into flat array."""
        num_cols = len(columns)
        flat_numpy = np.empty(num_points * num_cols, dtype=np.float32)

        for i, col in enumerate(columns):
            col_data = rows_data[col]
            try:
                flat_numpy[i::num_cols] = col_data.astype(np.float32, copy=False)
            except (ValueError, TypeError):
                numeric_data = pd.to_numeric(col_data, errors='coerce')
                flat_numpy[i::num_cols] = numeric_data.astype(np.float32)

        return flat_numpy
    
    def _calculate_boundaries(self, rows_data: dict, columns: List[str]) -> Dict[str, Dict[str, float]]:
        """Calculate min/max boundaries for columns."""
        boundaries = {}
        for col in columns:
            col_data = rows_data[col]
            if np.issubdtype(col_data.dtype, np.number):
                mask = ~np.isnan(col_data)
                valid_data = col_data[mask]
                if len(valid_data) > 0:
                    boundaries[col] = {
                        'min_value': float(np.min(valid_data)),
                        'max_value': float(np.max(valid_data)),
                        'valid_count': len(valid_data)
                    }
        return boundaries
    
    # ========== Chart Computations ==========
    
    def compute_histogram(self, data: np.ndarray, column_name: str, num_bins: int = 30) -> Dict:
        """Compute histogram data for a column."""
        if len(data) == 0:
            return {}

        data = data[~np.isnan(data)]
        if len(data) == 0:
            return {}

        min_val = float(np.min(data))
        max_val = float(np.max(data))

        # Handle edge case: all values are the same or range is too small for bins
        if min_val == max_val:
            # All values are identical - create a single bin
            return {
                'bin_ranges': [f"{min_val:.2f}"],
                'bin_counts': [len(data)],
                'bin_edges': [min_val, min_val],
                'num_bins': 1,
                'min_value': min_val,
                'max_value': max_val,
                'total_count': len(data)
            }

        # Limit bins to avoid "too many bins" error for small ranges
        # Use fewer bins if we have fewer unique values or small range
        unique_count = len(np.unique(data))
        actual_bins = min(num_bins, unique_count, len(data))
        if actual_bins < 1:
            actual_bins = 1

        try:
            counts, bin_edges = np.histogram(data, bins=actual_bins, range=(min_val, max_val))
        except ValueError:
            # Fallback: if histogram still fails, use a single bin
            return {
                'bin_ranges': [f"{min_val:.2f} - {max_val:.2f}"],
                'bin_counts': [len(data)],
                'bin_edges': [min_val, max_val],
                'num_bins': 1,
                'min_value': min_val,
                'max_value': max_val,
                'total_count': len(data)
            }

        return {
            'bin_ranges': [f"{bin_edges[i]:.2f} - {bin_edges[i+1]:.2f}" for i in range(len(counts))],
            'bin_counts': counts.astype(int).tolist(),
            'bin_edges': bin_edges.tolist(),
            'num_bins': actual_bins,
            'min_value': min_val,
            'max_value': max_val,
            'total_count': len(data)
        }
    
    def compute_boxplot(self, data: np.ndarray, column_name: str) -> Dict:
        """Compute box plot statistics for a column."""
        if len(data) == 0:
            return {}

        data = data[~np.isnan(data)]
        if len(data) == 0:
            return {}

        q1 = float(np.percentile(data, 25))
        median = float(np.percentile(data, 50))
        q3 = float(np.percentile(data, 75))
        iqr = q3 - q1
        lower_fence = q1 - 1.5 * iqr
        upper_fence = q3 + 1.5 * iqr

        outliers = data[(data < lower_fence) | (data > upper_fence)]
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
    
    def compute_heatmap(
        self, 
        x_data: np.ndarray, 
        y_data: np.ndarray, 
        value_data: np.ndarray,
        x_column: str, 
        y_column: str, 
        value_column: str,
        grid_size: int = 50
    ) -> Dict:
        """Compute 2D heatmap aggregation."""
        if len(x_data) == 0 or len(y_data) == 0 or len(value_data) == 0:
            return {}

        # Remove NaN values
        mask = ~(np.isnan(x_data) | np.isnan(y_data) | np.isnan(value_data))
        x_data = x_data[mask]
        y_data = y_data[mask]
        value_data = value_data[mask]

        if len(x_data) == 0:
            return {}

        min_x, max_x = float(np.min(x_data)), float(np.max(x_data))
        min_y, max_y = float(np.min(y_data)), float(np.max(y_data))
        x_bin_size = (max_x - min_x) / grid_size
        y_bin_size = (max_y - min_y) / grid_size

        x_bins = np.clip(np.floor((x_data - min_x) / x_bin_size).astype(int), 0, grid_size - 1)
        y_bins = np.clip(np.floor((y_data - min_y) / y_bin_size).astype(int), 0, grid_size - 1)

        # Aggregate
        cell_sums = {}
        cell_counts = {}
        for i in range(len(x_data)):
            key = (x_bins[i], y_bins[i])
            if key not in cell_sums:
                cell_sums[key] = 0.0
                cell_counts[key] = 0
            cell_sums[key] += value_data[i]
            cell_counts[key] += 1

        cells = [
            {
                'x_index': int(x_idx),
                'y_index': int(y_idx),
                'avg_value': float(total / cell_counts[(x_idx, y_idx)]),
                'count': int(cell_counts[(x_idx, y_idx)])
            }
            for (x_idx, y_idx), total in cell_sums.items()
        ]

        avg_values = [c['avg_value'] for c in cells]
        
        return {
            'cells': cells,
            'grid_size_x': grid_size,
            'grid_size_y': grid_size,
            'min_value': float(np.min(avg_values)) if avg_values else 0.0,
            'max_value': float(np.max(avg_values)) if avg_values else 0.0,
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
    
    # ========== gRPC Endpoints ==========
    
    @grpc_response(projects_pb2.GetFileStatisticsResponse)
    def get_file_statistics(self, request: projects_pb2.GetFileStatisticsRequest) -> projects_pb2.GetFileStatisticsResponse:
        """Get file statistics."""
        column_names = list(request.columns) if request.columns else None

        with Session(self.engine) as session:
            dataset = session.exec(
                select(models.Dataset).where(models.Dataset.file_id == request.file_id)
            ).first()

            if not dataset:
                # Generate from DuckDB directly
                statistics = self._get_stats_from_duckdb(request.file_id, column_names)
            else:
                # Get from stored stats
                statistics = self._get_stored_stats(dataset.id, column_names, session)

        response = projects_pb2.GetFileStatisticsResponse()
        response.success = True

        for col_name, stats in statistics.items():
            self._populate_stat_response(response.statistics.add(), col_name, stats)

        return response
    
    def _get_stats_from_duckdb(self, file_id: str, column_names: Optional[List[str]]) -> Dict:
        """Get statistics directly from DuckDB."""
        table_name = db_connection.get_table_name(file_id)
        
        if not db_connection.check_duckdb_table_exists(self.engine, table_name):
            return {}

        with self.engine.connect() as conn:
            duckdb_conn = conn.connection.connection
            df = duckdb_conn.execute(f"SELECT * FROM {table_name}").df()

        if df.empty:
            return {}

        if column_names:
            df = df[[c for c in column_names if c in df.columns]]

        return self._compute_stats_from_df(df)
    
    def _get_stored_stats(self, dataset_id: str, column_names: Optional[List[str]], session) -> Dict:
        """Get stored statistics from database."""
        query = select(models.DatasetColumnStats).where(
            models.DatasetColumnStats.dataset_id == dataset_id
        )
        
        if column_names:
            query = query.where(models.DatasetColumnStats.column_name.in_(column_names))

        stats = session.exec(query).all()
        
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
    
    def _compute_stats_from_df(self, df: pd.DataFrame) -> Dict:
        """Compute statistics from DataFrame."""
        numeric_describe = df.select_dtypes(include=[np.number]).describe()
        numeric_columns = list(numeric_describe.columns)
        categorical_columns = [c for c in df.columns if c not in numeric_columns]

        statistics = {}

        for col in numeric_columns:
            col_stats = numeric_describe[col]
            statistics[col] = {
                'column_type': 'numeric',
                'count': int(col_stats.get('count', 0)),
                'mean': self._safe_float(col_stats.get('mean')),
                'std': self._safe_float(col_stats.get('std')),
                'min': self._safe_float(col_stats.get('min')),
                'q25': self._safe_float(col_stats.get('25%')),
                'q50': self._safe_float(col_stats.get('50%')),
                'q75': self._safe_float(col_stats.get('75%')),
                'max': self._safe_float(col_stats.get('max')),
                'null_count': int(df[col].isnull().sum()),
                'unique_count': int(df[col].nunique()),
            }

        for col in categorical_columns:
            value_counts = df[col].value_counts()
            statistics[col] = {
                'column_type': 'categorical',
                'count': int(df[col].count()),
                'null_count': int(df[col].isnull().sum()),
                'unique_count': int(df[col].nunique()),
                'top_values': value_counts.index.tolist()[:10],
                'top_counts': value_counts.values.tolist()[:10]
            }

        return statistics
    
    def _safe_float(self, value) -> Optional[float]:
        """Convert to float, None for NaN/None."""
        if value is None or pd.isna(value):
            return None
        return float(value)
    
    def _populate_stat_response(self, col_stat, col_name: str, stats: Dict) -> None:
        """Populate a column statistics response."""
        col_stat.column_name = col_name
        col_stat.data_type = stats.get('column_type', 'numeric')
        col_stat.count = stats.get('count', 0)
        col_stat.null_count = stats.get('null_count', 0)
        col_stat.unique_count = stats.get('unique_count', 0)

        if stats.get('column_type') == 'numeric':
            if stats.get('mean') is not None:
                col_stat.mean = stats['mean']
            if stats.get('std') is not None:
                col_stat.std = stats['std']
            if stats.get('min') is not None:
                col_stat.min = stats['min']
            if stats.get('q25') is not None:
                col_stat.q25 = stats['q25']
            if stats.get('q50') is not None:
                col_stat.q50 = stats['q50']
            if stats.get('q75') is not None:
                col_stat.q75 = stats['q75']
            if stats.get('max') is not None:
                col_stat.max = stats['max']

        if stats.get('column_type') == 'categorical':
            if stats.get('top_values'):
                col_stat.top_values.extend(stats['top_values'])
            if stats.get('top_counts'):
                col_stat.top_counts.extend(stats['top_counts'])
    
    def get_dataset_data(self, request: projects_pb2.GetDatasetDataRequest) -> projects_pb2.GetDatasetDataResponse:
        """Get dataset data with statistics computation."""
        try:
            viz_columns = list(request.columns) if request.columns else ["x", "y", "z"]

            dataset = self.get_dataset_by_id(request.dataset_id)
            if not dataset:
                return projects_pb2.GetDatasetDataResponse()

            # Get all numeric columns for statistics
            column_mappings = json.loads(dataset.column_mappings) if dataset.column_mappings else []
            all_numeric_columns = [
                m['column_name'] for m in column_mappings 
                if is_numeric_column_type(m.get('column_type'))
            ]

            # Get coordinate columns for filtering
            coord_columns = {}
            for m in column_mappings:
                if m.get('is_coordinate') and m.get('mapped_field') in ['x', 'y', 'z']:
                    coord_columns[m['mapped_field']] = m['column_name']

            filter_columns = [
                coord_columns.get('x', viz_columns[0] if viz_columns else 'x'),
                coord_columns.get('y', viz_columns[1] if len(viz_columns) > 1 else 'y'),
                coord_columns.get('z', viz_columns[2] if len(viz_columns) > 2 else 'z')
            ]

            bounding_box = list(request.bounding_box) if request.bounding_box else None

            # Get visualization data
            data, boundaries = self.get_dataset_data_and_stats_combined(
                request.dataset_id, viz_columns, bounding_box=bounding_box
            )

            # Get all numeric columns data for statistics
            if all_numeric_columns:
                all_data, all_boundaries = self.get_dataset_data_and_stats_combined(
                    request.dataset_id, all_numeric_columns,
                    bounding_box=bounding_box, filter_columns=filter_columns
                )
            else:
                all_data = np.array([], dtype=np.float32)

            # Build response
            response = projects_pb2.GetDatasetDataResponse()
            response.binary_data = data.tobytes()
            response.data_length = len(data)
            response.total_count = len(data) // 3 if len(viz_columns) >= 3 else len(data)

            # Add boundaries
            for col_name, stats in boundaries.items():
                boundary = response.data_boundaries.add()
                boundary.column_name = col_name
                boundary.min_value = float(stats['min_value'])
                boundary.max_value = float(stats['max_value'])
                boundary.valid_count = int(stats['valid_count'])

            # Compute statistics if we have data
            if len(all_data) > 0 and len(all_numeric_columns) > 0:
                self._compute_all_statistics(response, all_data, all_numeric_columns, viz_columns)

            return response

        except Exception as e:
            import traceback
            print(f"[ERROR] Error in get_dataset_data: {e}")
            traceback.print_exc()
            return projects_pb2.GetDatasetDataResponse()
    
    def _compute_all_statistics(
        self, 
        response, 
        all_data: np.ndarray, 
        all_numeric_columns: List[str],
        viz_columns: List[str]
    ) -> None:
        """Compute and add all statistics to response."""
        num_cols = len(all_numeric_columns)
        
        # Histograms and box plots
        for i, col_name in enumerate(all_numeric_columns):
            col_data = all_data[i::num_cols]
            
            histogram = self.compute_histogram(col_data, col_name, num_bins=30)
            if histogram:
                hist_proto = response.histograms[col_name]
                hist_proto.bin_ranges.extend(histogram['bin_ranges'])
                hist_proto.bin_counts.extend(histogram['bin_counts'])
                hist_proto.bin_edges.extend(histogram['bin_edges'])
                hist_proto.num_bins = histogram['num_bins']
                hist_proto.min_value = histogram['min_value']
                hist_proto.max_value = histogram['max_value']
                hist_proto.total_count = histogram['total_count']

            boxplot = self.compute_boxplot(col_data, col_name)
            if boxplot:
                bp = response.box_plots.add()
                bp.column_name = boxplot['column_name']
                bp.min = boxplot['min']
                bp.q1 = boxplot['q1']
                bp.median = boxplot['median']
                bp.q3 = boxplot['q3']
                bp.max = boxplot['max']
                bp.mean = boxplot['mean']
                bp.outliers.extend(boxplot['outliers'])
                bp.lower_fence = boxplot['lower_fence']
                bp.upper_fence = boxplot['upper_fence']
                bp.iqr = boxplot['iqr']
                bp.total_count = boxplot['total_count']

        # Heatmap
        if len(viz_columns) >= 3:
            x_idx = all_numeric_columns.index(viz_columns[0]) if viz_columns[0] in all_numeric_columns else 0
            y_idx = all_numeric_columns.index(viz_columns[1]) if viz_columns[1] in all_numeric_columns else 1
            z_idx = all_numeric_columns.index(viz_columns[2]) if viz_columns[2] in all_numeric_columns else 2

            x_data = all_data[x_idx::num_cols]
            y_data = all_data[y_idx::num_cols]
            z_data = all_data[z_idx::num_cols]

            heatmap = self.compute_heatmap(x_data, y_data, z_data, viz_columns[0], viz_columns[1], viz_columns[2])

            if heatmap and heatmap.get('cells'):
                hm = response.heatmap
                for cell in heatmap['cells']:
                    cell_proto = hm.cells.add()
                    cell_proto.x_index = cell['x_index']
                    cell_proto.y_index = cell['y_index']
                    cell_proto.avg_value = cell['avg_value']
                    cell_proto.count = cell['count']

                hm.grid_size_x = heatmap['grid_size_x']
                hm.grid_size_y = heatmap['grid_size_y']
                hm.min_value = heatmap['min_value']
                hm.max_value = heatmap['max_value']
                hm.x_bin_size = heatmap['x_bin_size']
                hm.y_bin_size = heatmap['y_bin_size']
                hm.min_x = heatmap['min_x']
                hm.max_x = heatmap['max_x']
                hm.min_y = heatmap['min_y']
                hm.max_y = heatmap['max_y']
                hm.x_column = heatmap['x_column']
                hm.y_column = heatmap['y_column']
                hm.value_column = heatmap['value_column']
    
    @grpc_response(projects_pb2.GetDatasetTableDataResponse)
    def get_dataset_table_data(self, request: projects_pb2.GetDatasetTableDataRequest) -> projects_pb2.GetDatasetTableDataResponse:
        """Get paginated table data for dataset."""
        dataset = self.get_dataset_by_id(request.dataset_id)
        if not dataset:
            response = projects_pb2.GetDatasetTableDataResponse()
            response.success = False
            response.error_message = "Dataset not found"
            return response

        column_mappings = json.loads(dataset.column_mappings) if dataset.column_mappings else []

        if request.columns and len(request.columns) > 0:
            columns_to_fetch = list(request.columns)
        else:
            # Handle both integer (1) and string ('COLUMN_TYPE_NUMERIC') column_type values
            columns_to_fetch = [
                m['column_name'] for m in column_mappings 
                if is_numeric_column_type(m.get('column_type'))
            ]

        if not columns_to_fetch:
            response = projects_pb2.GetDatasetTableDataResponse()
            response.success = False
            response.error_message = "No numeric columns available"
            return response

        table_name = dataset.duckdb_table_name
        columns_str = ', '.join(f'"{col}"' for col in columns_to_fetch)

        with self.engine.connect() as conn:
            result = conn.execute(text(f"""
                SELECT {columns_str} FROM {table_name}
                LIMIT {request.limit} OFFSET {request.offset}
            """))
            rows_data = result.fetchall()

        response = projects_pb2.GetDatasetTableDataResponse()
        response.success = True
        response.total_rows = dataset.total_rows
        response.column_names.extend(columns_to_fetch)

        for row in rows_data:
            table_row = response.rows.add()
            for i, col_name in enumerate(columns_to_fetch):
                table_row.values[col_name] = float(row[i]) if row[i] is not None else 0.0

        return response