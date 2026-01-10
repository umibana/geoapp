import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Progress } from '@/components/ui/progress';

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

interface AggregatedStats {
  operation_name: string;
  sqlite_avg: number;
  sqlite_min: number;
  sqlite_max: number;
  sqlite_std: number;
  duckdb_avg: number;
  duckdb_min: number;
  duckdb_max: number;
  duckdb_std: number;
  winner: string;
  speedup_factor: number;
}

interface MultiRunResult {
  num_rows: number;
  num_runs: number;
  timestamp: string;
  operations: AggregatedStats[];
  total_sqlite_avg: number;
  total_duckdb_avg: number;
  overall_winner: string;
  sqlite_wins: number;
  duckdb_wins: number;
}

export function DatabaseComparison() {
  const [results, setResults] = useState<DatabaseBenchmarkResult[]>([]);
  const [multiRunResults, setMultiRunResults] = useState<MultiRunResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [numRows, setNumRows] = useState<number>(100000);
  const [numRuns, setNumRuns] = useState<number>(10);
  const [currentRun, setCurrentRun] = useState<number>(0);
  const [runInsert, setRunInsert] = useState(true);
  const [runQuery, setRunQuery] = useState(true);
  const [runAggregation, setRunAggregation] = useState(true);
  const [runFilter, setRunFilter] = useState(true);

  const generateSeed = () => Math.floor(Math.random() * 1000000);

  const runSingleBenchmark = async (): Promise<DatabaseBenchmarkResult | null> => {
    const seed = generateSeed();
    const timestamp = new Date().toISOString();

    try {
      const response = await window.autoGrpc.runDatabaseBenchmark({
        num_rows: numRows,
        seed: seed,
        run_insert: runInsert,
        run_query: runQuery,
        run_aggregation: runAggregation,
        run_filter: runFilter,
      });

      return {
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
    } catch (error) {
      return {
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
    }
  };

  const runBenchmark = async () => {
    setIsLoading(true);
    const result = await runSingleBenchmark();
    if (result) {
      setResults(prev => [result, ...prev]);
    }
    setIsLoading(false);
  };

  const runMultipleBenchmarks = async () => {
    setIsLoading(true);
    setCurrentRun(0);

    const allResults: DatabaseBenchmarkResult[] = [];

    for (let i = 0; i < numRuns; i++) {
      setCurrentRun(i + 1);
      const result = await runSingleBenchmark();
      if (result && result.success) {
        allResults.push(result);
      }
      // Small delay between runs
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Calculate aggregated statistics
    if (allResults.length > 0) {
      const aggregated = calculateAggregatedStats(allResults);
      setMultiRunResults(prev => [aggregated, ...prev]);
    }

    setCurrentRun(0);
    setIsLoading(false);
  };

  const calculateAggregatedStats = (results: DatabaseBenchmarkResult[]): MultiRunResult => {
    const operationNames = results[0].operations.map(op => op.operation_name);

    const operationStats: AggregatedStats[] = operationNames.map(opName => {
      const sqliteTimes = results.map(r => r.operations.find(op => op.operation_name === opName)?.sqlite_time_ms || 0);
      const duckdbTimes = results.map(r => r.operations.find(op => op.operation_name === opName)?.duckdb_time_ms || 0);

      const sqliteAvg = sqliteTimes.reduce((a, b) => a + b, 0) / sqliteTimes.length;
      const duckdbAvg = duckdbTimes.reduce((a, b) => a + b, 0) / duckdbTimes.length;

      const sqliteStd = Math.sqrt(sqliteTimes.reduce((sum, t) => sum + Math.pow(t - sqliteAvg, 2), 0) / sqliteTimes.length);
      const duckdbStd = Math.sqrt(duckdbTimes.reduce((sum, t) => sum + Math.pow(t - duckdbAvg, 2), 0) / duckdbTimes.length);

      const winner = sqliteAvg < duckdbAvg ? 'sqlite' : 'duckdb';
      const speedup = Math.max(sqliteAvg, duckdbAvg) / Math.max(Math.min(sqliteAvg, duckdbAvg), 0.001);

      return {
        operation_name: opName,
        sqlite_avg: sqliteAvg,
        sqlite_min: Math.min(...sqliteTimes),
        sqlite_max: Math.max(...sqliteTimes),
        sqlite_std: sqliteStd,
        duckdb_avg: duckdbAvg,
        duckdb_min: Math.min(...duckdbTimes),
        duckdb_max: Math.max(...duckdbTimes),
        duckdb_std: duckdbStd,
        winner,
        speedup_factor: speedup,
      };
    });

    const totalSqliteAvg = results.reduce((sum, r) => sum + r.total_sqlite_time_ms, 0) / results.length;
    const totalDuckdbAvg = results.reduce((sum, r) => sum + r.total_duckdb_time_ms, 0) / results.length;

    const sqliteWins = results.filter(r => r.overall_winner === 'sqlite').length;
    const duckdbWins = results.filter(r => r.overall_winner === 'duckdb').length;

    return {
      num_rows: numRows,
      num_runs: results.length,
      timestamp: new Date().toISOString(),
      operations: operationStats,
      total_sqlite_avg: totalSqliteAvg,
      total_duckdb_avg: totalDuckdbAvg,
      overall_winner: totalSqliteAvg < totalDuckdbAvg ? 'sqlite' : 'duckdb',
      sqlite_wins: sqliteWins,
      duckdb_wins: duckdbWins,
    };
  };

  const formatTime = (ms: number) => `${ms.toFixed(2)}ms`;
  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  };

  const clearResults = () => {
    setResults([]);
    setMultiRunResults([]);
  };

  const getWinnerColor = (winner: string) => {
    return winner === 'sqlite' ? 'text-blue-600' : 'text-orange-600';
  };

  const getWinnerBg = (winner: string) => {
    return winner === 'sqlite' ? 'bg-blue-600' : 'bg-orange-600';
  };

  const getSpeedupText = (factor: number) => {
    if (factor <= 1.1) return 'Similar';
    return `${factor.toFixed(1)}x`;
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
                      <li>Optimizada para OLTP (escrituras)</li>
                      <li>Mejor en: INSERT, datasets pequenos</li>
                      <li>Transacciones ACID rapidas</li>
                    </ul>
                  </div>
                  <div className="bg-orange-100 dark:bg-orange-900 p-2 rounded">
                    <span className="font-medium text-orange-800 dark:text-orange-200">DuckDB</span>
                    <ul className="text-xs mt-1 space-y-1">
                      <li>Base de datos analitica columnar</li>
                      <li>Optimizada para OLAP (lecturas)</li>
                      <li>Mejor en: agregaciones, percentiles, datasets grandes</li>
                      <li>Vectorizacion SIMD para analisis</li>
                    </ul>
                  </div>
                </div>

                <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-950 rounded text-xs">
                  <strong>Nota:</strong> DuckDB brilla con datasets de 500K+ filas y consultas analiticas complejas.
                  SQLite es mas rapido para operaciones transaccionales simples y datasets pequenos.
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
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label htmlFor="numRows" className="font-semibold">
                    Numero de Filas:
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Registros por ejecucion
                  </p>
                </div>
                <div className="w-32">
                  <Input
                    id="numRows"
                    type="number"
                    value={numRows}
                    onChange={(e) => setNumRows(Number(e.target.value))}
                    min={1000}
                    max={10000000}
                    className="text-center"
                  />
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <Label htmlFor="numRuns" className="font-semibold">
                    Numero de Ejecuciones:
                  </Label>
                  <p className="text-xs text-muted-foreground">
                    Para calcular promedios
                  </p>
                </div>
                <div className="w-32">
                  <Input
                    id="numRuns"
                    type="number"
                    value={numRuns}
                    onChange={(e) => setNumRuns(Number(e.target.value))}
                    min={1}
                    max={50}
                    className="text-center"
                  />
                </div>
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

      {/* Progress indicator */}
      {isLoading && currentRun > 0 && (
        <Card className="p-4">
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Ejecutando benchmark {currentRun} de {numRuns}...</span>
              <span>{Math.round((currentRun / numRuns) * 100)}%</span>
            </div>
            <Progress value={(currentRun / numRuns) * 100} />
          </div>
        </Card>
      )}

      <div className="flex gap-4">
        <Button
          onClick={runBenchmark}
          disabled={isLoading}
          variant="outline"
        >
          {isLoading ? 'Ejecutando...' : 'Ejecutar 1 vez'}
        </Button>
        <Button
          onClick={runMultipleBenchmarks}
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? `Ejecutando ${currentRun}/${numRuns}...` : `Ejecutar ${numRuns} veces y promediar`}
        </Button>
        <Button variant="outline" onClick={clearResults} disabled={isLoading}>
          Limpiar
        </Button>
      </div>

      {/* Multi-run aggregated results */}
      {multiRunResults.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-xl font-bold">Resultados Agregados (Promedios)</h3>
          {multiRunResults.map((result, index) => (
            <Card key={`multi-${index}`} className="border-2 border-green-500">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>Promedio de {result.num_runs} ejecuciones ({result.num_rows.toLocaleString()} filas)</span>
                  <div className="flex gap-2">
                    <Badge variant="outline" className="bg-blue-100">
                      SQLite gano: {result.sqlite_wins}
                    </Badge>
                    <Badge variant="outline" className="bg-orange-100">
                      DuckDB gano: {result.duckdb_wins}
                    </Badge>
                    <Badge className={getWinnerBg(result.overall_winner)}>
                      Ganador: {result.overall_winner.toUpperCase()}
                    </Badge>
                  </div>
                </CardTitle>
                <CardDescription>{result.timestamp}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {/* Tabla de promedios */}
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left p-2">Operacion</th>
                          <th className="text-right p-2 text-blue-600">SQLite (avg)</th>
                          <th className="text-right p-2 text-blue-400">+/- std</th>
                          <th className="text-right p-2 text-orange-600">DuckDB (avg)</th>
                          <th className="text-right p-2 text-orange-400">+/- std</th>
                          <th className="text-center p-2">Ganador</th>
                          <th className="text-right p-2">Speedup</th>
                        </tr>
                      </thead>
                      <tbody>
                        {result.operations.map((op, opIndex) => (
                          <tr key={opIndex} className="border-b">
                            <td className="p-2 font-medium">{op.operation_name}</td>
                            <td className={`text-right p-2 ${op.winner === 'sqlite' ? 'font-bold text-blue-600' : ''}`}>
                              {formatTime(op.sqlite_avg)}
                            </td>
                            <td className="text-right p-2 text-xs text-muted-foreground">
                              {formatTime(op.sqlite_std)}
                            </td>
                            <td className={`text-right p-2 ${op.winner === 'duckdb' ? 'font-bold text-orange-600' : ''}`}>
                              {formatTime(op.duckdb_avg)}
                            </td>
                            <td className="text-right p-2 text-xs text-muted-foreground">
                              {formatTime(op.duckdb_std)}
                            </td>
                            <td className={`text-center p-2 font-bold ${getWinnerColor(op.winner)}`}>
                              {op.winner.toUpperCase()}
                            </td>
                            <td className="text-right p-2">
                              {getSpeedupText(op.speedup_factor)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-bold bg-gray-100 dark:bg-gray-800">
                          <td className="p-2">TOTAL (promedio)</td>
                          <td className={`text-right p-2 ${result.overall_winner === 'sqlite' ? 'text-blue-600' : ''}`}>
                            {formatTime(result.total_sqlite_avg)}
                          </td>
                          <td></td>
                          <td className={`text-right p-2 ${result.overall_winner === 'duckdb' ? 'text-orange-600' : ''}`}>
                            {formatTime(result.total_duckdb_avg)}
                          </td>
                          <td></td>
                          <td className={`text-center p-2 ${getWinnerColor(result.overall_winner)}`}>
                            {result.overall_winner.toUpperCase()}
                          </td>
                          <td className="text-right p-2">
                            {getSpeedupText(
                              Math.max(result.total_sqlite_avg, result.total_duckdb_avg) /
                              Math.max(Math.min(result.total_sqlite_avg, result.total_duckdb_avg), 0.001)
                            )}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>

                  {/* Visual comparison */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <h4 className="font-semibold text-blue-800 dark:text-blue-200 mb-2">SQLite</h4>
                      <p className="text-2xl font-bold">{formatTime(result.total_sqlite_avg)}</p>
                      <p className="text-sm text-muted-foreground">promedio total</p>
                    </div>
                    <div className="p-4 bg-orange-50 dark:bg-orange-950 rounded-lg">
                      <h4 className="font-semibold text-orange-800 dark:text-orange-200 mb-2">DuckDB</h4>
                      <p className="text-2xl font-bold">{formatTime(result.total_duckdb_avg)}</p>
                      <p className="text-sm text-muted-foreground">promedio total</p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Single run results */}
      <div className="space-y-4">
        {results.length === 0 && multiRunResults.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Aun no hay resultados. Ejecuta un benchmark para ver la comparacion.</p>
            </CardContent>
          </Card>
        ) : results.length > 0 && (
          <>
            <h3 className="text-xl font-bold">Ejecuciones Individuales</h3>
            {results.map((result, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    <span>Benchmark: {result.num_rows.toLocaleString()} filas</span>
                    <div className="flex gap-2">
                      <Badge variant="outline">Seed: {result.seed}</Badge>
                      {result.error_message && <Badge variant="destructive">Error</Badge>}
                      {result.success && (
                        <Badge className={getWinnerBg(result.overall_winner)}>
                          Ganador: {result.overall_winner.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                  </CardTitle>
                  <CardDescription>{result.timestamp}</CardDescription>
                </CardHeader>
                <CardContent>
                  {result.error_message ? (
                    <p className="text-red-600">{result.error_message}</p>
                  ) : (
                    <div className="space-y-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="text-left p-2">Operacion</th>
                              <th className="text-right p-2 text-blue-600">SQLite</th>
                              <th className="text-right p-2 text-orange-600">DuckDB</th>
                              <th className="text-center p-2">Ganador</th>
                            </tr>
                          </thead>
                          <tbody>
                            {result.operations.map((op, opIndex) => (
                              <tr key={opIndex} className="border-b">
                                <td className="p-2">{op.operation_name}</td>
                                <td className={`text-right p-2 ${op.winner === 'sqlite' ? 'font-bold text-blue-600' : ''}`}>
                                  {formatTime(op.sqlite_time_ms)}
                                </td>
                                <td className={`text-right p-2 ${op.winner === 'duckdb' ? 'font-bold text-orange-600' : ''}`}>
                                  {formatTime(op.duckdb_time_ms)}
                                </td>
                                <td className={`text-center p-2 ${getWinnerColor(op.winner)}`}>
                                  {op.winner.toUpperCase()}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                          <tfoot>
                            <tr className="font-bold bg-gray-50 dark:bg-gray-900">
                              <td className="p-2">TOTAL</td>
                              <td className="text-right p-2">{formatTime(result.total_sqlite_time_ms)}</td>
                              <td className="text-right p-2">{formatTime(result.total_duckdb_time_ms)}</td>
                              <td className={`text-center p-2 ${getWinnerColor(result.overall_winner)}`}>
                                {result.overall_winner.toUpperCase()}
                              </td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
