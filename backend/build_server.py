#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""
Build script for gRPC server using PyInstaller
"""
import os
import sys
import subprocess
from pathlib import Path

def build_server():
    # Setup de paths
    backend_dir = Path(__file__).parent
    os.chdir(backend_dir)
    
    # Verificar que el directorio generated existe
    generated_dir = backend_dir / 'generated'
    if not generated_dir.exists():
        print(f"ERROR: Directory '{generated_dir}' does not exist!")
        print("Please run 'npm run generate:protos' first to generate proto files.")
        sys.exit(1)
    
    # Se arma imagen con pyinstaller
    # Usar el separador correcto según el sistema operativo
    separator = ';' if sys.platform == 'win32' else ':'
    
    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--onedir',
        '--name=grpc-server',
        '--distpath=dist',
        '--workpath=build',
        '--specpath=.',
        '--clean',
        '--noconfirm',
        f'--add-data=generated{separator}generated',
        'grpc_server.py'
    ]
    
    print(f"Ejecutando {' '.join(cmd)}")
    result = subprocess.run(cmd, encoding='utf-8', errors='replace')
    
    if result.returncode == 0:
        print("[SUCCESS] gRPC server construido correctamente!")
        print(f"[OUTPUT] {backend_dir}/dist/grpc-server/")
    else:
        print("[ERROR] Error al construir el servidor gRPC!")
        sys.exit(1)

if __name__ == '__main__':
    build_server() 