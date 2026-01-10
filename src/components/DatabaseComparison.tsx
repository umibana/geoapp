import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';

interface BenchmarkOperation {
  operation_name: string;
  sqlite_time_ms: number;
  duckdb_time_ms: number;
  sqlite_rows_affected: number;
  duckdb_rows_affected: number;
  winner: string;
  speedup_factor: number;
}

interface DatabaseBenchmarkResult {
  success: boolean;
  error_message?: string;
  num_rows: number;
  seed: number;
  generated_at: number;
  operations: BenchmarkOperation[];
  total_sqlite_time_ms: number;
  total_duckdb_time_ms: number;
  overall_winner: string;
  sqlite_db_size_bytes: number;
  duckdb_db_size_bytes: number;
  timestamp?: string;
}

export function DatabaseComparison() {
  const [results, setResults] = useState<DatabaseBenchmarkResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [numRows, setNumRows] = useState<number>(100000);
  const [runInsert, setRunInsert] = useState(true);
  const [runQuery, setRunQuery] = useState(true);
  const [runAggregation, setRunAggregation] = useState(true);
  const [runFilter, setRunFilter] = useState(true);

  const generateSeed = () => Math.floor(Math.random() * 1000000);

  const runBenchmark = async () => {
    setIsLoading(true);
    const seed = generateSeed();
    const timestamp = new Date().toISOString();

    try {
      // Usar gRPC (Protocol Buffers) para la comunicación
      const response = await window.autoGrpc.runDatabaseBenchmark({
        num_rows: numRows,
        seed: seed,
        run_insert: runInsert,
        run_query: runQuery,
        run_aggregation: runAggregation,
        run_filter: runFilter,
      });

      const result: DatabaseBenchmarkResult = {
        success: response.success,
        error_message: response.error_message,
        num_rows: response.num_rows,
        seed: response.seed,
        generated_at: response.generated_at,
        operations: response.operations || [],
        total_sqlite_time_ms: response.total_sqlite_time_ms,
        total_duckdb_time_ms: response.total_duckdb_time_ms,
        overall_winner: response.overall_winner,
        sqlite_db_size_bytes: response.sqlite_db_size_bytes,
        duckdb_db_size_bytes: response.duckdb_db_size_bytes,
        timestamp,
      };

      setResults(prev => [result, ...prev]);
    } catch (error) {
      const errorResult: DatabaseBenchmarkResult = {
        success: false,
        error_message: error instanceof Error ? error.message : 'Error desconocido',
        num_rows: numRows,
        seed: seed,
        generated_at: Date.now() / 1000,
        operations: [],
        total_sqlite_time_ms: 0,
        total_duckdb_time_ms: 0,
        overall_winner: 'none',
        sqlite_db_size_bytes: 0,
        duckdb_db_size_bytes: 0,
        timestamp,
      };
      setResults(prev => [errorResult, ...prev]);
    }

    setIsLoading(false);
  };

  const formatTime = (ms: number) => `${ms.toFixed(2)}ms`;
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const clearResults = () => setResults([]);

  const getWinnerColor = (winner: string) => {
    return winner === 'sqlite' ? 'text-blue-600' : 'text-orange-600';
  };

  const getSpeedupText = (factor: number, winner: string) => {
    if (factor <= 1.1) return 'Similar';
    return `${factor.toFixed(1)}x mas rapido`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Comparacion SQLite vs DuckDB</h2>
          <p className="text-muted-foreground">
            Benchmark comparativo de rendimiento entre SQLite y DuckDB con datos geoespaciales
          </p>
        </div>

        {/* Metodologia de Medicion */}
        <details>
          <summary className="font-semibold cursor-pointer text-lg">Metodologia de Benchmark</summary>
          <Card className="mt-4 p-4 bg-blue-50 dark:bg-blue-950">
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold text-blue-800 dark:text-blue-200">Comparacion Justa</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Ambas bases de datos ejecutan <strong>exactamente las mismas operaciones</strong> con los <strong>mismos datos</strong>
                  generados a partir de la misma semilla.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded">
                    <span className="font-medium text-blue-800 dark:text-blue-200">SQLite</span>
                    <ul className="text-xs mt-1 space-y-1">
                      <li>Base de datos embebida ligera</li>
                      <li>Optimizada para OLTP</li>
                      <li>Transacciones ACID</li>
                    </ul>
                  </div>
                  <div className="bg-orange-100 dark:bg-orange-900 p-2 rounded">
                    <span className="font-medium text-orange-800 dark:text-orange-200">DuckDB</span>
                    <ul className="text-xs mt-1 space-y-1">
                      <li>Base de datos analitica columnar</li>
                      <li>Optimizada para OLAP</li>
                      <li>Vectorizacion SIMD</li>
                    </ul>
                  </div>
                </div>
              </div>

              <div className="border-t pt-3">
                <h4 className="font-semibold text-blue-800 dark:text-blue-200">Operaciones de Prueba</h4>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                  <li><strong>CREATE TABLE:</strong> Creacion de estructura de tabla</li>
                  <li><strong>INSERT:</strong> Insercion masiva de datos</li>
                  <li><strong>SELECT ALL:</strong> Consulta completa de todos los registros</li>
                  <li><strong>AGGREGATION:</strong> AVG, MIN, MAX, SUM, COUNT</li>
                  <li><strong>GROUP BY:</strong> Agrupacion con agregaciones</li>
                  <li><strong>FILTER + ORDER:</strong> Filtrado complejo con ordenamiento</li>
                </ul>
              </div>
            </div>
          </Card>
        </details>

        {/* Configuracion del Benchmark */}
        <Card className="p-4 bg-gray-50 dark:bg-gray-950">
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label htmlFor="numRows" className="text-lg font-semibold">
                  Numero de Filas:
                </Label>
                <p className="text-sm text-muted-foreground">
                  Cantidad de registros a insertar y consultar
                </p>
              </div>
              <div className="w-48">
                <Input
                  id="numRows"
                  type="number"
                  value={numRows}
                  onChange={(e) => setNumRows(Number(e.target.value))}
                  min={1000}
                  max={10000000}
                  className="text-lg font-semibold text-center"
                  placeholder="100000"
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-6">
              <div className="flex items-center space-x-2">
                <Switch
                  id="runInsert"
                  checked={runInsert}
                  onCheckedChange={setRunInsert}
                />
                <Label htmlFor="runInsert">Insercion</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="runQuery"
                  checked={runQuery}
                  onCheckedChange={setRunQuery}
                />
                <Label htmlFor="runQuery">Consulta</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="runAggregation"
                  checked={runAggregation}
                  onCheckedChange={setRunAggregation}
                />
                <Label htmlFor="runAggregation">Agregacion</Label>
              </div>
              <div className="flex items-center space-x-2">
                <Switch
                  id="runFilter"
                  checked={runFilter}
                  onCheckedChange={setRunFilter}
                />
                <Label htmlFor="runFilter">Filtrado</Label>
              </div>
            </div>
          </div>
        </Card>
      </div>

      <div className="flex gap-4">
        <Button
          onClick={runBenchmark}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? 'Ejecutando Benchmark...' : `Ejecutar Benchmark (${numRows.toLocaleString()} filas)`}
        </Button>
        <Button variant="outline" onClick={clearResults} disabled={isLoading}>
          Limpiar Resultados
        </Button>
      </div>

      <div className="space-y-4">
        {results.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Aun no hay resultados. Ejecuta un benchmark para ver la comparacion.</p>
            </CardContent>
          </Card>
        ) : (
          results.map((result, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Benchmark: {result.num_rows.toLocaleString()} filas</span>
                  <div className="flex gap-2">
                    <Badge variant="outline">Seed: {result.seed}</Badge>
                    {result.error_message && <Badge variant="destructive">Error</Badge>}
                    {result.success && (
                      <Badge
                        variant="default"
                        className={result.overall_winner === 'sqlite' ? 'bg-blue-600' : 'bg-orange-600'}
                      >
                        Ganador: {result.overall_winner.toUpperCase()}
                      </Badge>
                    )}
                  </div>
                </CardTitle>
                <CardDescription>
                  {result.timestamp}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.error_message ? (
                  <p className="text-red-600">{result.error_message}</p>
                ) : (
                  <div className="space-y-6">
                    {/* Tabla de resultados por operacion */}
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left p-2">Operacion</th>
                            <th className="text-right p-2 text-blue-600">SQLite</th>
                            <th className="text-right p-2 text-orange-600">DuckDB</th>
                            <th className="text-center p-2">Ganador</th>
                            <th className="text-right p-2">Diferencia</th>
                          </tr>
                        </thead>
                        <tbody>
                          {result.operations.map((op, opIndex) => (
                            <tr key={opIndex} className="border-b">
                              <td className="p-2 font-medium">{op.operation_name}</td>
                              <td className={`text-right p-2 ${op.winner === 'sqlite' ? 'font-bold text-blue-600' : ''}`}>
                                {formatTime(op.sqlite_time_ms)}
                              </td>
                              <td className={`text-right p-2 ${op.winner === 'duckdb' ? 'font-bold text-orange-600' : ''}`}>
                                {formatTime(op.duckdb_time_ms)}
                              </td>
                              <td className={`text-center p-2 ${getWinnerColor(op.winner)}`}>
                                {op.winner.toUpperCase()}
                              </td>
                              <td className="text-right p-2 text-muted-foreground">
                                {getSpeedupText(op.speedup_factor, op.winner)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          <tr className="font-bold bg-gray-50 dark:bg-gray-900">
                            <td className="p-2">TOTAL</td>
                            <td className={`text-right p-2 ${result.overall_winner === 'sqlite' ? 'text-blue-600' : ''}`}>
                              {formatTime(result.total_sqlite_time_ms)}
                            </td>
                            <td className={`text-right p-2 ${result.overall_winner === 'duckdb' ? 'text-orange-600' : ''}`}>
                              {formatTime(result.total_duckdb_time_ms)}
                            </td>
                            <td className={`text-center p-2 ${getWinnerColor(result.overall_winner)}`}>
                              {result.overall_winner.toUpperCase()}
                            </td>
                            <td className="text-right p-2">
                              {getSpeedupText(
                                Math.max(result.total_sqlite_time_ms, result.total_duckdb_time_ms) /
                                Math.max(Math.min(result.total_sqlite_time_ms, result.total_duckdb_time_ms), 0.001),
                                result.overall_winner
                              )}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>

                    {/* Resumen visual */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                        <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">SQLite</h4>
                        <div className="space-y-1 text-sm">
                          <p><span className="font-medium">Tiempo Total:</span> {formatTime(result.total_sqlite_time_ms)}</p>
                          <p><span className="font-medium">Tamano BD:</span> {formatSize(result.sqlite_db_size_bytes)}</p>
                        </div>
                      </div>
                      <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                        <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">DuckDB</h4>
                        <div className="space-y-1 text-sm">
                          <p><span className="font-medium">Tiempo Total:</span> {formatTime(result.total_duckdb_time_ms)}</p>
                          <p><span className="font-medium">Tamano BD:</span> {formatSize(result.duckdb_db_size_bytes)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Barra de comparacion visual */}
                    <div className="space-y-2">
                      <h5 className="font-semibold">Comparacion Visual de Tiempo</h5>
                      <div className="flex gap-2 items-center">
                        <span className="w-16 text-sm text-blue-600">SQLite</span>
                        <div className="flex-1 h-6 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden">
                          <div
                            className="h-full bg-blue-500 transition-all duration-500"
                            style={{
                              width: `${(result.total_sqlite_time_ms / Math.max(result.total_sqlite_time_ms, result.total_duckdb_time_ms)) * 100}%`
                            }}
                          />
                        </div>
                        <span className="w-20 text-sm text-right">{formatTime(result.total_sqlite_time_ms)}</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <span className="w-16 text-sm text-orange-600">DuckDB</span>
                        <div className="flex-1 h-6 bg-gray-200 dark:bg-gray-800 rounded overflow-hidden">
                          <div
                            className="h-full bg-orange-500 transition-all duration-500"
                            style={{
                              width: `${(result.total_duckdb_time_ms / Math.max(result.total_sqlite_time_ms, result.total_duckdb_time_ms)) * 100}%`
                            }}
                          />
                        </div>
                        <span className="w-20 text-sm text-right">{formatTime(result.total_duckdb_time_ms)}</span>
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}
