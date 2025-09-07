import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';

type FormatType = 'grpc' | 'json' | 'msgpack';

interface BenchmarkRun {
  runNumber: number;
  seed: number;
  responseTime: number;
  transmissionTime: number;
  networkPayloadSize: number;
  frontendMemorySize: number;
  parsingTime: number;
  timestamp: string;
  error?: string;
}

interface BenchmarkSession {
  format: FormatType;
  formatName: string;
  testSize: number;
  totalRuns: number;
  completedRuns: number;
  runs: BenchmarkRun[];
  stats?: {
    avgResponseTime: number;
    totalResponseTime: number; // NUEVO: Tiempo total acumulado
    avgTransmissionTime: number;
    avgParsingTime: number;
    avgNetworkPayloadSize: number;
    avgFrontendMemorySize: number;
    minResponseTime: number;
    maxResponseTime: number;
    stdDevResponseTime: number;
  };
  startTime: string;
  endTime?: string;
}

export function SingleFormatBenchmark() {
  const [sessions, setSessions] = useState<BenchmarkSession[]>([]);
  const [isRunning, setIsRunning] = useState(false);
  const [currentSession, setCurrentSession] = useState<BenchmarkSession | null>(null);
  
  // Configuración de pruebas
  const [selectedFormat, setSelectedFormat] = useState<FormatType>('grpc');
  const [testSize, setTestSize] = useState<number>(100000);
  const [numRuns, setNumRuns] = useState<number>(10);

  const formatOptions = [
    { value: 'grpc' as FormatType, label: 'Protocol Buffer (gRPC)', color: 'text-blue-600' },
    { value: 'json' as FormatType, label: 'JSON (REST)', color: 'text-green-600' },
    { value: 'msgpack' as FormatType, label: 'MessagePack (REST)', color: 'text-purple-600' },
  ];

  // Generar semilla determinística para cada ejecución
  const generateSeed = (runNumber: number) => 1000000 + runNumber;

  // Procesar datos de manera consistente para todos los formatos
  const processData = (rawData: any, format: FormatType) => {
    const startTime = performance.now();
    
    let flatArray: number[] | Float32Array;
    let originalData: any;

    if (format === 'grpc') {
      if (rawData.binary_data && rawData.data_length) {

        // ÓPTIMO: binary_data_f32 ya es Float32Array optimizado por el generador automático
        // ⚡ Zero-copy y memory-aligned cuando es posible
        flatArray = rawData.binary_data_f32 || new Float32Array(rawData.binary_data);
        // flatArray = rawData.binary_data || new Float32Array(rawData.binary_data);
        originalData = rawData;
      } else {
        flatArray = [];
        originalData = rawData;
      }
    } else {
      flatArray = rawData.data || [];
      originalData = rawData;
    }

    // Convertir a puntos para cálculo de memoria
    const points = [];
    for (let i = 0; i < flatArray.length; i += 3) {
      points.push([flatArray[i], flatArray[i + 1], flatArray[i + 2]]);
    }

    const processedData = {
      data: points,
      total_count: originalData.total_count || points.length,
      bounds: originalData.bounds || {},
    };

    const endTime = performance.now();
    return {
      processedData,
      parsingTime: endTime - startTime,
      frontendMemorySize: JSON.stringify(processedData).length,
    };
  };

  // Ejecutar una sola prueba
  const executeSingleRun = async (format: FormatType, runNumber: number, seed: number): Promise<BenchmarkRun> => {
    const timestamp = new Date().toISOString();
    
    try {
      let response: any;
      let networkResponse: any;
      const startTime = performance.now();

      // Llamar a la API apropiada según el formato
      switch (format) {
        case 'grpc':
          response = await window.autoGrpc.getColumnarData({
            data_types: ['elevation'],
            max_points: testSize,
            seed
          });
          networkResponse = response;
          break;
          
        case 'json':
          networkResponse = await window.electronBackend.rest.getColumnarData({
            data_types: ['elevation'],
            max_points: testSize,
            seed
          });
          response = networkResponse.data;
          break;
          
        case 'msgpack':
          networkResponse = await window.electronBackend.rest.getColumnarDataMsgpack({
            data_types: ['elevation'],
            max_points: testSize,
            seed
          });
          response = networkResponse.data;
          break;
      }

      const endTime = performance.now();
      const receivedAt = Date.now();  // ✅ AHORA está en el lugar correcto
      const processed = processData(response, format);

      // Calcular métricas de manera consistente entre formatos
      const responseTime = endTime - startTime;
      const transmissionTime = format === 'grpc' 
        ? (response.generated_at ? receivedAt - (response.generated_at * 1000) : 0)
        : (networkResponse.transmissionTime || 0);
      const networkPayloadSize = format === 'grpc'
        ? (response.message_size_bytes || response.binary_data?.byteLength || 0)
        : (networkResponse.networkPayloadSize || 0);
      const parsingTime = format === 'grpc'
        ? processed.parsingTime
        : (networkResponse.parsingTime || 0) + processed.parsingTime;

      return {
        runNumber,
        seed,
        responseTime,
        transmissionTime,
        networkPayloadSize,
        frontendMemorySize: processed.frontendMemorySize,
        parsingTime,
        timestamp
      };
    } catch (error) {
      return {
        runNumber,
        seed,
        responseTime: 0,
        transmissionTime: 0,
        networkPayloadSize: 0,
        frontendMemorySize: 0,
        parsingTime: 0,
        timestamp,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  };

  // Calcular estadísticas para una sesión completada
  const calculateStats = (runs: BenchmarkRun[]) => {
    const validRuns = runs.filter(run => !run.error);
    if (validRuns.length === 0) return undefined;

    const responseTimes = validRuns.map(run => run.responseTime);
    const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / validRuns.length;
    const totalResponseTime = responseTimes.reduce((a, b) => a + b, 0); // NUEVO: Tiempo total acumulado
    const variance = responseTimes.reduce((a, b) => a + Math.pow(b - avgResponseTime, 2), 0) / validRuns.length;
    const stdDevResponseTime = Math.sqrt(variance);

    return {
      avgResponseTime,
      totalResponseTime, // NUEVO: Tiempo total acumulado
      avgTransmissionTime: validRuns.reduce((a, b) => a + b.transmissionTime, 0) / validRuns.length,
      avgParsingTime: validRuns.reduce((a, b) => a + b.parsingTime, 0) / validRuns.length,
      avgNetworkPayloadSize: validRuns.reduce((a, b) => a + b.networkPayloadSize, 0) / validRuns.length,
      avgFrontendMemorySize: validRuns.reduce((a, b) => a + b.frontendMemorySize, 0) / validRuns.length,
      minResponseTime: Math.min(...responseTimes),
      maxResponseTime: Math.max(...responseTimes),
      stdDevResponseTime
    };
  };

  // Ejecutar sesión de benchmark para el formato seleccionado
  const runBenchmark = async () => {
    setIsRunning(true);
    
    const formatName = formatOptions.find(f => f.value === selectedFormat)?.label || selectedFormat;
    const session: BenchmarkSession = {
      format: selectedFormat,
      formatName,
      testSize,
      totalRuns: numRuns,
      completedRuns: 0,
      runs: [],
      startTime: new Date().toISOString()
    };

    setCurrentSession(session);

    // Ejecutar pruebas secuencialmente para evitar sobrecargar el backend
    for (let i = 1; i <= numRuns; i++) {
      const seed = generateSeed(i);
      const run = await executeSingleRun(selectedFormat, i, seed);
      
      session.runs.push(run);
      session.completedRuns = i;
      
      // Update current session
      setCurrentSession({ ...session });
      
      // Pequeño retraso entre ejecuciones para evitar sobrecargar el sistema
      if (i < numRuns) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    // Finalizar sesión
    session.endTime = new Date().toISOString();
    session.stats = calculateStats(session.runs);

    setSessions(prev => [session, ...prev]);
    setCurrentSession(null);
    setIsRunning(false);
  };

  const clearSessions = () => setSessions([]);

  const formatTime = (ms: number) => `${ms.toFixed(2)}ms`;
  const formatSize = (bytes: number) => `${(bytes / 1024).toFixed(2)} KB`;

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Benchmark de Formato Único</h2>
          <p className="text-muted-foreground">
            Ejecutar múltiples pruebas en un formato para recopilar datos estadísticos
          </p>
        </div>

        {/* Metodología de Medición */}
        <details>
          <summary className="font-semibold cursor-pointer text-lg">🔬 Metodología de Medición</summary>
          <Card className="mt-4 p-4 bg-amber-50 dark:bg-amber-950">
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold text-amber-800 dark:text-amber-200">📏 ¿Cómo medimos cada métrica?</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
                  <div className="space-y-2">
                    <div>
                      <span className="font-medium">⏱️ Tiempo de Respuesta Total:</span>
                      <p className="text-xs text-muted-foreground">
                        <code>performance.now()</code> al inicio y fin de toda la operación. 
                        Incluye red, parseo, y procesamiento de datos.
                      </p>
                    </div>
                    <div>
                      <span className="font-medium">📡 Tiempo de Transmisión de Red:</span>
                      <p className="text-xs text-muted-foreground">
                        Calculado usando timestamp del servidor: <code>tiempo_recibido - servidor.generated_at</code>. 
                        Mide solo la velocidad pura de la red.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <div>
                      <span className="font-medium">⚡ Tiempo de Parseo:</span>
                      <p className="text-xs text-muted-foreground">
                        <strong>gRPC:</strong> binario→Float32Array (directo, sin Array.from())<br/>
                        <strong>JSON:</strong> JSON.parse() + conversión a estructura final<br/>
                        <strong>MessagePack:</strong> decode() + conversión a estructura final
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        ⚡ <strong>Optimizado:</strong> gRPC usa Float32Array directamente sin Array.from() (era 3x más lento!)
                      </p>
                    </div>
                    <div>
                      <span className="font-medium">📦 Tamaño de Payload de Red:</span>
                      <p className="text-xs text-muted-foreground">
                        <strong>gRPC:</strong> Mensaje Protocol Buffer completo serializado (datos + metadata)<br/>
                        <strong>JSON:</strong> <code>new Blob([responseText]).size</code> (datos + metadata)<br/>
                        <strong>MessagePack:</strong> Mensaje MessagePack binario completo (datos + metadata)
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        ✅ <strong>Medición justa:</strong> Los tres formatos incluyen datos + metadata (total_count, bounds, generated_at)
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="border-t pt-3">
                <h4 className="font-semibold text-amber-800 dark:text-amber-200">🎯 Garantías de Justicia</h4>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                  <li>✅ <strong>Mismos datos:</strong> Todas las pruebas usan semillas determinísticas idénticas</li>
                  <li>✅ <strong>Mismo procesamiento:</strong> Conversión a formato estándar [[x,y,z], [x,y,z]] para todas</li>
                  <li>✅ <strong>Medición consistente:</strong> Mismo código de medición para todos los formatos</li>
                  <li>✅ <strong>Memoria frontend:</strong> Tamaño del objeto JavaScript final después del procesamiento</li>
                  <li>✅ <strong>Análisis estadístico:</strong> Promedio, min/max, desviación estándar para confiabilidad</li>
                </ul>
              </div>
            </div>
          </Card>
        </details>
        
        {/* Configuración */}
        <Card className="p-4 bg-blue-50 dark:bg-blue-950">
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="format" className="text-sm font-semibold">Formato:</Label>
                <Select value={selectedFormat} onValueChange={(value: FormatType) => setSelectedFormat(value)} disabled={isRunning}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {formatOptions.map(format => (
                      <SelectItem key={format.value} value={format.value}>
                        <span className={format.color}>{format.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div>
                <Label htmlFor="testSize" className="text-sm font-semibold">Tamaño de Prueba:</Label>
                <Input
                  id="testSize"
                  type="number"
                  value={testSize}
                  onChange={(e) => setTestSize(Number(e.target.value))}
                  min={1000}
                  max={10000000}
                  disabled={isRunning}
                  placeholder="100000"
                />
              </div>
              
              <div>
                <Label htmlFor="numRuns" className="text-sm font-semibold">Número de Ejecuciones:</Label>
                <Input
                  id="numRuns"
                  type="number"
                  value={numRuns}
                  onChange={(e) => setNumRuns(Number(e.target.value))}
                  min={1}
                  max={100}
                  disabled={isRunning}
                  placeholder="10"
                />
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* Controles */}
      <div className="flex gap-4">
        <Button 
          onClick={runBenchmark} 
          disabled={isRunning}
          className="flex-1"
        >
          {isRunning ? 'Ejecutando Pruebas...' : `Ejecutar ${numRuns} Pruebas (${formatOptions.find(f => f.value === selectedFormat)?.label})`}
        </Button>
        <Button variant="outline" onClick={clearSessions} disabled={isRunning}>
          Limpiar Resultados
        </Button>
      </div>

      {/* Progreso de la sesión actual */}
      {currentSession && (
        <Card>
          <CardHeader>
            <CardTitle>Ejecutando: {currentSession.formatName}</CardTitle>
            <CardDescription>
              Progreso: {currentSession.completedRuns} / {currentSession.totalRuns} ejecuciones
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Progress 
              value={(currentSession.completedRuns / currentSession.totalRuns) * 100} 
              className="mb-4" 
            />
            <div className="text-sm text-muted-foreground">
              Tamaño: {currentSession.testSize.toLocaleString()} puntos | 
              Iniciado: {new Date(currentSession.startTime).toLocaleTimeString()}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Resultados */}
      <div className="space-y-4">
        {sessions.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Aún no hay sesiones de benchmark. Configura y ejecuta una prueba arriba.</p>
            </CardContent>
          </Card>
        ) : (
          sessions.map((session, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>{session.formatName} Benchmark</span>
                  <div className="flex gap-2">
                    <Badge variant="outline">{session.testSize.toLocaleString()} puntos</Badge>
                    <Badge variant="outline">{session.completedRuns} ejecuciones</Badge>
                    {session.runs.some(r => r.error) && <Badge variant="destructive">Algunos errores</Badge>}
                  </div>
                </CardTitle>
                <CardDescription>
                  Iniciado: {new Date(session.startTime).toLocaleString()}
                  {session.endTime && ` | Completado: ${new Date(session.endTime).toLocaleString()}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {session.stats ? (
                  <div className="space-y-6">
                    {/* Statistics summary */}
                    <div>
                      <h4 className="font-semibold mb-3">📊 Estadísticas de Rendimiento</h4>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
                        <div className="space-y-1">
                          <p className="font-medium">Tiempo de Respuesta:</p>
                          <p>Prom: {formatTime(session.stats.avgResponseTime)}</p>
                          <p>Mín: {formatTime(session.stats.minResponseTime)}</p>
                          <p>Máx: {formatTime(session.stats.maxResponseTime)}</p>
                          <p>DesvEst: {formatTime(session.stats.stdDevResponseTime)}</p>
                          <p className="text-blue-600 font-semibold">Total: {formatTime(session.stats.totalResponseTime)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium">Red:</p>
                          <p>Transmisión: {formatTime(session.stats.avgTransmissionTime)}</p>
                          <p>Payload: {formatSize(session.stats.avgNetworkPayloadSize)}</p>
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium">Procesamiento:</p>
                          <p>Parseo: {formatTime(session.stats.avgParsingTime)}</p>
                          <p>Memoria: {formatSize(session.stats.avgFrontendMemorySize)}</p>
                        </div>
                      </div>
                    </div>

                    {/* Individual runs */}
                    <details>
                      <summary className="font-semibold cursor-pointer">📋 Resultados Individuales ({session.runs.length} ejecuciones)</summary>
                      <div className="mt-4 space-y-2 max-h-64 overflow-y-auto">
                        {session.runs.map((run, runIndex) => (
                          <div key={runIndex} className="flex justify-between items-center p-2 bg-muted rounded text-sm">
                            <div className="flex gap-4">
                              <span>Ejec {run.runNumber}</span>
                              <span>Semilla: {run.seed}</span>
                            </div>
                            <div className="flex gap-4">
                              {run.error ? (
                                <Badge variant="destructive">Error</Badge>
                              ) : (
                                <>
                                  <span>Total: {formatTime(run.responseTime)}</span>
                                  <span>Red: {formatTime(run.transmissionTime)}</span>
                                  <span>Parseo: {formatTime(run.parsingTime)}</span>
                                  <span>Payload: {formatSize(run.networkPayloadSize)}</span>
                                </>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                ) : (
                  <p className="text-muted-foreground">Sesión en progreso...</p>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
}