#!/usr/bin/env python
"""
Módulo de benchmark para comparar SQLite vs DuckDB
Ejecuta operaciones idénticas en ambas bases de datos y mide el rendimiento
"""
import os
import time
import tempfile
import sqlite3
from typing import Dict, List, Any, Tuple
from pathlib import Path

import numpy as np
import duckdb

# Add generated directory to path for protobuf imports
script_dir = Path(__file__).parent.absolute()
import sys
sys.path.insert(0, str(script_dir / 'generated'))

import geospatial_pb2


class DatabaseBenchmark:
    """
    Clase para ejecutar benchmarks comparativos entre SQLite y DuckDB.
    Utiliza datos sintéticos generados con numpy para asegurar reproducibilidad.
    """

    def __init__(self):
        self.temp_dir = tempfile.mkdtemp(prefix="db_benchmark_")
        self.sqlite_path = os.path.join(self.temp_dir, "benchmark_sqlite.db")
        self.duckdb_path = os.path.join(self.temp_dir, "benchmark_duckdb.db")

    def cleanup(self):
        """Limpia los archivos de base de datos temporales"""
        try:
            if os.path.exists(self.sqlite_path):
                os.remove(self.sqlite_path)
            if os.path.exists(self.duckdb_path):
                os.remove(self.duckdb_path)
            if os.path.exists(self.temp_dir):
                os.rmdir(self.temp_dir)
        except Exception as e:
            print(f"⚠️ Error limpiando archivos temporales: {e}")

    def generate_test_data(self, num_rows: int, seed: int = None) -> Dict[str, np.ndarray]:
        """
        Genera datos de prueba sintéticos para el benchmark.
        Similar al generador de datos geoespaciales pero optimizado para pruebas de BD.
        """
        if seed is not None:
            np.random.seed(seed)
        else:
            np.random.seed(int(time.time() * 1000) % 2**32)

        # Generar datos geoespaciales sintéticos
        ids = np.arange(num_rows)
        latitudes = np.random.uniform(-33.6, -33.3, num_rows).astype(np.float64)
        longitudes = np.random.uniform(-70.8, -70.5, num_rows).astype(np.float64)

        # Valores derivados (similar a data_generation.py)
        elevations = 100 + 50 * np.sin(latitudes * 0.1) * np.cos(longitudes * 0.1)
        temperatures = 20 + 15 * np.sin(latitudes * 0.05) + np.random.uniform(-5, 5, num_rows)
        pressures = 1013 + 50 * np.cos(longitudes * 0.03) + np.random.uniform(-10, 10, num_rows)
        humidities = np.clip(50 + 30 * np.sin((latitudes + longitudes) * 0.02) + np.random.uniform(-10, 10, num_rows), 0, 100)

        # Categorías aleatorias para pruebas de filtrado
        categories = np.random.choice(['A', 'B', 'C', 'D', 'E'], num_rows)

        return {
            'id': ids,
            'latitude': latitudes,
            'longitude': longitudes,
            'elevation': elevations,
            'temperature': temperatures,
            'pressure': pressures,
            'humidity': humidities,
            'category': categories
        }

    def _measure_time(self, func) -> Tuple[float, Any]:
        """Mide el tiempo de ejecución de una función en milisegundos"""
        start = time.perf_counter()
        result = func()
        end = time.perf_counter()
        return (end - start) * 1000, result

    # =========================================================================
    # OPERACIONES SQLite
    # =========================================================================

    def sqlite_create_table(self, conn: sqlite3.Connection):
        """Crea la tabla de prueba en SQLite"""
        conn.execute('''
            CREATE TABLE IF NOT EXISTS geospatial_data (
                id INTEGER PRIMARY KEY,
                latitude REAL,
                longitude REAL,
                elevation REAL,
                temperature REAL,
                pressure REAL,
                humidity REAL,
                category TEXT
            )
        ''')
        conn.commit()

    def sqlite_insert_data(self, conn: sqlite3.Connection, data: Dict[str, np.ndarray]) -> int:
        """Inserta datos en SQLite"""
        rows = list(zip(
            data['id'].tolist(),
            data['latitude'].tolist(),
            data['longitude'].tolist(),
            data['elevation'].tolist(),
            data['temperature'].tolist(),
            data['pressure'].tolist(),
            data['humidity'].tolist(),
            data['category'].tolist()
        ))

        conn.executemany('''
            INSERT INTO geospatial_data
            (id, latitude, longitude, elevation, temperature, pressure, humidity, category)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ''', rows)
        conn.commit()
        return len(rows)

    def sqlite_query_all(self, conn: sqlite3.Connection) -> int:
        """Consulta todos los registros en SQLite"""
        cursor = conn.execute('SELECT * FROM geospatial_data')
        rows = cursor.fetchall()
        return len(rows)

    def sqlite_aggregation(self, conn: sqlite3.Connection) -> Dict[str, float]:
        """Ejecuta agregaciones en SQLite"""
        cursor = conn.execute('''
            SELECT
                AVG(elevation) as avg_elevation,
                MIN(temperature) as min_temp,
                MAX(temperature) as max_temp,
                SUM(pressure) as total_pressure,
                COUNT(*) as count
            FROM geospatial_data
        ''')
        row = cursor.fetchone()
        return {
            'avg_elevation': row[0],
            'min_temp': row[1],
            'max_temp': row[2],
            'total_pressure': row[3],
            'count': row[4]
        }

    def sqlite_filter(self, conn: sqlite3.Connection) -> int:
        """Ejecuta consulta con filtros complejos en SQLite"""
        cursor = conn.execute('''
            SELECT * FROM geospatial_data
            WHERE temperature > 20
            AND humidity BETWEEN 40 AND 70
            AND category IN ('A', 'B', 'C')
            ORDER BY elevation DESC
        ''')
        rows = cursor.fetchall()
        return len(rows)

    def sqlite_group_by(self, conn: sqlite3.Connection) -> int:
        """Ejecuta GROUP BY en SQLite"""
        cursor = conn.execute('''
            SELECT
                category,
                AVG(elevation) as avg_elevation,
                AVG(temperature) as avg_temperature,
                COUNT(*) as count
            FROM geospatial_data
            GROUP BY category
            ORDER BY avg_elevation DESC
        ''')
        rows = cursor.fetchall()
        return len(rows)

    # =========================================================================
    # OPERACIONES DuckDB
    # =========================================================================

    def duckdb_create_table(self, conn: duckdb.DuckDBPyConnection):
        """Crea la tabla de prueba en DuckDB"""
        conn.execute('''
            CREATE TABLE IF NOT EXISTS geospatial_data (
                id INTEGER PRIMARY KEY,
                latitude DOUBLE,
                longitude DOUBLE,
                elevation DOUBLE,
                temperature DOUBLE,
                pressure DOUBLE,
                humidity DOUBLE,
                category VARCHAR
            )
        ''')

    def duckdb_insert_data(self, conn: duckdb.DuckDBPyConnection, data: Dict[str, np.ndarray]) -> int:
        """Inserta datos en DuckDB usando inserción directa desde numpy"""
        # DuckDB puede insertar directamente desde numpy arrays
        conn.execute('''
            INSERT INTO geospatial_data
            SELECT * FROM (
                SELECT
                    unnest($1::INTEGER[]) as id,
                    unnest($2::DOUBLE[]) as latitude,
                    unnest($3::DOUBLE[]) as longitude,
                    unnest($4::DOUBLE[]) as elevation,
                    unnest($5::DOUBLE[]) as temperature,
                    unnest($6::DOUBLE[]) as pressure,
                    unnest($7::DOUBLE[]) as humidity,
                    unnest($8::VARCHAR[]) as category
            )
        ''', [
            data['id'].tolist(),
            data['latitude'].tolist(),
            data['longitude'].tolist(),
            data['elevation'].tolist(),
            data['temperature'].tolist(),
            data['pressure'].tolist(),
            data['humidity'].tolist(),
            data['category'].tolist()
        ])
        return len(data['id'])

    def duckdb_query_all(self, conn: duckdb.DuckDBPyConnection) -> int:
        """Consulta todos los registros en DuckDB"""
        result = conn.execute('SELECT * FROM geospatial_data').fetchall()
        return len(result)

    def duckdb_aggregation(self, conn: duckdb.DuckDBPyConnection) -> Dict[str, float]:
        """Ejecuta agregaciones en DuckDB"""
        result = conn.execute('''
            SELECT
                AVG(elevation) as avg_elevation,
                MIN(temperature) as min_temp,
                MAX(temperature) as max_temp,
                SUM(pressure) as total_pressure,
                COUNT(*) as count
            FROM geospatial_data
        ''').fetchone()
        return {
            'avg_elevation': result[0],
            'min_temp': result[1],
            'max_temp': result[2],
            'total_pressure': result[3],
            'count': result[4]
        }

    def duckdb_filter(self, conn: duckdb.DuckDBPyConnection) -> int:
        """Ejecuta consulta con filtros complejos en DuckDB"""
        result = conn.execute('''
            SELECT * FROM geospatial_data
            WHERE temperature > 20
            AND humidity BETWEEN 40 AND 70
            AND category IN ('A', 'B', 'C')
            ORDER BY elevation DESC
        ''').fetchall()
        return len(result)

    def duckdb_group_by(self, conn: duckdb.DuckDBPyConnection) -> int:
        """Ejecuta GROUP BY en DuckDB"""
        result = conn.execute('''
            SELECT
                category,
                AVG(elevation) as avg_elevation,
                AVG(temperature) as avg_temperature,
                COUNT(*) as count
            FROM geospatial_data
            GROUP BY category
            ORDER BY avg_elevation DESC
        ''').fetchall()
        return len(result)

    # =========================================================================
    # BENCHMARK PRINCIPAL
    # =========================================================================

    def run_benchmark(self, request) -> geospatial_pb2.DatabaseBenchmarkResponse:
        """
        Ejecuta el benchmark completo comparando SQLite vs DuckDB
        """
        response = geospatial_pb2.DatabaseBenchmarkResponse()

        try:
            num_rows = request.num_rows if request.num_rows > 0 else 10000
            seed = request.seed if request.seed > 0 else None

            print(f"🏁 Iniciando benchmark: {num_rows:,} filas, seed={seed}")

            # Generar datos de prueba
            print("📊 Generando datos de prueba...")
            data = self.generate_test_data(num_rows, seed)

            # Conectar a ambas bases de datos
            sqlite_conn = sqlite3.connect(self.sqlite_path)
            duckdb_conn = duckdb.connect(self.duckdb_path)

            operations = []
            total_sqlite_time = 0
            total_duckdb_time = 0

            # =====================================================================
            # PRUEBA: CREACIÓN DE TABLA
            # =====================================================================
            print("📋 Prueba: Creación de tabla...")

            sqlite_time, _ = self._measure_time(lambda: self.sqlite_create_table(sqlite_conn))
            duckdb_time, _ = self._measure_time(lambda: self.duckdb_create_table(duckdb_conn))

            op = geospatial_pb2.BenchmarkOperation()
            op.operation_name = "CREATE TABLE"
            op.sqlite_time_ms = sqlite_time
            op.duckdb_time_ms = duckdb_time
            op.sqlite_rows_affected = 0
            op.duckdb_rows_affected = 0
            op.winner = "sqlite" if sqlite_time < duckdb_time else "duckdb"
            op.speedup_factor = max(sqlite_time, duckdb_time) / max(min(sqlite_time, duckdb_time), 0.001)
            operations.append(op)
            total_sqlite_time += sqlite_time
            total_duckdb_time += duckdb_time

            # =====================================================================
            # PRUEBA: INSERCIÓN DE DATOS
            # =====================================================================
            if request.run_insert:
                print("📥 Prueba: Inserción de datos...")

                sqlite_time, sqlite_rows = self._measure_time(
                    lambda: self.sqlite_insert_data(sqlite_conn, data)
                )
                duckdb_time, duckdb_rows = self._measure_time(
                    lambda: self.duckdb_insert_data(duckdb_conn, data)
                )

                op = geospatial_pb2.BenchmarkOperation()
                op.operation_name = "INSERT"
                op.sqlite_time_ms = sqlite_time
                op.duckdb_time_ms = duckdb_time
                op.sqlite_rows_affected = sqlite_rows
                op.duckdb_rows_affected = duckdb_rows
                op.winner = "sqlite" if sqlite_time < duckdb_time else "duckdb"
                op.speedup_factor = max(sqlite_time, duckdb_time) / max(min(sqlite_time, duckdb_time), 0.001)
                operations.append(op)
                total_sqlite_time += sqlite_time
                total_duckdb_time += duckdb_time

                print(f"   SQLite: {sqlite_time:.2f}ms, DuckDB: {duckdb_time:.2f}ms")

            # =====================================================================
            # PRUEBA: CONSULTA TODOS LOS DATOS
            # =====================================================================
            if request.run_query:
                print("🔍 Prueba: Consulta SELECT *...")

                sqlite_time, sqlite_rows = self._measure_time(
                    lambda: self.sqlite_query_all(sqlite_conn)
                )
                duckdb_time, duckdb_rows = self._measure_time(
                    lambda: self.duckdb_query_all(duckdb_conn)
                )

                op = geospatial_pb2.BenchmarkOperation()
                op.operation_name = "SELECT ALL"
                op.sqlite_time_ms = sqlite_time
                op.duckdb_time_ms = duckdb_time
                op.sqlite_rows_affected = sqlite_rows
                op.duckdb_rows_affected = duckdb_rows
                op.winner = "sqlite" if sqlite_time < duckdb_time else "duckdb"
                op.speedup_factor = max(sqlite_time, duckdb_time) / max(min(sqlite_time, duckdb_time), 0.001)
                operations.append(op)
                total_sqlite_time += sqlite_time
                total_duckdb_time += duckdb_time

                print(f"   SQLite: {sqlite_time:.2f}ms, DuckDB: {duckdb_time:.2f}ms")

            # =====================================================================
            # PRUEBA: AGREGACIONES
            # =====================================================================
            if request.run_aggregation:
                print("📈 Prueba: Agregaciones (AVG, MIN, MAX, SUM, COUNT)...")

                sqlite_time, _ = self._measure_time(
                    lambda: self.sqlite_aggregation(sqlite_conn)
                )
                duckdb_time, _ = self._measure_time(
                    lambda: self.duckdb_aggregation(duckdb_conn)
                )

                op = geospatial_pb2.BenchmarkOperation()
                op.operation_name = "AGGREGATION"
                op.sqlite_time_ms = sqlite_time
                op.duckdb_time_ms = duckdb_time
                op.sqlite_rows_affected = num_rows
                op.duckdb_rows_affected = num_rows
                op.winner = "sqlite" if sqlite_time < duckdb_time else "duckdb"
                op.speedup_factor = max(sqlite_time, duckdb_time) / max(min(sqlite_time, duckdb_time), 0.001)
                operations.append(op)
                total_sqlite_time += sqlite_time
                total_duckdb_time += duckdb_time

                print(f"   SQLite: {sqlite_time:.2f}ms, DuckDB: {duckdb_time:.2f}ms")

                # GROUP BY
                print("📊 Prueba: GROUP BY con agregaciones...")

                sqlite_time, sqlite_rows = self._measure_time(
                    lambda: self.sqlite_group_by(sqlite_conn)
                )
                duckdb_time, duckdb_rows = self._measure_time(
                    lambda: self.duckdb_group_by(duckdb_conn)
                )

                op = geospatial_pb2.BenchmarkOperation()
                op.operation_name = "GROUP BY"
                op.sqlite_time_ms = sqlite_time
                op.duckdb_time_ms = duckdb_time
                op.sqlite_rows_affected = sqlite_rows
                op.duckdb_rows_affected = duckdb_rows
                op.winner = "sqlite" if sqlite_time < duckdb_time else "duckdb"
                op.speedup_factor = max(sqlite_time, duckdb_time) / max(min(sqlite_time, duckdb_time), 0.001)
                operations.append(op)
                total_sqlite_time += sqlite_time
                total_duckdb_time += duckdb_time

                print(f"   SQLite: {sqlite_time:.2f}ms, DuckDB: {duckdb_time:.2f}ms")

            # =====================================================================
            # PRUEBA: FILTRADO COMPLEJO
            # =====================================================================
            if request.run_filter:
                print("🔎 Prueba: Filtrado complejo (WHERE + ORDER BY)...")

                sqlite_time, sqlite_rows = self._measure_time(
                    lambda: self.sqlite_filter(sqlite_conn)
                )
                duckdb_time, duckdb_rows = self._measure_time(
                    lambda: self.duckdb_filter(duckdb_conn)
                )

                op = geospatial_pb2.BenchmarkOperation()
                op.operation_name = "FILTER + ORDER"
                op.sqlite_time_ms = sqlite_time
                op.duckdb_time_ms = duckdb_time
                op.sqlite_rows_affected = sqlite_rows
                op.duckdb_rows_affected = duckdb_rows
                op.winner = "sqlite" if sqlite_time < duckdb_time else "duckdb"
                op.speedup_factor = max(sqlite_time, duckdb_time) / max(min(sqlite_time, duckdb_time), 0.001)
                operations.append(op)
                total_sqlite_time += sqlite_time
                total_duckdb_time += duckdb_time

                print(f"   SQLite: {sqlite_time:.2f}ms ({sqlite_rows} filas), DuckDB: {duckdb_time:.2f}ms ({duckdb_rows} filas)")

            # Cerrar conexiones
            sqlite_conn.close()
            duckdb_conn.close()

            # Obtener tamaños de archivos
            sqlite_size = os.path.getsize(self.sqlite_path) if os.path.exists(self.sqlite_path) else 0
            duckdb_size = os.path.getsize(self.duckdb_path) if os.path.exists(self.duckdb_path) else 0

            # Construir respuesta
            response.success = True
            response.num_rows = num_rows
            response.seed = seed if seed else 0
            response.generated_at = time.time()

            for op in operations:
                response.operations.append(op)

            response.total_sqlite_time_ms = total_sqlite_time
            response.total_duckdb_time_ms = total_duckdb_time
            response.overall_winner = "sqlite" if total_sqlite_time < total_duckdb_time else "duckdb"
            response.sqlite_db_size_bytes = sqlite_size
            response.duckdb_db_size_bytes = duckdb_size

            print(f"✅ Benchmark completado:")
            print(f"   Total SQLite: {total_sqlite_time:.2f}ms")
            print(f"   Total DuckDB: {total_duckdb_time:.2f}ms")
            print(f"   Ganador: {response.overall_winner.upper()}")
            print(f"   Tamaño SQLite: {sqlite_size:,} bytes")
            print(f"   Tamaño DuckDB: {duckdb_size:,} bytes")

        except Exception as e:
            print(f"❌ Error en benchmark: {e}")
            response.success = False
            response.error_message = str(e)

        finally:
            # Limpiar archivos temporales
            self.cleanup()

        return response
