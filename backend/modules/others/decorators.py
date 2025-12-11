#!/usr/bin/env python
"""
Decorators module for common patterns
"""
from functools import wraps
from typing import Type, Callable, Any
import traceback


def grpc_response(response_class: Type):
    """
    Decorator to handle try/except and response building for gRPC methods.
    
    Automatically catches exceptions and returns a properly formatted error response.
    The wrapped function should return a response object on success, or the decorator
    will catch any exception and set success=False with the error message.
    
    Usage:
        @grpc_response(projects_pb2.CreateFileResponse)
        def create_file(self, request):
            # Just focus on the logic - no try/except needed
            response = projects_pb2.CreateFileResponse()
            response.success = True
            return response
    
    Args:
        response_class: The protobuf response class to instantiate on error
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            try:
                return func(*args, **kwargs)
            except Exception as e:
                print(f"[ERROR] {func.__name__}: {str(e)}")
                traceback.print_exc()
                response = response_class()
                response.success = False
                response.error_message = str(e)
                return response
        return wrapper
    return decorator


def log_call(prefix: str = ""):
    """
    Decorator to log function calls with optional prefix.
    
    Usage:
        @log_call("[ProjectManager]")
        def create_file(self, request):
            ...
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        def wrapper(*args, **kwargs) -> Any:
            log_prefix = f"{prefix} " if prefix else ""
            print(f"{log_prefix}Calling {func.__name__}")
            result = func(*args, **kwargs)
            print(f"{log_prefix}{func.__name__} completed")
            return result
        return wrapper
    return decorator

