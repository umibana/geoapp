#!/usr/bin/env python
"""
Progress tracker for long-running operations.

Provides in-memory storage of operation progress that can be polled by clients.
"""
import time
import threading
from typing import Dict, Optional, Any
from dataclasses import dataclass, field
from enum import Enum


class OperationStatus(Enum):
    """Status of an operation."""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    FAILED = "failed"


@dataclass
class OperationProgress:
    """Progress information for an operation."""
    operation_id: str
    operation_type: str  # e.g., "create_file", "process_dataset"
    progress: int = 0  # 0-100
    status: OperationStatus = OperationStatus.PENDING
    message: str = ""
    started_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)
    result: Optional[Any] = None
    error: Optional[str] = None
    
    def to_dict(self) -> Dict:
        """Convert to dictionary for gRPC response."""
        return {
            'operation_id': self.operation_id,
            'operation_type': self.operation_type,
            'progress': self.progress,
            'status': self.status.value,
            'message': self.message,
            'started_at': int(self.started_at),
            'updated_at': int(self.updated_at),
            'error': self.error or ''
        }


class ProgressTracker:
    """
    Thread-safe in-memory progress tracker for operations.
    
    Usage:
        tracker = ProgressTracker()
        
        # Start tracking
        op_id = tracker.start("create_file", "Importing file...")
        
        # Update progress
        tracker.update(op_id, 25, "Parsing CSV...")
        tracker.update(op_id, 50, "Writing to database...")
        tracker.update(op_id, 75, "Generating statistics...")
        
        # Complete
        tracker.complete(op_id, result={"file_id": "abc123"})
        
        # Check if cancelled (in long operation)
        if tracker.is_cancelled(op_id):
            return  # Exit early
    """
    
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        """Singleton pattern - only one tracker instance."""
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._operations: Dict[str, OperationProgress] = {}
                    cls._instance._op_lock = threading.Lock()
        return cls._instance
    
    def start(self, operation_type: str, message: str = "") -> str:
        """
        Start tracking a new operation.
        
        Args:
            operation_type: Type of operation (e.g., "create_file")
            message: Initial status message
            
        Returns:
            operation_id: Unique ID for this operation
        """
        import uuid
        operation_id = str(uuid.uuid4())
        
        with self._op_lock:
            self._operations[operation_id] = OperationProgress(
                operation_id=operation_id,
                operation_type=operation_type,
                progress=0,
                status=OperationStatus.RUNNING,
                message=message
            )
        
        print(f"[PROGRESS] Started {operation_type}: {operation_id}")
        return operation_id
    
    def update(self, operation_id: str, progress: int, message: str = "") -> bool:
        """
        Update operation progress.
        
        Args:
            operation_id: Operation ID
            progress: Progress percentage (0-100)
            message: Status message
            
        Returns:
            True if updated, False if operation not found or cancelled
        """
        with self._op_lock:
            op = self._operations.get(operation_id)
            if not op:
                return False
            
            if op.status == OperationStatus.CANCELLED:
                return False
            
            op.progress = min(max(progress, 0), 100)
            op.message = message
            op.updated_at = time.time()
            
        return True
    
    def complete(self, operation_id: str, result: Any = None) -> None:
        """Mark operation as completed."""
        with self._op_lock:
            op = self._operations.get(operation_id)
            if op:
                op.status = OperationStatus.COMPLETED
                op.progress = 100
                op.message = "Completed"
                op.result = result
                op.updated_at = time.time()
                print(f"[PROGRESS] Completed: {operation_id}")
    
    def fail(self, operation_id: str, error: str) -> None:
        """Mark operation as failed."""
        with self._op_lock:
            op = self._operations.get(operation_id)
            if op:
                op.status = OperationStatus.FAILED
                op.error = error
                op.message = f"Failed: {error}"
                op.updated_at = time.time()
                print(f"[PROGRESS] Failed: {operation_id} - {error}")
    
    def cancel(self, operation_id: str) -> bool:
        """
        Request cancellation of an operation.
        
        Args:
            operation_id: Operation ID to cancel
            
        Returns:
            True if cancelled, False if not found or already completed
        """
        with self._op_lock:
            op = self._operations.get(operation_id)
            if not op:
                return False
            
            if op.status in (OperationStatus.COMPLETED, OperationStatus.FAILED):
                return False
            
            op.status = OperationStatus.CANCELLED
            op.message = "Cancelled by user"
            op.updated_at = time.time()
            print(f"[PROGRESS] Cancelled: {operation_id}")
            return True
    
    def is_cancelled(self, operation_id: str) -> bool:
        """Check if operation was cancelled."""
        with self._op_lock:
            op = self._operations.get(operation_id)
            return op is not None and op.status == OperationStatus.CANCELLED
    
    def get(self, operation_id: str) -> Optional[OperationProgress]:
        """Get operation progress."""
        with self._op_lock:
            return self._operations.get(operation_id)
    
    def get_active(self) -> Dict[str, OperationProgress]:
        """Get all active (running) operations."""
        with self._op_lock:
            return {
                op_id: op 
                for op_id, op in self._operations.items() 
                if op.status == OperationStatus.RUNNING
            }
    
    def cleanup_old(self, max_age_seconds: int = 300) -> int:
        """
        Remove completed/failed operations older than max_age.
        
        Args:
            max_age_seconds: Maximum age in seconds (default 5 minutes)
            
        Returns:
            Number of operations removed
        """
        now = time.time()
        removed = 0
        
        with self._op_lock:
            to_remove = [
                op_id 
                for op_id, op in self._operations.items()
                if op.status in (OperationStatus.COMPLETED, OperationStatus.FAILED, OperationStatus.CANCELLED)
                and (now - op.updated_at) > max_age_seconds
            ]
            
            for op_id in to_remove:
                del self._operations[op_id]
                removed += 1
        
        return removed


# Global singleton instance
progress_tracker = ProgressTracker()


class ProgressContext:
    """
    Context manager for tracking operation progress.
    
    Usage:
        with ProgressContext("create_file") as ctx:
            ctx.update(10, "Starting...")
            do_work()
            ctx.update(50, "Halfway...")
            do_more_work()
            # Automatically completes on exit
    """
    
    def __init__(self, operation_type: str, initial_message: str = ""):
        self.operation_type = operation_type
        self.initial_message = initial_message
        self.operation_id: Optional[str] = None
        self._tracker = progress_tracker
    
    def __enter__(self) -> 'ProgressContext':
        self.operation_id = self._tracker.start(self.operation_type, self.initial_message)
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        if self.operation_id:
            if exc_type is not None:
                self._tracker.fail(self.operation_id, str(exc_val))
            elif not self.is_cancelled:
                self._tracker.complete(self.operation_id)
        return False  # Don't suppress exceptions
    
    def update(self, progress: int, message: str = "") -> bool:
        """Update progress. Returns False if cancelled."""
        if self.operation_id:
            return self._tracker.update(self.operation_id, progress, message)
        return False
    
    @property
    def is_cancelled(self) -> bool:
        """Check if operation was cancelled."""
        if self.operation_id:
            return self._tracker.is_cancelled(self.operation_id)
        return False
    
    def check_cancelled(self) -> None:
        """Raise exception if cancelled."""
        if self.is_cancelled:
            raise OperationCancelledException(self.operation_id)


class OperationCancelledException(Exception):
    """Raised when an operation is cancelled."""
    def __init__(self, operation_id: str):
        self.operation_id = operation_id
        super().__init__(f"Operation {operation_id} was cancelled")

