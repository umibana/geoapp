"""
In-memory file cache for temporary file storage before DuckDB import.

This module provides a global cache to store uploaded files in memory
until the user confirms dataset processing via "Guardar Dataset".
"""

import time
from typing import Dict, Optional, Any
from threading import Lock


class FileCache:
    """Thread-safe in-memory cache for temporary file storage."""

    def __init__(self):
        self._cache: Dict[str, Dict[str, Any]] = {}
        self._lock = Lock()

    def store(
        self,
        file_id: str,
        file_content: bytes,
        original_filename: str,
        preprocessing: Dict[str, Any],
        metadata: Dict[str, Any]
    ) -> None:
        """
        Store a file in the cache.

        Args:
            file_id: Unique identifier for the file
            file_content: Raw file bytes
            original_filename: Original filename
            preprocessing: Dict with skip_rows, skip_columns, replace_data
            metadata: Dict with project_id, name, dataset_type, extra_metadata, etc.
        """
        with self._lock:
            self._cache[file_id] = {
                'file_content': file_content,
                'original_filename': original_filename,
                'preprocessing': preprocessing,
                'metadata': metadata,
                'timestamp': int(time.time())
            }

    def get(self, file_id: str) -> Optional[Dict[str, Any]]:
        """
        Retrieve a file from the cache.

        Args:
            file_id: File identifier

        Returns:
            Dict with file data or None if not found
        """
        with self._lock:
            return self._cache.get(file_id)

    def exists(self, file_id: str) -> bool:
        """Check if a file exists in the cache."""
        with self._lock:
            return file_id in self._cache

    def delete(self, file_id: str) -> bool:
        """
        Delete a file from the cache.

        Args:
            file_id: File identifier

        Returns:
            True if deleted, False if not found
        """
        with self._lock:
            if file_id in self._cache:
                del self._cache[file_id]
                return True
            return False

    def cleanup_old(self, max_age_seconds: int = 3600) -> int:
        """
        Remove files older than max_age_seconds.

        Args:
            max_age_seconds: Maximum age in seconds (default 1 hour)

        Returns:
            Number of files removed
        """
        current_time = int(time.time())
        removed_count = 0

        with self._lock:
            expired_ids = [
                file_id
                for file_id, data in self._cache.items()
                if current_time - data['timestamp'] > max_age_seconds
            ]

            for file_id in expired_ids:
                del self._cache[file_id]
                removed_count += 1

        return removed_count

    def clear_all(self) -> int:
        """
        Clear all cached files.

        Returns:
            Number of files removed
        """
        with self._lock:
            count = len(self._cache)
            self._cache.clear()
            return count

    def get_cache_size(self) -> int:
        """Get the number of files currently in cache."""
        with self._lock:
            return len(self._cache)

    def get_total_bytes(self) -> int:
        """Get total bytes stored in cache."""
        with self._lock:
            return sum(len(data['file_content']) for data in self._cache.values())


# Global singleton instance
file_cache = FileCache()
