#!/usr/bin/env python
"""
File parsers module for handling different file formats (CSV, GSLIB)
"""
import io
import os
import tempfile
from typing import List, Dict, Optional, Tuple
import pandas as pd
from sqlalchemy import Engine, text

try:
    import chardet
    HAS_CHARDET = True
except ImportError:
    HAS_CHARDET = False


class FileParser:
    """
    Unified file parser for CSV and GSLIB formats.

    Handles parsing of different geospatial data file formats into pandas DataFrames,
    with preprocessing options for skipping rows/columns and value replacements.
    """

    @staticmethod
    def detect_encoding(content: bytes) -> Tuple[str, float]:
        """
        Detect the encoding of file content.

        Args:
            content: Raw file bytes

        Returns:
            Tuple of (encoding_name, confidence)
        """
        # Try chardet if available
        if HAS_CHARDET:
            result = chardet.detect(content)
            encoding = result.get('encoding', 'utf-8')
            confidence = result.get('confidence', 0.0)

            # If confidence is low, fall back to common encodings
            if confidence < 0.7:
                return FileParser._try_common_encodings(content)

            return encoding, confidence
        else:
            # Fall back to trying common encodings
            return FileParser._try_common_encodings(content)

    @staticmethod
    def _try_common_encodings(content: bytes) -> Tuple[str, float]:
        """
        Try common encodings to find one that works.

        Args:
            content: Raw file bytes

        Returns:
            Tuple of (encoding_name, confidence)
        """
        # Common encodings to try, in order of priority
        encodings = [
            'utf-8',
            'windows-1252',  # Common on Windows
            'latin-1',       # ISO-8859-1
            'cp1252',        # Windows Western Europe
            'iso-8859-1',
            'utf-16',
            'utf-16-le',
            'utf-16-be',
        ]

        for encoding in encodings:
            try:
                content.decode(encoding)
                return encoding, 1.0
            except (UnicodeDecodeError, AttributeError):
                continue

        # If all fail, use utf-8 with error replacement
        return 'utf-8', 0.0

    @staticmethod
    def parse_to_dataframe(
        content: bytes, 
        filename: str,
        skip_rows: int = 0,
        skip_columns: Optional[List[str]] = None,
        replace_data: Optional[List[Dict[str, str]]] = None
    ) -> pd.DataFrame:
        """
        Parse file content to DataFrame based on file extension.
        
        Args:
            content: Raw file bytes
            filename: Original filename (used to detect format)
            skip_rows: Number of rows to skip from the beginning
            skip_columns: List of column names to drop
            replace_data: List of replacement rules [{'from': old, 'to': new}]
            
        Returns:
            Preprocessed pandas DataFrame
        """
        # Detect format and parse
        if filename.lower().endswith('.out'):
            df = FileParser._parse_gslib(content)
        else:
            df = FileParser._parse_csv(content, skip_rows)
        
        # Apply preprocessing
        df = FileParser._apply_preprocessing(df, skip_columns, replace_data)
        
        return df
    
    @staticmethod
    def _parse_csv(content: bytes, skip_rows: int = 0) -> pd.DataFrame:
        """
        Parse CSV content to DataFrame with automatic encoding detection.

        Args:
            content: Raw CSV bytes
            skip_rows: Number of rows to skip

        Returns:
            pandas DataFrame
        """
        # Detect encoding
        encoding, confidence = FileParser.detect_encoding(content)

        try:
            # Try with detected encoding
            return pd.read_csv(
                io.BytesIO(content),
                encoding=encoding,
                skiprows=skip_rows,
                low_memory=False,
                na_values=['', ' ', 'NA', 'N/A', 'null', 'NULL', 'None', '-'],
                keep_default_na=True
            )
        except (UnicodeDecodeError, pd.errors.ParserError):
            # If detection failed, try with error replacement
            return pd.read_csv(
                io.BytesIO(content),
                encoding='utf-8',
                encoding_errors='replace',  # Replace invalid characters
                skiprows=skip_rows,
                low_memory=False,
                na_values=['', ' ', 'NA', 'N/A', 'null', 'NULL', 'None', '-'],
                keep_default_na=True
            )
    
    @staticmethod
    def _parse_gslib(content: bytes) -> pd.DataFrame:
        """
        Parse GSLIB format file (.out) to DataFrame.
        
        GSLIB format:
        - Line 1: Title/description
        - Line 2: Number of variables
        - Lines 3 to 2+n_vars: Variable names (one per line)
        - Remaining lines: Data values (space/tab separated)
        
        Args:
            content: Raw GSLIB file bytes
            
        Returns:
            pandas DataFrame
        """
        # Decode content to string
        text_content = content.decode('utf-8')
        lines = text_content.strip().split('\n')
        
        if len(lines) < 3:
            raise ValueError("Invalid GSLIB format: file too short")
        
        # Line 2: Number of variables
        try:
            n_vars = int(lines[1].strip())
        except ValueError:
            raise ValueError(f"Invalid GSLIB format: cannot parse number of variables from line 2: '{lines[1]}'")
        
        if len(lines) < 2 + n_vars:
            raise ValueError(f"Invalid GSLIB format: file has {len(lines)} lines but needs at least {2 + n_vars}")
        
        # Lines 3 to 2+n_vars: Variable names
        variable_names = []
        for i in range(2, 2 + n_vars):
            var_name = lines[i].strip()
            if not var_name:
                var_name = f"var_{i-2}"
            variable_names.append(var_name)
        
        # Remaining lines: Data
        data_lines = lines[2 + n_vars:]
        
        # Parse data rows
        data_rows = []
        for line_num, line in enumerate(data_lines, start=2 + n_vars + 1):
            line = line.strip()
            if not line:
                continue
            
            values = line.split()
            
            # Handle mismatched column counts
            if len(values) != n_vars:
                while len(values) < n_vars:
                    values.append(None)
                values = values[:n_vars]
            
            data_rows.append(values)
        
        # Create DataFrame
        df = pd.DataFrame(data_rows, columns=variable_names)
        
        # Convert numeric columns
        for col in df.columns:
            df[col] = pd.to_numeric(df[col], errors='coerce')
        
        return df
    
    @staticmethod
    def _apply_preprocessing(
        df: pd.DataFrame,
        skip_columns: Optional[List[str]] = None,
        replace_data: Optional[List[Dict[str, str]]] = None
    ) -> pd.DataFrame:
        """
        Apply preprocessing to DataFrame.
        
        Args:
            df: Input DataFrame
            skip_columns: Columns to drop
            replace_data: Value replacements to apply
            
        Returns:
            Preprocessed DataFrame
        """
        # Drop specified columns
        if skip_columns:
            cols_to_drop = [col for col in skip_columns if col in df.columns]
            if cols_to_drop:
                df = df.drop(columns=cols_to_drop)
        
        # Apply value replacements
        if replace_data:
            for replacement in replace_data:
                from_val = replacement.get('from', '')
                to_val = replacement.get('to', '')
                
                # Handle "null" -> None
                if to_val.lower() == 'null':
                    to_val = None
                
                df = df.replace(from_val, to_val)
        
        # Clean whitespace-only strings to NULL
        try:
            df = df.map(lambda x: None if isinstance(x, str) and x.strip() == '' else x)
        except AttributeError:
            df = df.applymap(lambda x: None if isinstance(x, str) and x.strip() == '' else x)
        
        # Ensure numeric columns are properly typed
        df = FileParser._ensure_numeric_types(df)
        
        return df
    
    @staticmethod
    def _ensure_numeric_types(df: pd.DataFrame) -> pd.DataFrame:
        """
        Ensure columns that look numeric are stored as numeric types.
        
        This prevents issues where numeric data is stored as strings,
        which can cause display and calculation problems.
        
        Args:
            df: Input DataFrame
            
        Returns:
            DataFrame with proper numeric types
        """
        for col in df.columns:
            # Skip if already numeric
            if pd.api.types.is_numeric_dtype(df[col]):
                continue
            
            # Try to convert to numeric
            try:
                numeric_col = pd.to_numeric(df[col], errors='coerce')
                # Only convert if most values are successfully converted
                # (allows for some NaN values from failed conversions)
                non_null_original = df[col].notna().sum()
                non_null_numeric = numeric_col.notna().sum()
                
                # If we didn't lose too many values (allow up to 10% loss for edge cases)
                if non_null_original == 0 or (non_null_numeric / non_null_original) >= 0.9:
                    df[col] = numeric_col
            except (ValueError, TypeError):
                # Keep as-is if conversion fails
                pass
        
        return df


class DuckDBImporter:
    """
    Handles importing DataFrames into DuckDB tables.
    """
    
    def __init__(self, engine: Engine):
        self.engine = engine
    
    def import_dataframe(self, df: pd.DataFrame, table_name: str) -> bool:
        """
        Import a pandas DataFrame into a DuckDB table.

        Args:
            df: DataFrame to import
            table_name: Target table name

        Returns:
            True if successful
        """
        # Write to temporary CSV file with explicit UTF-8 encoding
        with tempfile.NamedTemporaryFile(mode='w', suffix='.csv', delete=False, newline='', encoding='utf-8') as temp_file:
            df.to_csv(temp_file, index=False, encoding='utf-8')
            temp_csv_path = temp_file.name

        try:
            # Use forward slashes for path (works on both Windows and Unix)
            temp_csv_path_normalized = temp_csv_path.replace('\\', '/')

            with self.engine.connect() as conn:
                with conn.begin():
                    conn.execute(text(f"""
                        CREATE OR REPLACE TABLE {table_name} AS
                        SELECT * FROM read_csv_auto(
                            '{temp_csv_path_normalized}',
                            nullstr = '',
                            sample_size = -1,
                            ignore_errors = false
                        )
                    """))
            return True
        finally:
            os.unlink(temp_csv_path)
    
    def import_file(
        self,
        content: bytes,
        filename: str,
        table_name: str,
        skip_rows: int = 0,
        skip_columns: Optional[List[str]] = None,
        replace_data: Optional[List[Dict[str, str]]] = None
    ) -> bool:
        """
        Parse and import a file directly into DuckDB.
        
        Args:
            content: Raw file bytes
            filename: Original filename
            table_name: Target table name
            skip_rows: Rows to skip
            skip_columns: Columns to drop
            replace_data: Value replacements
            
        Returns:
            True if successful
        """
        df = FileParser.parse_to_dataframe(
            content, filename, skip_rows, skip_columns, replace_data
        )
        return self.import_dataframe(df, table_name)

