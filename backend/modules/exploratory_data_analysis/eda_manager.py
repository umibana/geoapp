#!/usr/bin/env python
"""
Exploratory Data Analysis (EDA) manager module
Handles data fetching, statistics computation, and visualization data
"""
import json
import time
from typing import List, Dict, Any, Optional, Tuple
import numpy as np
import pandas as pd
from sqlalchemy import Engine, text
from sqlmodel import Session, select

from generated import projects_pb2
from modules.others import models, db_connection


class EDAManager:
    """Manager for exploratory data analysis operations"""
    
    def __init__(self, engine: Engine):
        """
        Initialize EDAManager
        
        Args:
            engine: SQLAlchemy Engine instance
        """
        self.engine = engine
    
    def get_dataset_by_id(self, dataset_id: str) -> Optional[models.Dataset]:
        """Get dataset by ID"""
        with Session(self.engine) as session:
            dataset = session.get(models.Dataset, dataset_id)
            if dataset:
                session.refresh(dataset)
            return dataset
    
    def get_dataset_data_and_stats_combined(self, dataset_id: str, columns: List[str], bounding_box: List[float] = None,
                                            filter_columns: List[str] = None) -> Tuple[np.ndarray, Dict[str, Dict[str, float]]]:
        """
        Get dataset data with optional bounding box filtering

        Args:
            dataset_id: The dataset ID
            columns: List of column names to fetch (can be 3 for viz or many for statistics)
            bounding_box: Optional bounding box [x1, x2, y1, y2] for 2D or [x1, x2, y1, y2, z1, z2] for 3D
            filter_columns: Optional list [x_col, y_col, z_col] to use for bounding box filtering.
                           If not provided, uses columns[0], columns[1], columns[2]

        Returns:
            Tuple of (flat_numpy_array, boundaries_dict)
        """
        try:
            dataset = self.get_dataset_by_id(dataset_id)
            if not dataset:
                return np.array([], dtype=np.float32), {}

            table_name = dataset.duckdb_table_name

            # Build query for all requested columns - quote column names to handle special characters
            quoted_columns = [f'"{col}"' for col in columns]
            data_query = f'SELECT {", ".join(quoted_columns)} FROM {table_name}'

            # Get data using DuckDB's fetchnumpy for optimal performance
            with self.engine.connect() as conn:
                duckdb_conn = conn.connection.connection
                rows_data = duckdb_conn.execute(data_query).fetchnumpy()

            # If no data, return empty array
            if not rows_data or len(rows_data[columns[0]]) == 0:
                return np.array([], dtype=np.float32), {}

            # Apply bounding box filter if provided
            if bounding_box and len(bounding_box) in [4, 6]:
                x1, x2, y1, y2 = bounding_box[0], bounding_box[1], bounding_box[2], bounding_box[3]
                is_3d = len(bounding_box) == 6
                z1, z2 = (bounding_box[4], bounding_box[5]) if is_3d else (None, None)

                # Determine which columns to use for filtering
                if filter_columns and len(filter_columns) >= 2:
                    x_col, y_col = filter_columns[0], filter_columns[1]
                    z_col = filter_columns[2] if len(filter_columns) >= 3 else None
                    print(f"🔍 Using specified filter columns: x='{x_col}', y='{y_col}'")
                else:
                    # Default to first 3 columns for backward compatibility
                    x_col, y_col = columns[0], columns[1]
                    z_col = columns[2] if len(columns) >= 3 else None
                    print(f"🔍 Using default filter columns (first 3): x='{x_col}', y='{y_col}'")

                print(f"🔍 Filtering dataset {dataset_id} with bounding box: x[{x1}, {x2}], y[{y1}, {y2}]" +
                      (f", z[{z1}, {z2}]" if is_3d else ""))

                # Get coordinate data for filtering
                x_data = rows_data[x_col]
                y_data = rows_data[y_col]

                # Apply bounding box filter using numpy boolean masking
                mask = (x_data >= x1) & (x_data <= x2) & (y_data >= y1) & (y_data <= y2)

                # Apply 3D filter if applicable
                if is_3d and z1 is not None and z2 is not None and z_col:
                    z_data = rows_data[z_col]
                    mask = mask & (z_data >= z1) & (z_data <= z2)

                # Apply mask to ALL columns
                for col in columns:
                    rows_data[col] = rows_data[col][mask]

            # Get number of points after filtering
            num_points = len(rows_data[columns[0]])

            if num_points == 0:
                return np.array([], dtype=np.float32), {}

            # Interleave all columns into flat array
            num_cols = len(columns)
            flat_numpy = np.empty(num_points * num_cols, dtype=np.float32)

            # Direct strided assignment for optimal cache performance
            # Format: [col1_row1, col2_row1, ..., colN_row1, col1_row2, col2_row2, ...]
            for i, col in enumerate(columns):
                col_data = rows_data[col]

                # Handle mixed-type or non-numeric columns gracefully
                try:
                    # Try direct conversion first (fastest path)
                    flat_numpy[i::num_cols] = col_data.astype(np.float32, copy=False)
                except (ValueError, TypeError):
                    # If conversion fails, convert to float with error='coerce' (non-numeric -> NaN)
                    numeric_data = pd.to_numeric(col_data, errors='coerce')
                    flat_numpy[i::num_cols] = numeric_data.astype(np.float32)

            # Calculate boundaries from the actual fetched data
            boundaries = {}
            for col in columns:
                col_data = rows_data[col]

                # Only process numeric columns for boundaries (skip categorical/string columns)
                if np.issubdtype(col_data.dtype, np.number):
                    mask = ~np.isnan(col_data)
                    valid_data = col_data[mask]

                    if len(valid_data) > 0:
                        boundaries[col] = {
                            'min_value': float(np.min(valid_data)),
                            'max_value': float(np.max(valid_data)),
                            'valid_count': len(valid_data)
                        }

            return flat_numpy, boundaries

        except (KeyError, Exception) as e:
            print(f"❌ Error in get_dataset_data_and_stats_combined: {e}")
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
    
    def store_column_statistics(self, dataset_id: str, column_stats: Dict[str, Dict[str, Any]]) -> None:
        """
        Store pandas describe() statistics for dataset columns in the database
        
        Args:
            dataset_id: The dataset ID to store statistics for
            column_stats: Dict with structure {column_name: {stat_name: value}}
        """
        try:
            with Session(self.engine) as session:
                # Delete existing statistics for this dataset
                existing_stats = session.exec(
                    select(models.DatasetColumnStats).where(models.DatasetColumnStats.dataset_id == dataset_id)
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
                        q50=stats.get('50%'),  # median
                        q75=stats.get('75%'),
                        max_value=stats.get('max'),
                        null_count=stats.get('null_count'),
                        unique_count=stats.get('unique_count'),
                        created_at=db_connection.get_timestamp()
                    )
                    session.add(stat_record)
                
                session.commit()

        except Exception as e:
            raise e
    
    def recalculate_file_statistics(self, file_id: str) -> bool:
        """
        Recalculate statistics for a file from its DuckDB table after data manipulation.
        Uses full dataset for precise statistics (DuckDB is efficient enough for this).

        Args:
            file_id: The file ID

        Returns:
            True if successful, False otherwise
        """
        try:
            table_name = f"data_{file_id.replace('-', '_')}"

            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                print(f"⚠️ Table {table_name} does not exist, skipping statistics recalculation")
                return False

            # Get data from DuckDB into pandas
            with self.engine.connect() as conn:
                duckdb_conn = conn.connection.connection

                # Get all data for precise statistics
                result = duckdb_conn.execute(f"SELECT * FROM {table_name}")
                df = result.df()

            if df.empty:
                print(f"⚠️ No data in table {table_name}, skipping statistics recalculation")
                return False

            total_rows = len(df)

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
                datasets = session.exec(select(models.Dataset).where(models.Dataset.file_id == file_id)).all()

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

        except Exception as e:
            return {}
    
    def get_file_statistics(self, request: projects_pb2.GetFileStatisticsRequest) -> projects_pb2.GetFileStatisticsResponse:
        """Get file statistics"""
        try:
            print(f"📊 [BACKEND/EDA] Getting file statistics for file_id: {request.file_id}")

            # Get column names filter if provided
            column_names = list(request.columns) if request.columns else None
            print(f"📊 [BACKEND/EDA] Column filter: {column_names}")

            # Get the dataset associated with this file
            with Session(self.engine) as session:
                dataset = session.exec(
                    select(models.Dataset).where(models.Dataset.file_id == request.file_id)
                ).first()

                if not dataset:
                    # If no dataset, generate statistics directly from DuckDB
                    table_name = f"data_{request.file_id.replace('-', '_')}"
                    if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                        response = projects_pb2.GetFileStatisticsResponse()
                        response.success = False
                        response.error_message = "Table does not exist"
                        return response

                    # Use pandas describe on the DuckDB table
                    with self.engine.connect() as conn:
                        duckdb_conn = conn.connection.connection
                        result = duckdb_conn.execute(f"SELECT * FROM {table_name}")
                        df = result.df()

                    if df.empty:
                        response = projects_pb2.GetFileStatisticsResponse()
                        response.success = False
                        response.error_message = "No data in table"
                        return response

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

                else:
                    # Get statistics from stored dataset stats
                    stats_query = select(models.DatasetColumnStats).where(models.DatasetColumnStats.dataset_id == dataset.id)

                    # Filter by column names if specified
                    if column_names:
                        stats_query = stats_query.where(models.DatasetColumnStats.column_name.in_(column_names))

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

            print(f"📊 [BACKEND/EDA] Retrieved statistics for {len(statistics)} columns")
            print(f"📊 [BACKEND/EDA] Column names: {list(statistics.keys())}")

            response = projects_pb2.GetFileStatisticsResponse()
            response.success = True

            # Build response with statistics
            for col_name, stats in statistics.items():
                col_stat = response.statistics.add()
                col_stat.column_name = col_name
                col_stat.data_type = stats.get('column_type', 'numeric')
                col_stat.count = stats.get('count', 0)
                col_stat.null_count = stats.get('null_count', 0)
                col_stat.unique_count = stats.get('unique_count', 0)

                # Add numeric statistics if available
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

                # Add categorical statistics if available
                if stats.get('column_type') == 'categorical':
                    if stats.get('top_values'):
                        col_stat.top_values.extend(stats['top_values'])
                    if stats.get('top_counts'):
                        col_stat.top_counts.extend(stats['top_counts'])

            print(f"✅ [BACKEND/EDA] Returning statistics response with {len(response.statistics)} columns")

            return response

        except Exception as e:
            print(f"❌ [BACKEND/EDA] Error getting file statistics: {str(e)}")
            import traceback
            traceback.print_exc()
            response = projects_pb2.GetFileStatisticsResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def _generate_statistics_from_duckdb(self, file_id: str) -> Dict[str, Dict[str, Any]]:
        """
        Generate statistics using DuckDB to_df() + pandas describe()

        Args:
            file_id: The file ID to generate statistics for

        Returns:
            Dictionary of column statistics compatible with store_column_statistics
        """
        try:
            table_name = f"data_{file_id.replace('-', '_')}"

            # Check if table exists
            if not db_connection.check_duckdb_table_exists(self.engine, table_name):
                print(f"⚠️ Table {table_name} does not exist, skipping statistics generation")
                return {}

            # Use DuckDB's to_df() method for efficient DataFrame conversion
            with self.engine.connect() as conn:
                duckdb_conn = conn.connection.connection
                # Get all data as DataFrame using DuckDB's native to_df()
                result = duckdb_conn.execute(f"SELECT * FROM {table_name}")
                df = result.df()
            
            if df.empty:
                return {}
                
            # Use pandas describe() for comprehensive statistics
            numeric_describe = df.select_dtypes(include=[np.number]).describe()
            
            # Track column types
            numeric_columns = list(numeric_describe.columns)
            categorical_columns = [col for col in df.columns if col not in numeric_columns]
            
            # Build statistics dictionary compatible with store_column_statistics
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
                            'null_count': int(df[col].isnull().sum()),
                            'unique_count': int(df[col].nunique()),
                            'total_rows': len(df)
                        }
            
            # Statistics for categorical columns  
            for col in categorical_columns:
                column_statistics[col] = {
                    'column_type': 'categorical',
                    'count': float(df[col].count()),
                    'null_count': int(df[col].isnull().sum()),
                    'unique_count': int(df[col].nunique()),
                    'total_rows': len(df)
                }
            
            return column_statistics

        except Exception as e:
            print(f"❌ Error generating statistics from DuckDB with pandas: {e}")
            return {}
    
    def get_dataset_data(self, request: projects_pb2.GetDatasetDataRequest) -> projects_pb2.GetDatasetDataResponse:
        """Get dataset data with statistics computation"""
        try:
            # Columns for visualization (raw data points - typically x, y, z)
            viz_columns = list(request.columns) if request.columns else ["x", "y", "z"]
            print(f"📋 Visualization columns (for raw data): {viz_columns}")

            # Get dataset information first
            dataset = self.get_dataset_by_id(request.dataset_id)
            if not dataset:
                response = projects_pb2.GetDatasetDataResponse()
                return response

            # Get ALL numeric column names from dataset for statistics computation
            column_mappings = json.loads(dataset.column_mappings) if dataset.column_mappings else []
            print(f"🔍 DEBUG: Raw column_mappings from database: {column_mappings}")
            print(f"🔍 DEBUG: Number of mappings: {len(column_mappings)}")

            all_numeric_columns = [m['column_name'] for m in column_mappings if m['column_type'] == 1]  # NUMERIC only
            print(f"📊 All numeric columns (for statistics): {all_numeric_columns} ({len(all_numeric_columns)} columns)")

            # DEBUG: Show all column types
            for m in column_mappings:
                print(f"🔍 Column '{m['column_name']}': type={m['column_type']} (1=NUMERIC, 0=CATEGORICAL)")

            # Find coordinate columns from mappings (these are used for bounding box filtering)
            coord_columns = {}
            for m in column_mappings:
                if m.get('is_coordinate') and m.get('mapped_field') in ['x', 'y', 'z']:
                    coord_columns[m['mapped_field']] = m['column_name']

            # Build filter_columns list from coordinate mappings (fallback to viz_columns if not found)
            filter_columns_for_bbox = [
                coord_columns.get('x', viz_columns[0] if len(viz_columns) > 0 else 'x'),
                coord_columns.get('y', viz_columns[1] if len(viz_columns) > 1 else 'y'),
                coord_columns.get('z', viz_columns[2] if len(viz_columns) > 2 else 'z')
            ]
            print(f"🔍 Coordinate columns for filtering: {filter_columns_for_bbox} (from column_mappings)")

            # Extract optional filtering parameters
            bounding_box = list(request.bounding_box) if request.bounding_box else None
            shape = request.shape if request.HasField('shape') else None
            color = request.color if request.HasField('color') else None
            function = request.function if request.HasField('function') else None

            # Log optional parameters if provided
            if bounding_box:
                print(f"📦 GetDatasetData with bounding_box: {bounding_box}")
            if shape:
                print(f"🔷 Shape: {shape}")
            if color:
                print(f"🎨 Color: {color}")
            if function:
                print(f"🔧 Function: {function}")

            # Get visualization data (only requested columns for raw data)
            data, boundaries = self.get_dataset_data_and_stats_combined(
                request.dataset_id,
                viz_columns,
                bounding_box=bounding_box
            )

            # Get ALL numeric columns data for statistics computation
            print(f"🔍 DEBUG: About to fetch data for columns: {all_numeric_columns}")
            print(f"🔍 DEBUG: Bounding box: {bounding_box}")
            print(f"🔍 DEBUG: Filter columns for bbox: {filter_columns_for_bbox}")

            all_data, all_boundaries = self.get_dataset_data_and_stats_combined(
                request.dataset_id,
                all_numeric_columns,
                bounding_box=bounding_box,
                filter_columns=filter_columns_for_bbox  # Use coordinate columns from dataset mapping
            )
            print(f"📊 Fetched {len(all_data)} values for {len(all_numeric_columns)} columns")
            print(f"🔍 DEBUG: all_data type: {type(all_data)}, shape/len: {all_data.shape if hasattr(all_data, 'shape') else len(all_data)}")
            print(f"🔍 DEBUG: all_boundaries keys: {list(all_boundaries.keys()) if all_boundaries else 'None'}")

            # Direct binary conversion without unnecessary copying
            binary_data = data.tobytes()

            # Configure response fields
            response = projects_pb2.GetDatasetDataResponse()
            response.binary_data = binary_data
            response.data_length = len(data)
            response.total_count = len(data) // 3  # Each point has 3 values (x,y,z)

            # Use boundaries from combined query (already available)
            for col_name, stats in boundaries.items():
                boundary = response.data_boundaries.add()
                boundary.column_name = col_name
                boundary.min_value = float(stats['min_value'])
                boundary.max_value = float(stats['max_value'])
                boundary.valid_count = int(stats['valid_count'])

            # ========== Compute statistics for ALL numeric columns ==========
            print(f"🔍 DEBUG: Checking if we should compute statistics...")
            print(f"🔍 DEBUG: len(all_data)={len(all_data)}, len(all_numeric_columns)={len(all_numeric_columns)}")

            if len(all_data) > 0:
                if len(all_numeric_columns) == 0:
                    print(f"⚠️ WARNING: all_data has {len(all_data)} values but all_numeric_columns is empty! Cannot compute statistics.")
                else:
                    num_points = len(all_data) // len(all_numeric_columns)
                    print(f"📊 Computing statistics for {num_points} points across {len(all_numeric_columns)} columns...")

                    # 1. Compute histograms for ALL numeric columns
                    print(f"🔍 DEBUG: Starting histogram computation for {len(all_numeric_columns)} columns...")
                    for i, col_name in enumerate(all_numeric_columns):
                        col_data = all_data[i::len(all_numeric_columns)]  # Extract column data from interleaved format
                        print(f"🔍 DEBUG: Computing histogram for column {i}: '{col_name}', data length: {len(col_data)}")
                        histogram = self.compute_histogram(col_data, col_name, num_bins=30)
                        print(f"🔍 DEBUG: Histogram result: {histogram is not None and len(histogram) > 0}")

                        if histogram:
                            hist_proto = response.histograms[col_name]
                            hist_proto.bin_ranges.extend(histogram['bin_ranges'])
                            hist_proto.bin_counts.extend(histogram['bin_counts'])
                            hist_proto.bin_edges.extend(histogram['bin_edges'])
                            hist_proto.num_bins = histogram['num_bins']
                            hist_proto.min_value = histogram['min_value']
                            hist_proto.max_value = histogram['max_value']
                            hist_proto.total_count = histogram['total_count']
                            print(f"  ✅ Histogram for '{col_name}': {histogram['num_bins']} bins")

                    # 2. Compute box plots for ALL numeric columns
                    for i, col_name in enumerate(all_numeric_columns):
                        col_data = all_data[i::len(all_numeric_columns)]  # Extract column data from interleaved format
                        boxplot = self.compute_boxplot(col_data, col_name)

                        if boxplot:
                            bp_proto = response.box_plots.add()
                            bp_proto.column_name = boxplot['column_name']
                            bp_proto.min = boxplot['min']
                            bp_proto.q1 = boxplot['q1']
                            bp_proto.median = boxplot['median']
                            bp_proto.q3 = boxplot['q3']
                            bp_proto.max = boxplot['max']
                            bp_proto.mean = boxplot['mean']
                            bp_proto.outliers.extend(boxplot['outliers'])
                            bp_proto.lower_fence = boxplot['lower_fence']
                            bp_proto.upper_fence = boxplot['upper_fence']
                            bp_proto.iqr = boxplot['iqr']
                            bp_proto.total_count = boxplot['total_count']
                            print(f"  ✅ Box plot for '{col_name}': median={boxplot['median']:.2f}, {len(boxplot['outliers'])} outliers")

                    # 3. Compute heatmap (using visualization columns only - x, y, z)
                    if len(viz_columns) >= 3:
                        # Extract x, y, z from all_data for heatmap
                        x_idx = all_numeric_columns.index(viz_columns[0]) if viz_columns[0] in all_numeric_columns else 0
                        y_idx = all_numeric_columns.index(viz_columns[1]) if viz_columns[1] in all_numeric_columns else 1
                        z_idx = all_numeric_columns.index(viz_columns[2]) if viz_columns[2] in all_numeric_columns else 2

                        x_data = all_data[x_idx::len(all_numeric_columns)]
                        y_data = all_data[y_idx::len(all_numeric_columns)]
                        z_data = all_data[z_idx::len(all_numeric_columns)]

                        heatmap = self.compute_heatmap(
                            x_data, y_data, z_data,
                            viz_columns[0], viz_columns[1], viz_columns[2],
                            grid_size=50
                        )

                        if heatmap and heatmap.get('cells'):
                            hm_proto = response.heatmap
                            for cell in heatmap['cells']:
                                cell_proto = hm_proto.cells.add()
                                cell_proto.x_index = cell['x_index']
                                cell_proto.y_index = cell['y_index']
                                cell_proto.avg_value = cell['avg_value']
                                cell_proto.count = cell['count']

                            hm_proto.grid_size_x = heatmap['grid_size_x']
                            hm_proto.grid_size_y = heatmap['grid_size_y']
                            hm_proto.min_value = heatmap['min_value']
                            hm_proto.max_value = heatmap['max_value']
                            hm_proto.x_bin_size = heatmap['x_bin_size']
                            hm_proto.y_bin_size = heatmap['y_bin_size']
                            hm_proto.min_x = heatmap['min_x']
                            hm_proto.max_x = heatmap['max_x']
                            hm_proto.min_y = heatmap['min_y']
                            hm_proto.max_y = heatmap['max_y']
                            hm_proto.x_column = heatmap['x_column']
                            hm_proto.y_column = heatmap['y_column']
                            hm_proto.value_column = heatmap['value_column']
                            print(f"  ✅ Heatmap: {len(heatmap['cells'])} cells in {heatmap['grid_size_x']}x{heatmap['grid_size_y']} grid")

                    print(f"✅ Statistics computation complete!")

            return response

        except Exception as e:
            import traceback
            print(f"❌ Error in ultra-optimized dataset retrieval: {e}")
            print(f"❌ Traceback completo: {traceback.format_exc()}")
            response = projects_pb2.GetDatasetDataResponse()
            return response
    
    def get_dataset_table_data(self, request: projects_pb2.GetDatasetTableDataRequest) -> projects_pb2.GetDatasetTableDataResponse:
        """Get paginated table data for dataset (efficient for large datasets)"""
        try:
            print(f"📊 [GetDatasetTableData] dataset_id={request.dataset_id}, limit={request.limit}, offset={request.offset}")
            
            # Get dataset info
            dataset = self.get_dataset_by_id(request.dataset_id)
            if not dataset:
                response = projects_pb2.GetDatasetTableDataResponse()
                response.success = False
                response.error_message = "Dataset no encontrado"
                return response
            
            # Get column names - either from request or all numeric columns from mappings
            column_mappings = json.loads(dataset.column_mappings) if dataset.column_mappings else []

            print(f"🔍 [GetDatasetTableData] Retrieved {len(column_mappings)} column mappings from database")
            if len(column_mappings) > 0:
                print(f"🔍 [GetDatasetTableData] First mapping: {column_mappings[0]}")
                print(f"🔍 [GetDatasetTableData] First mapping column_type: {column_mappings[0]['column_type']} (type: {type(column_mappings[0]['column_type'])})")

            if request.columns and len(request.columns) > 0:
                # Use specified columns
                columns_to_fetch = list(request.columns)
            else:
                # Get all numeric columns
                columns_to_fetch = [m['column_name'] for m in column_mappings if m['column_type'] == 1]  # NUMERIC only
                print(f"🔍 [GetDatasetTableData] Filtered to {len(columns_to_fetch)} numeric columns")

            if not columns_to_fetch:
                response = projects_pb2.GetDatasetTableDataResponse()
                response.success = False
                response.error_message = "No hay columnas numéricas para mostrar"
                return response
            
            print(f"📊 [GetDatasetTableData] Fetching {len(columns_to_fetch)} columns")
            
            # Build SQL query with pagination
            table_name = dataset.duckdb_table_name
            columns_str = ', '.join([f'"{col}"' for col in columns_to_fetch])
            
            query = f"""
                SELECT {columns_str}
                FROM {table_name}
                LIMIT {request.limit}
                OFFSET {request.offset}
            """
            
            # Execute query
            with self.engine.connect() as conn:
                result = conn.execute(text(query))
                rows_data = result.fetchall()
            
            print(f"📊 [GetDatasetTableData] Fetched {len(rows_data)} rows")
            
            # Build response
            response = projects_pb2.GetDatasetTableDataResponse()
            response.success = True
            response.total_rows = dataset.total_rows
            response.column_names.extend(columns_to_fetch)
            
            # Convert rows to protobuf format
            for row in rows_data:
                table_row = response.rows.add()
                for i, col_name in enumerate(columns_to_fetch):
                    table_row.values[col_name] = float(row[i]) if row[i] is not None else 0.0
            
            print(f"✅ [GetDatasetTableData] Returning {len(response.rows)} rows")
            return response
            
        except Exception as e:
            print(f"❌ Error getting dataset table data: {e}")
            import traceback
            traceback.print_exc()
            response = projects_pb2.GetDatasetTableDataResponse()
            response.success = False
            response.error_message = str(e)
            return response

