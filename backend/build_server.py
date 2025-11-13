#!/usr/bin/env python
"""

"""
import os
import sys
import subprocess
from pathlib import Path

def build_server():
    # Setup de paths
    backend_dir = Path(__file__).parent
    os.chdir(backend_dir)
    
    # Se arma imagen con pyinstaller
    cmd = [
        sys.executable, '-m', 'PyInstaller',
        '--onedir',
        '--name=grpc-server',
        '--distpath=dist',
        '--workpath=build',
        '--specpath=.',
        '--clean',
        '--noconfirm',
        '--add-data=generated:generated',
        'grpc_server.py'
    ]
    
    print(f"Ejecutando {' '.join(cmd)}")
    result = subprocess.run(cmd)
    
    if result.returncode == 0:
        print("✅ gRPC server construido correctamente!")
        print(f"📁 Output: {backend_dir}/dist/grpc-server/")
    else:
        print("❌ Error al construir el servidor gRPC!")
        sys.exit(1)

if __name__ == '__main__':
    build_server() 