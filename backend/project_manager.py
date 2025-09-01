#!/usr/bin/env python
"""
Project Manager Module  
Handles project management and CSV processing operations
"""

import time
import pandas as pd
import numpy as np
import csv
import io
from typing import Iterator, List, Tuple, Dict, Any

# Import protobuf types
from generated import files_pb2
from generated import projects_pb2


class ProjectManager:
    """Manager for projects and CSV file operations"""
    
    def __init__(self, db_manager):
        self.db = db_manager
        print("📁 ProjectManager initialized")
    
    # ========== CSV Processing Methods ==========
    
    def analyze_csv(self, file_path: str, file_name: str, rows_to_analyze: int = 1000, save_to_sql: bool = False) -> files_pb2.AnalyzeCsvResponse:
        """
        Enhanced CSV analysis using pandas describe() for comprehensive statistical analysis
        
        Args:
            file_path: Path to the CSV file
            file_name: Name of the file
            rows_to_analyze: Number of rows to analyze for statistics (default: 1000 for better stats)
            save_to_sql: Whether to save the analyzed data to SQL database
        """
        try:
            import os
            from pathlib import Path
            
            # Get file size
            file_size_mb = os.path.getsize(file_path) / (1024 * 1024)
            
            # Read the entire dataset first to get accurate statistics
            print(f"📊 Reading CSV file: {file_path}")
            df_full = pd.read_csv(file_path)
            total_rows = len(df_full)
            total_columns = len(df_full.columns)
            
            # Use a sample for detailed analysis if the file is very large
            if rows_to_analyze < total_rows and rows_to_analyze > 0:
                df_sample = df_full.sample(n=min(rows_to_analyze, total_rows), random_state=42)
                print(f"📊 Using sample of {len(df_sample)} rows for detailed analysis")
            else:
                df_sample = df_full
                print(f"📊 Analyzing all {total_rows} rows")
            
            response = files_pb2.AnalyzeCsvResponse()
            response.success = True
            response.total_rows = total_rows
            response.total_columns = total_columns
            response.file_size_mb = file_size_mb
            response.encoding = "utf-8"  # Could be enhanced to detect encoding
            
            # Get comprehensive statistics using pandas describe()
            numeric_describe = df_sample.select_dtypes(include=[np.number]).describe()
            # For categorical data, we'll get basic stats manually below
            
            # Track column types
            numeric_columns = []
            categorical_columns = []
            auto_mapping = {}
            
            # Analyze each column
            for col_name in df_full.columns:
                column_info = response.columns.add()
                column_info.name = str(col_name)
                
                # Determine if column is numeric or categorical
                is_numeric = col_name in numeric_describe.columns
                column_info.type = "number" if is_numeric else "string"
                
                if is_numeric:
                    numeric_columns.append(str(col_name))
                    
                    # Add comprehensive statistics from describe()
                    if col_name in numeric_describe.columns:
                        col_stats = numeric_describe[col_name]
                        stats = column_info.stats
                        stats.count = float(col_stats.get('count', 0))
                        stats.mean = float(col_stats.get('mean', 0))
                        stats.std = float(col_stats.get('std', 0))
                        stats.min = float(col_stats.get('min', 0))
                        stats.q25 = float(col_stats.get('25%', 0))
                        stats.q50 = float(col_stats.get('50%', 0))  # median
                        stats.q75 = float(col_stats.get('75%', 0))
                        stats.max = float(col_stats.get('max', 0))
                        stats.null_count = int(df_sample[col_name].isnull().sum())
                        stats.unique_count = int(df_sample[col_name].nunique())
                else:
                    categorical_columns.append(str(col_name))
                    
                    # Add basic statistics for categorical columns
                    stats = column_info.stats
                    stats.count = float(df_sample[col_name].count())
                    stats.null_count = int(df_sample[col_name].isnull().sum())
                    stats.unique_count = int(df_sample[col_name].nunique())
                
                # Add sample values (first 5 non-null unique values)
                sample_values = df_sample[col_name].dropna().unique()[:5]
                column_info.sample_values.extend([str(val) for val in sample_values])
                
                # Auto-detect mappings based on column names (case-insensitive)
                col_lower = str(col_name).lower()
                if any(x in col_lower for x in ['site_id', 'station_id', 'point_id', 'sample_id']) or col_lower.endswith('_id'):
                    auto_mapping['id'] = str(col_name)
                    column_info.is_required = True
                elif any(x in col_lower for x in ['longitude', 'lng', 'long']) or col_lower in ['x', 'lon']:
                    auto_mapping['x'] = str(col_name)
                    column_info.is_required = True
                elif any(x in col_lower for x in ['latitude', 'lat']) and not any(k in col_lower for k in ['year', 'yr']):
                    auto_mapping['y'] = str(col_name)
                    column_info.is_required = True
                elif any(x in col_lower for x in ['elevation', 'height', 'altitude', 'elev']) or col_lower in ['z']:
                    auto_mapping['z'] = str(col_name)
                    column_info.is_required = True
                elif any(x in col_lower for x in ['depth', 'profundidad']):
                    auto_mapping['depth'] = str(col_name)
                    column_info.is_required = True
                else:
                    column_info.is_required = False
            
            # Set column type lists
            response.numeric_columns.extend(numeric_columns)
            response.categorical_columns.extend(categorical_columns)
            
            # Set auto-detected mappings
            for key, value in auto_mapping.items():
                response.auto_detected_mapping[key] = value
            
            # Optional: Save to SQL database using pandas to_sql()
            if save_to_sql:
                table_name = f"csv_analysis_{Path(file_name).stem}"
                print(f"💾 Saving CSV data to SQL table: {table_name}")
                
                # Use the database manager's engine to save data
                try:
                    df_full.to_sql(table_name, self.db.engine, if_exists='replace', index=False)
                    print(f"✅ Successfully saved {total_rows} rows to SQL table: {table_name}")
                except Exception as sql_error:
                    print(f"⚠️ Failed to save to SQL: {sql_error}")
                    # Don't fail the entire analysis if SQL save fails
            
            print(f"📊 Enhanced CSV analysis complete:")
            print(f"   📁 File: {file_name} ({file_size_mb:.2f} MB)")
            print(f"   📏 Dimensions: {total_rows:,} rows × {total_columns} columns")
            print(f"   🔢 Numeric columns: {len(numeric_columns)}")
            print(f"   📝 Categorical columns: {len(categorical_columns)}")
            print(f"   🎯 Auto-mapped: {auto_mapping}")
            
            return response
            
        except Exception as e:
            print(f"❌ Enhanced CSV analysis error: {e}")
            response = files_pb2.AnalyzeCsvResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def create_sample_csv_for_testing(self, file_path: str = "/tmp/sample_geospatial.csv") -> str:
        """
        Create a sample CSV file for testing the enhanced analyze_csv functionality
        
        Returns:
            str: Path to the created sample CSV file
        """
        try:
            # Create a sample geospatial dataset with various data types
            np.random.seed(42)  # For reproducible results
            n_samples = 1000
            
            sample_data = {
                'site_id': [f'SITE_{i:03d}' for i in range(1, n_samples + 1)],
                'longitude': np.random.uniform(-74.0, -70.0, n_samples),
                'latitude': np.random.uniform(-34.0, -32.0, n_samples),
                'elevation': np.random.normal(1000, 200, n_samples),
                'temperature': np.random.normal(25, 10, n_samples),
                'humidity': np.random.uniform(20, 90, n_samples),
                'pressure': np.random.normal(1013, 30, n_samples),
                'wind_speed': np.abs(np.random.normal(15, 8, n_samples)),
                'soil_type': np.random.choice(['Clay', 'Sandy', 'Loam', 'Rocky'], n_samples),
                'vegetation': np.random.choice(['Forest', 'Grassland', 'Desert', 'Urban'], n_samples),
                'measurement_date': pd.date_range('2024-01-01', periods=n_samples, freq='h').strftime('%Y-%m-%d %H:%M:%S')
            }
            
            # Add some missing values to test null handling
            sample_data['temperature'][::50] = np.nan  # Every 50th value is missing
            sample_data['humidity'][::75] = np.nan     # Every 75th value is missing
            
            # Create DataFrame and save to CSV
            df = pd.DataFrame(sample_data)
            df.to_csv(file_path, index=False)
            
            print(f"✅ Created sample CSV file at: {file_path}")
            print(f"   📏 Dataset: {len(df)} rows × {len(df.columns)} columns")
            print(f"   🔢 Numeric columns: {len(df.select_dtypes(include=[np.number]).columns)}")
            print(f"   📝 Categorical columns: {len(df.select_dtypes(include=['object']).columns)}")
            
            return file_path
            
        except Exception as e:
            print(f"❌ Error creating sample CSV: {e}")
            raise e

    def send_file(self, request: files_pb2.SendFileRequest) -> files_pb2.SendFileResponse:
        """
        Process the complete CSV file with variable mappings and keep data in memory
        """
        try:
            start_time = time.time()
            print(f"📂 SendFile request: {request.file_path}")
            print(f"   Variables: X={request.x_variable}, Y={request.y_variable}, Z={request.z_variable}, ID={request.id_variable}, DEPTH={request.depth_variable}")
            
            # Read the entire CSV file
            df = pd.read_csv(request.file_path)

            # Apply preview-driven overrides
            # 1) Include/skip the first data row (preview row)
            try:
                if hasattr(request, 'include_first_row') and not request.include_first_row and len(df) > 0:
                    df = df.iloc[1:].reset_index(drop=True)
            except Exception:
                # Be conservative and continue if field not present
                pass

            # 2) Enforce column types from preview where provided
            try:
                # request.column_types is a map<string, string>
                if hasattr(request, 'column_types') and request.column_types:
                    for col_name, col_type in request.column_types.items():
                        if col_name in df.columns:
                            if str(col_type).lower() == 'number':
                                df[col_name] = pd.to_numeric(df[col_name], errors='coerce')
                            else:
                                df[col_name] = df[col_name].astype(str)
            except Exception as e:
                print(f"⚠️ Column type enforcement failed: {e}")
            total_rows = len(df)
            
            # Validate that required columns exist
            required_cols = []
            if request.x_variable:
                required_cols.append(request.x_variable)
            if request.y_variable:
                required_cols.append(request.y_variable)
            
            missing_cols = [col for col in required_cols if col not in df.columns]
            if missing_cols:
                raise ValueError(f"Missing required columns: {missing_cols}")
            
            # If user selected specific columns, restrict to those (ensure mapping vars are included)
            try:
                if hasattr(request, 'included_columns') and request.included_columns:
                    keep_cols = [c for c in request.included_columns if c in df.columns]
                    # Always include mapping variables so required fields exist
                    for mvar in [request.x_variable, request.y_variable, request.z_variable, request.id_variable, request.depth_variable]:
                        if mvar and mvar in df.columns and mvar not in keep_cols:
                            keep_cols.append(mvar)
                    if keep_cols:
                        df = df[keep_cols]
            except Exception:
                pass

            # Filter and process the data
            valid_rows = 0
            invalid_rows = 0
            errors = []
            
            # Create a processed dataset (store in memory for now)
            processed_data = []
            
            for idx, row in df.iterrows():
                try:
                    data_point = {}
                    
                    # Map the variables
                    if request.x_variable and request.x_variable in row:
                        data_point['x'] = float(row[request.x_variable])
                    if request.y_variable and request.y_variable in row:
                        data_point['y'] = float(row[request.y_variable])
                    if request.z_variable and request.z_variable in row:
                        data_point['z'] = float(row[request.z_variable])
                    if request.id_variable and request.id_variable in row:
                        data_point['id'] = str(row[request.id_variable])
                    if request.depth_variable and request.depth_variable in row:
                        data_point['depth'] = float(row[request.depth_variable])

                    # Copy remaining columns so chunk API can expose metrics/attrs
                    try:
                        for col in df.columns:
                            if col in [request.x_variable, request.y_variable, request.z_variable, request.id_variable, request.depth_variable]:
                                continue
                            val = row[col]
                            # Skip NaN
                            try:
                                if val is None or (isinstance(val, float) and np.isnan(val)):
                                    continue
                            except Exception:
                                pass
                            # Keep numeric vs string
                            if isinstance(val, (int, float, np.integer, np.floating)):
                                data_point[col] = float(val)
                            else:
                                data_point[col] = str(val)
                    except Exception as copy_err:
                        # Non-fatal, continue processing
                        pass
                    
                    # Validate required fields
                    if 'x' in data_point and 'y' in data_point:
                        processed_data.append(data_point)
                        valid_rows += 1
                    else:
                        invalid_rows += 1
                        if len(errors) < 10:  # Limit error messages
                            errors.append(f"Row {idx}: Missing X or Y coordinate")
                        
                except (ValueError, TypeError) as e:
                    invalid_rows += 1
                    if len(errors) < 10:
                        errors.append(f"Row {idx}: {str(e)}")
            
            # Store the processed data globally (in a real app, use a database)
            global loaded_csv_data
            loaded_csv_data = {
                'data': processed_data,
                'file_name': request.file_name,
                'file_path': request.file_path,
                'variable_mapping': {
                    'x': request.x_variable,
                    'y': request.y_variable,
                    'z': request.z_variable,
                    'id': request.id_variable,
                    'depth': request.depth_variable
                },
                'timestamp': time.time()
            }
            
            processing_time = time.time() - start_time
            
            response = files_pb2.SendFileResponse()
            response.total_rows_processed = total_rows
            response.valid_rows = valid_rows
            response.invalid_rows = invalid_rows
            response.errors.extend(errors[:10])  # Return up to 10 errors
            response.success = True
            response.processing_time = f"{processing_time:.2f}s"
            
            print(f"📂 SendFile completed: {valid_rows}/{total_rows} valid rows in {processing_time:.2f}s")
            return response
            
        except Exception as e:
            print(f"❌ SendFile error: {e}")
            response = files_pb2.SendFileResponse()
            response.success = False
            response.errors.append(str(e))
            return response

    def get_loaded_data_stats(self) -> files_pb2.GetLoadedDataStatsResponse:
        """
        Get statistics about the currently loaded CSV data
        """
        try:
            global loaded_csv_data
            
            response = files_pb2.GetLoadedDataStatsResponse()
            
            if 'loaded_csv_data' not in globals() or not loaded_csv_data:
                response.has_data = False
                response.total_points = 0
                return response
                
            data = loaded_csv_data['data']
            response.has_data = True
            response.total_points = len(data)
            
            if data:
                # Calculate statistics for X, Y, Z
                x_values = [p['x'] for p in data if 'x' in p]
                y_values = [p['y'] for p in data if 'y' in p]
                z_values = [p['z'] for p in data if 'z' in p]
                
                if x_values:
                    response.x_stats['min'] = min(x_values)
                    response.x_stats['max'] = max(x_values)
                    response.x_stats['avg'] = sum(x_values) / len(x_values)
                    
                if y_values:
                    response.y_stats['min'] = min(y_values)
                    response.y_stats['max'] = max(y_values)
                    response.y_stats['avg'] = sum(y_values) / len(y_values)
                    
                if z_values:
                    response.z_stats['min'] = min(z_values)
                    response.z_stats['max'] = max(z_values)
                    response.z_stats['avg'] = sum(z_values) / len(z_values)
                
                # Available columns
                if loaded_csv_data.get('variable_mapping'):
                    mapping = loaded_csv_data['variable_mapping']
                    for key, value in mapping.items():
                        if value:  # Only add non-empty mappings
                            response.available_columns.append(f"{key}:{value}")
            
            print(f"📊 GetLoadedDataStats: {response.total_points} points loaded")
            return response
            
        except Exception as e:
            print(f"❌ GetLoadedDataStats error: {e}")
            response = files_pb2.GetLoadedDataStatsResponse()
            response.has_data = False
            response.total_points = 0
            return response

    # ---------- Manejo de proyectos ----------
    # Usamos los métodos definidos en database.py para crear un proyecto
    
    def create_project(self, request: projects_pb2.CreateProjectRequest) -> projects_pb2.CreateProjectResponse:
        try:
            print(f"Creando proyecto: {request.name}")
            
            # Llamamos a la función create_project para crear el proyecto
            project_data = self.db.create_project(request.name, request.description)
            
            # Se crea la respuesta como la definida en el proto
            response = projects_pb2.CreateProjectResponse()
            response.success = True
            
            # Obtenemos el proyecto en la respuesta (ProjectResponse.response en protobuf)
            project = response.project

            # Llenamos los datos del proyecto en la respuesta
            project.id = project_data.id
            project.name = project_data.name
            project.description = project_data.description
            project.created_at = project_data.created_at
            project.updated_at = project_data.updated_at
            
            print(f"Proyecto creado: {project.id}")
            # Devolvemos la respuesta
            return response
            
        except Exception as e:
            print(f"❌ Error creating project: {e}")
            response = projects_pb2.CreateProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def get_projects(self, request: projects_pb2.GetProjectsRequest) -> projects_pb2.GetProjectsResponse:
        """Get projects with pagination"""
        try:
            print(f"📁 Getting projects: limit={request.limit}, offset={request.offset}")
            
            projects_data, total_count = self.db.get_projects(request.limit or 100, request.offset)
            
            response = projects_pb2.GetProjectsResponse()
            response.total_count = total_count
            
            for project_data in projects_data:
                project = response.projects.add()
                project.id = project_data.id
                project.name = project_data.name
                project.description = project_data.description
                project.created_at = project_data.created_at
                project.updated_at = project_data.updated_at
            
            print(f"✅ Retrieved {len(projects_data)} projects")
            return response
            
        except Exception as e:
            print(f"❌ Error getting projects: {e}")
            response = projects_pb2.GetProjectsResponse()
            return response
    
    def get_project(self, request: projects_pb2.GetProjectRequest) -> projects_pb2.GetProjectResponse:
        """Get a single project"""
        try:
            print(f"📁 Getting project: {request.project_id}")
            
            project_data = self.db.get_project(request.project_id)
            
            response = projects_pb2.GetProjectResponse()
            if project_data:
                response.success = True
                project = response.project
                project.id = project_data.id
                project.name = project_data.name
                project.description = project_data.description
                project.created_at = project_data.created_at
                project.updated_at = project_data.updated_at
            else:
                response.success = False
                response.error_message = "Project not found"
            
            return response
            
        except Exception as e:
            print(f"❌ Error getting project: {e}")
            response = projects_pb2.GetProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def update_project(self, request: projects_pb2.UpdateProjectRequest) -> projects_pb2.UpdateProjectResponse:
        """Update a project"""
        try:
            print(f"📁 Updating project: {request.project_id}")
            
            updated_project = self.db.update_project(request.project_id, request.name, request.description)
            
            response = projects_pb2.UpdateProjectResponse()
            if updated_project:
                response.success = True
                project = response.project
                project.id = updated_project.id
                project.name = updated_project.name
                project.description = updated_project.description
                project.created_at = updated_project.created_at
                project.updated_at = updated_project.updated_at
            else:
                response.success = False
                response.error_message = "Project not found"
            
            return response
            
        except Exception as e:
            print(f"❌ Error updating project: {e}")
            response = projects_pb2.UpdateProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def delete_project(self, request: projects_pb2.DeleteProjectRequest) -> projects_pb2.DeleteProjectResponse:
        """Delete a project"""
        try:
            print(f"📁 Deleting project: {request.project_id}")
            
            success = self.db.delete_project(request.project_id)
            
            response = projects_pb2.DeleteProjectResponse()
            response.success = success
            if not success:
                response.error_message = "Project not found"
            
            return response
            
        except Exception as e:
            print(f"❌ Error deleting project: {e}")
            response = projects_pb2.DeleteProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    # ========== File Management Methods ==========
    
    def create_file(self, request: projects_pb2.CreateFileRequest) -> projects_pb2.CreateFileResponse:
        """Create a new file"""
        try:
            print(f"📄 Creating file: {request.name} for project {request.project_id}")
            
            # Create file with immediate DuckDB import (no binary storage)
            file_data, duckdb_table_name, column_statistics = self.db.create_file_with_csv(
                request.project_id,
                request.name,
                int(request.dataset_type),
                request.original_filename,
                request.file_content
            )
            
            # Store statistics in database if analysis was successful
            if column_statistics:
                print(f"📈 Statistics generated for {len(column_statistics)} columns from DuckDB table: {duckdb_table_name}")
                # Statistics are automatically available via DuckDB queries
            
            response = projects_pb2.CreateFileResponse()
            response.success = True
            
            # Direct field assignment
            response.file.id = file_data.id
            response.file.project_id = file_data.project_id
            response.file.name = file_data.name
            response.file.dataset_type = file_data.dataset_type
            response.file.original_filename = file_data.original_filename
            response.file.file_size = file_data.file_size
            response.file.created_at = file_data.created_at
            
            print(f"✅ File created: {response.file.id}")
            return response
            
        except Exception as e:
            print(f"❌ Error creating file: {e}")
            response = projects_pb2.CreateFileResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def get_project_files(self, request: projects_pb2.GetProjectFilesRequest) -> projects_pb2.GetProjectFilesResponse:
        """Get all files for a project"""
        try:
            print(f"📄 Getting files for project: {request.project_id}")
            
            files_data = self.db.get_project_files(request.project_id)
            
            response = projects_pb2.GetProjectFilesResponse()
            
            for file_data in files_data:
                file = response.files.add()
                file.id = file_data.id
                file.project_id = file_data.project_id
                file.name = file_data.name
                file.dataset_type = file_data.dataset_type
                file.original_filename = file_data.original_filename
                file.file_size = file_data.file_size
                file.created_at = file_data.created_at
            
            print(f"✅ Retrieved {len(files_data)} files")
            return response
            
        except Exception as e:
            print(f"❌ Error getting project files: {e}")
            response = projects_pb2.GetProjectFilesResponse()
            return response

    def get_project_datasets(self, request: projects_pb2.GetProjectDatasetsRequest) -> projects_pb2.GetProjectDatasetsResponse:
        """Get all datasets for a project"""
        try:
            print(f"📊 Getting datasets for project: {request.project_id}")
            
            datasets = self.db.get_datasets_by_project(request.project_id)
            
            response = projects_pb2.GetProjectDatasetsResponse()
            
            for dataset_data, file_data in datasets:
                dataset = response.datasets.add()
                dataset.id = dataset_data.id
                dataset.file_id = dataset_data.file_id
                dataset.file_name = file_data.name
                dataset.dataset_type = file_data.dataset_type
                dataset.original_filename = file_data.original_filename
                dataset.total_rows = dataset_data.total_rows
                dataset.created_at = dataset_data.created_at
                
                # Add column mappings - need to parse JSON since it's stored as string
                import json
                column_mappings = json.loads(dataset_data.column_mappings) if dataset_data.column_mappings else []
                for mapping in column_mappings:
                    col_mapping = dataset.column_mappings.add()
                    col_mapping.column_name = mapping['column_name']
                    col_mapping.column_type = mapping['column_type']
                    col_mapping.mapped_field = mapping['mapped_field']
                    col_mapping.is_coordinate = mapping['is_coordinate']
            
            print(f"✅ Found {len(datasets)} datasets")
            return response
            
        except Exception as e:
            print(f"❌ Error getting project datasets: {e}")
            response = projects_pb2.GetProjectDatasetsResponse()
            return response
    
    def delete_file(self, request: projects_pb2.DeleteFileRequest) -> projects_pb2.DeleteFileResponse:
        """Delete a file"""
        try:
            print(f"📄 Deleting file: {request.file_id}")
            
            success = self.db.delete_file(request.file_id)
            
            response = projects_pb2.DeleteFileResponse()
            response.success = success
            if not success:
                response.error_message = "File not found"
            
            return response
            
        except Exception as e:
            print(f"❌ Error deleting file: {e}")
            response = projects_pb2.DeleteFileResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    # ========== Enhanced CSV Processing Methods ==========
    
    def analyze_csv_for_project(self, request: projects_pb2.AnalyzeCsvForProjectRequest) -> projects_pb2.AnalyzeCsvForProjectResponse:
        """Analyze CSV file for project with enhanced column type detection"""
        try:
            print(f"📊 Analyzing CSV for project file: {request.file_id}")
            
            # Get data from DuckDB table (data is already imported)
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            # Check if DuckDB table exists
            if not self.db.check_duckdb_table_exists(table_name):
                # Try to migrate if it's an old file
                if not self.db.migrate_old_file_to_duckdb(request.file_id):
                    response = projects_pb2.AnalyzeCsvForProjectResponse()
                    response.success = False
                    response.error_message = "File data not found in DuckDB. Please re-upload the file."
                    return response
            
            # Get sample data from DuckDB table
            try:
                with self.db.engine.connect() as conn:
                    from sqlalchemy import text
                    # Get table schema
                    schema_result = conn.execute(text(f"DESCRIBE {table_name}"))
                    headers = [row[0] for row in schema_result]
                    
                    # Get first 5 rows for preview
                    preview_result = conn.execute(text(f"SELECT * FROM {table_name} LIMIT 5"))
                    preview_data = [list(row) for row in preview_result]
                    
                    # Get total row count
                    count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                    row_count = int(count_result[0])
                    
            except Exception as e:
                print(f"⚠️  DuckDB table not found for file {request.file_id}: {e}")
                # This might be an old file uploaded before DuckDB migration
                # Return a basic response indicating the file needs to be re-uploaded
                response = projects_pb2.AnalyzeCsvForProjectResponse()
                response.success = False
                response.error_message = "File needs to be re-uploaded for analysis. This file was uploaded before the DuckDB migration."
                return response
            
            # Convert preview data to protobuf format
            preview_rows = []
            for row_data in preview_data:
                preview_row = projects_pb2.PreviewRow()
                preview_row.values.extend([str(val) for val in row_data])
                preview_rows.append(preview_row)
            
            # Simple type detection
            suggested_types = []
            suggested_mappings = {}
            
            for header in headers:
                # Simple heuristics for column type detection
                if any(keyword in header.lower() for keyword in ['x', 'east', 'longitude', 'lon']):
                    suggested_types.append(projects_pb2.COLUMN_TYPE_NUMERIC)
                    suggested_mappings[header] = "x"
                elif any(keyword in header.lower() for keyword in ['y', 'north', 'latitude', 'lat']):
                    suggested_types.append(projects_pb2.COLUMN_TYPE_NUMERIC)
                    suggested_mappings[header] = "y"
                elif any(keyword in header.lower() for keyword in ['z', 'elevation', 'height', 'depth']):
                    suggested_types.append(projects_pb2.COLUMN_TYPE_NUMERIC)
                    suggested_mappings[header] = "z"
                elif any(keyword in header.lower() for keyword in ['id', 'name', 'type', 'category']):
                    suggested_types.append(projects_pb2.COLUMN_TYPE_CATEGORICAL)
                    suggested_mappings[header] = ""
                else:
                    suggested_types.append(projects_pb2.COLUMN_TYPE_NUMERIC)  # Default to numeric
                    suggested_mappings[header] = ""
            
            response = projects_pb2.AnalyzeCsvForProjectResponse()
            response.success = True
            response.headers.extend(headers)
            response.preview_rows.extend(preview_rows)
            response.suggested_types.extend(suggested_types)
            response.suggested_mappings.update(suggested_mappings)
            response.total_rows = row_count
            
            print(f"✅ CSV analyzed: {len(headers)} columns, {row_count} rows")
            return response
            
        except Exception as e:
            print(f"❌ Error analyzing CSV: {e}")
            response = projects_pb2.AnalyzeCsvForProjectResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def process_dataset(self, request: projects_pb2.ProcessDatasetRequest) -> projects_pb2.ProcessDatasetResponse:
        """Process dataset with column mappings - data already in DuckDB"""
        try:
            print(f"📊 Processing dataset for file: {request.file_id}")
            
            # Get the DuckDB table name for this file (data is already imported)
            table_name = f"data_{request.file_id.replace('-', '_')}"
            
            # Verify DuckDB table exists and get row count
            try:
                with self.db.engine.connect() as conn:
                    from sqlalchemy import text
                    count_result = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}")).fetchone()
                    total_rows = int(count_result[0])
                    print(f"📊 Found DuckDB table '{table_name}' with {total_rows:,} rows")
            except Exception as e:
                response = projects_pb2.ProcessDatasetResponse()
                response.success = False
                response.error_message = f"DuckDB table not found: {e}"
                return response
            
            # Create dataset record with DuckDB table reference
            column_mappings_list = []
            for mapping in request.column_mappings:
                mapping_dict = {
                    'column_name': mapping.column_name,
                    'column_type': int(mapping.column_type),
                    'mapped_field': mapping.mapped_field,
                    'is_coordinate': mapping.is_coordinate
                }
                column_mappings_list.append(mapping_dict)
            
            # Create dataset record pointing to the DuckDB table
            dataset_data = self.db.create_dataset(request.file_id, table_name, total_rows, column_mappings_list)
            dataset_id = dataset_data.id
            
            print(f"✅ Dataset created: {dataset_id} → DuckDB table '{table_name}'")
            
            response = projects_pb2.ProcessDatasetResponse()
            response.success = True
            response.processed_rows = total_rows
            
            # Populate dataset data
            dataset = response.dataset
            dataset.id = dataset_id
            dataset.file_id = dataset_data.file_id
            dataset.total_rows = dataset_data.total_rows
            dataset.created_at = dataset_data.created_at
            
            # Add column mappings
            import json
            column_mappings = json.loads(dataset_data.column_mappings) if dataset_data.column_mappings else []
            for mapping_dict in column_mappings:
                mapping = dataset.column_mappings.add()
                mapping.column_name = mapping_dict['column_name']
                mapping.column_type = mapping_dict['column_type']
                mapping.mapped_field = mapping_dict['mapped_field']
                mapping.is_coordinate = mapping_dict['is_coordinate']
            
            print(f"✅ Dataset processing complete: {total_rows:,} rows → DuckDB table '{table_name}'")
            return response
            
        except Exception as e:
            print(f"❌ Error processing dataset: {e}")
            response = projects_pb2.ProcessDatasetResponse()
            response.success = False
            response.error_message = str(e)
            return response
    
    def get_dataset_data(self, request: projects_pb2.GetDatasetDataRequest) -> projects_pb2.GetDatasetDataResponse:
        """Get dataset data with pagination from DuckDB"""
        try:
            print(f"📊 Getting dataset data: {request.dataset_id}, page {request.page}")
            
            # Get dataset info first
            dataset = self.db.get_dataset_by_id(request.dataset_id)
            if not dataset:
                response = projects_pb2.GetDatasetDataResponse()
                return response
            
            # Get paginated data from DuckDB
            rows, total_rows, total_pages = self.db.get_dataset_data_from_duckdb(
                request.dataset_id, 
                request.page or 1, 
                request.page_size or 100
            )
            
            response = projects_pb2.GetDatasetDataResponse()
            response.total_rows = total_rows
            response.current_page = request.page or 1
            response.total_pages = total_pages
            
            print(f"🔧 Adding {len(rows)} rows to response...")
            
            # Add rows (convert all values to strings for protobuf)
            for i, row_data in enumerate(rows):
                try:
                    row = response.rows.add()
                    # Convert all values to strings for protobuf map<string, string>
                    string_fields = {}
                    for k, v in row_data.items():
                        try:
                            string_fields[k] = str(v)
                        except Exception as field_e:
                            print(f"❌ Error converting field {k}={v} (type: {type(v)}): {field_e}")
                            string_fields[k] = "ERROR_CONVERTING"
                    
                    row.fields.update(string_fields)
                    if i == 0:  # Log first row for debugging
                        print(f"🔧 First row fields: {string_fields}")
                except Exception as row_e:
                    print(f"❌ Error adding row {i}: {row_e}")
                    break
            
            print(f"🔧 Adding column mappings...")
            
            # Add column mappings
            import json
            try:
                column_mappings = json.loads(dataset.column_mappings) if dataset.column_mappings else []
                for mapping_dict in column_mappings:
                    mapping = response.column_mappings.add()
                    mapping.column_name = mapping_dict['column_name']
                    mapping.column_type = mapping_dict['column_type']
                    mapping.mapped_field = mapping_dict['mapped_field']
                    mapping.is_coordinate = mapping_dict['is_coordinate']
            except Exception as mapping_e:
                print(f"❌ Error adding column mappings: {mapping_e}")
            
            # Get data boundaries from DuckDB table statistics
            try:
                table_name = dataset.duckdb_table_name
                boundaries = self.db.get_duckdb_table_statistics(table_name)
                for col_name, stats in boundaries.items():
                    if stats.get('column_type') == 'numeric' and stats.get('min') is not None:
                        boundary = response.data_boundaries.add()
                        boundary.column_name = col_name
                        boundary.min_value = float(stats['min'])
                        boundary.max_value = float(stats['max'])
                        boundary.valid_count = int(stats.get('count', 0))
            except Exception as e:
                print(f"⚠️  Could not get boundaries: {e}")
            
            print(f"✅ Retrieved {len(rows)} dataset rows from DuckDB")
            return response
            
        except Exception as e:
            import traceback
            print(f"❌ Error getting dataset data: {e}")
            print(f"❌ Full traceback: {traceback.format_exc()}")
            response = projects_pb2.GetDatasetDataResponse()
            return response
    
    def delete_dataset(self, request: projects_pb2.DeleteDatasetRequest) -> projects_pb2.DeleteDatasetResponse:
        """Delete a dataset using efficient bulk operations"""
        try:
            print(f"🗑️  Delete dataset request: {request.dataset_id}")
            
            start_time = time.time()
            success = self.db.delete_dataset(request.dataset_id)
            delete_time = time.time() - start_time
            
            response = projects_pb2.DeleteDatasetResponse()
            response.success = success
            response.delete_time = delete_time
            
            if not success:
                response.error_message = "Dataset not found"
            else:
                print(f"✅ Dataset deleted in {delete_time:.2f}s")
            
            return response
            
        except Exception as e:
            print(f"❌ Error deleting dataset: {e}")
            response = projects_pb2.DeleteDatasetResponse()
            response.success = False
            response.error_message = str(e)
            return response
