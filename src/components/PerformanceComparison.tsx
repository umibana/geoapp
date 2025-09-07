import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
// NOTE: Now using window.electronBackend.rest instead of restApiClient for fair IPC comparison

interface FormatResult {
  responseTime: number;
  transmissionTime: number;
  networkPayloadSize?: number;
  frontendMemorySize: number;
  parsingTime: number;
  data: any;
}

interface PerformanceResult {
  method: string;
  grpc?: FormatResult;
  restJson?: FormatResult;
  restMsgpack?: FormatResult;
  error?: string;
  dataConsistency?: {
    grpcJsonMatch: boolean;
    grpcMsgpackMatch: boolean;
    jsonMsgpackMatch: boolean;
    details: string;
  };
}

export function PerformanceComparison() {
  const [results, setResults] = useState<PerformanceResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testSize, setTestSize] = useState<number>(100000);

  // Función para validar que los datos sean consistentes entre gRPC y REST
  const validateDataConsistency = (grpcData: any, restData: any) => {
    try {
      const grpcTotal = grpcData?.total_count || 0;
      const restTotal = restData?.total_count || 0;
      const totalCountMatch = grpcTotal === restTotal;

      // Comparar bounds
      const grpcBounds = grpcData?.bounds || {};
      const restBounds = restData?.bounds || {};
      
      const boundsMatch = 
        Math.abs((grpcBounds.x?.min_value || 0) - (restBounds.x?.min_value || 0)) < 0.001 &&
        Math.abs((grpcBounds.x?.max_value || 0) - (restBounds.x?.max_value || 0)) < 0.001 &&
        Math.abs((grpcBounds.y?.min_value || 0) - (restBounds.y?.min_value || 0)) < 0.001 &&
        Math.abs((grpcBounds.y?.max_value || 0) - (restBounds.y?.max_value || 0)) < 0.001 &&
        Math.abs((grpcBounds.z?.min_value || 0) - (restBounds.z?.min_value || 0)) < 0.001 &&
        Math.abs((grpcBounds.z?.max_value || 0) - (restBounds.z?.max_value || 0)) < 0.001;

      // Comparar muestra de datos (primeros 10 puntos)
      const grpcPoints = grpcData?.data || [];
      const restPoints = restData?.data || [];
      
      let sampleDataMatch = true;
      const sampleSize = Math.min(10, grpcPoints.length, restPoints.length);
      
      for (let i = 0; i < sampleSize; i++) {
        const gPoint = grpcPoints[i] || [];
        const rPoint = restPoints[i] || [];
        
        if (gPoint.length !== 3 || rPoint.length !== 3) {
          sampleDataMatch = false;
          break;
        }
        
        // Comparar con tolerancia para números flotantes
        if (Math.abs(gPoint[0] - rPoint[0]) > 0.001 || 
            Math.abs(gPoint[1] - rPoint[1]) > 0.001 || 
            Math.abs(gPoint[2] - rPoint[2]) > 0.001) {
          sampleDataMatch = false;
          break;
        }
      }

      const details = `Total Count: gRPC=${grpcTotal}, REST=${restTotal}. ` +
                     `X Bounds: gRPC=[${grpcBounds.x?.min_value?.toFixed(3)}, ${grpcBounds.x?.max_value?.toFixed(3)}], ` +
                     `REST=[${restBounds.x?.min_value?.toFixed(3)}, ${restBounds.x?.max_value?.toFixed(3)}]. ` +
                     `Sample points checked: ${sampleSize}`;

      return {
        totalCountMatch,
        boundsMatch,
        sampleDataMatch,
        details
      };
    } catch (error) {
      return {
        totalCountMatch: false,
        boundsMatch: false,
        sampleDataMatch: false,
        details: `Error validating consistency: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  };

  const runTest = async (
    testName: string, 
    grpcCall: () => Promise<any>, 
    restCall: () => Promise<any>,
    options?: { rawParsingOnly?: boolean }
  ) => {
    setIsLoading(true);
    const result: PerformanceResult = { method: testName };

    try {
      // Test gRPC with detailed metrics
      const grpcStart = performance.now();
      const grpcResponse = await grpcCall();
      const grpcNetworkEnd = performance.now();
      const grpcReceivedAt = Date.now();
      
      // Measure gRPC data processing time (standardized for fair comparison)
      const grpcParseStart = performance.now();
      let grpcUsableData: any = {};
      let grpcFrontendSize = 0;
      
      if (grpcResponse.binary_data && grpcResponse.data_length) {
        // Phase 1: Convert binary data to flat array (Protocol Buffer parsing)  
        // ÓPTIMO: binary_data_f32 ya es Float32Array optimizado por el generador automático
        // ⚡ Zero-copy y memory-aligned cuando es posible
        const flatArray = grpcResponse.binary_data_f32 || new Float32Array(grpcResponse.binary_data);
        
        if (options?.rawParsingOnly) {
          // MODO RAW PARSING: Solo mide la conversión del protocolo
          // Protocol Buffer binario → Float32Array → array plano [x,y,z,x,y,z,x,y,z]
          // NO convierte a puntos individuales
          grpcUsableData = {
            data: flatArray, // Array plano: [x,y,z,x,y,z,x,y,z]
            total_count: grpcResponse.total_count,
            bounds: {
              x: { min_value: grpcResponse.bounds?.x?.min_value || 0, max_value: grpcResponse.bounds?.x?.max_value || 0 },
              y: { min_value: grpcResponse.bounds?.y?.min_value || 0, max_value: grpcResponse.bounds?.y?.max_value || 0 },
              z: { min_value: grpcResponse.bounds?.z?.min_value || 0, max_value: grpcResponse.bounds?.z?.max_value || 0 }
            }
          };
        } else {
          // MODO COMPLETO: Procesamiento completo de aplicación
          // Protocol Buffer → Float32Array → array plano → array de puntos [[x,y,z], [x,y,z]]
          // Simula lo que haría una aplicación real
          const points = [];
          for (let i = 0; i < flatArray.length; i += 3) {
            points.push([flatArray[i], flatArray[i + 1], flatArray[i + 2]]);
          }
          
          grpcUsableData = {
            data: points, // Array de puntos: [[x,y,z], [x,y,z], [x,y,z]]
            total_count: grpcResponse.total_count,
            bounds: {
              x: { min_value: grpcResponse.bounds?.x?.min_value || 0, max_value: grpcResponse.bounds?.x?.max_value || 0 },
              y: { min_value: grpcResponse.bounds?.y?.min_value || 0, max_value: grpcResponse.bounds?.y?.max_value || 0 },
              z: { min_value: grpcResponse.bounds?.z?.min_value || 0, max_value: grpcResponse.bounds?.z?.max_value || 0 }
            }
          };
        }
        
        grpcFrontendSize = JSON.stringify(grpcUsableData).length;
      } else {
        // Fallback: measure metadata only
        grpcUsableData = {
          total_count: grpcResponse.total_count || 0,
          bounds: grpcResponse.bounds || {}
        };
        grpcFrontendSize = JSON.stringify(grpcUsableData).length;
      }
      const grpcParseEnd = performance.now();
      
      // Simple calculation: how long from backend finished to frontend received
      const totalResponseTime = grpcNetworkEnd - grpcStart;
      const transmissionTime = grpcResponse.generated_at ? 
        grpcReceivedAt - (grpcResponse.generated_at * 1000) : 0;
      
      result.grpc = {
        responseTime: totalResponseTime,
        transmissionTime: transmissionTime,
        frontendMemorySize: grpcFrontendSize,
        parsingTime: grpcParseEnd - grpcParseStart,
        data: grpcResponse
      };
    } catch (error) {
      result.error = `gRPC Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    try {
      // Test REST with detailed metrics (now through IPC)
      const restStart = performance.now();
      const restResponse = await restCall();
      const restEnd = performance.now();
      
      // Measure REST data processing time (standardized for fair comparison)
      const restParseStart = performance.now();
      let restUsableData: any = {};
      let restFrontendSize = 0;
      
      if (restResponse.data.data && Array.isArray(restResponse.data.data)) {
        // Phase 1: Data already parsed from JSON (JSON parsing happened in main process)
        const flatArray = restResponse.data.data;
        
        if (options?.rawParsingOnly) {
          // MODO RAW PARSING: Solo mide la conversión del protocolo
          // JSON string → array plano [x,y,z,x,y,z,x,y,z]
          // NO convierte a puntos individuales
          restUsableData = {
            data: flatArray, // Array plano: [x,y,z,x,y,z,x,y,z]
            total_count: restResponse.data.total_count,
            bounds: {
              x: { min_value: restResponse.data.bounds?.x?.min_value || 0, max_value: restResponse.data.bounds?.x?.max_value || 0 },
              y: { min_value: restResponse.data.bounds?.y?.min_value || 0, max_value: restResponse.data.bounds?.y?.max_value || 0 },
              z: { min_value: restResponse.data.bounds?.z?.min_value || 0, max_value: restResponse.data.bounds?.z?.max_value || 0 }
            }
          };
        } else {
          // MODO COMPLETO: Procesamiento completo de aplicación
          // JSON → array plano → array de puntos [[x,y,z], [x,y,z]]
          // Simula lo que haría una aplicación real
          const points = [];
          for (let i = 0; i < flatArray.length; i += 3) {
            points.push([flatArray[i], flatArray[i + 1], flatArray[i + 2]]);
          }
          
          restUsableData = {
            data: points, // Array de puntos: [[x,y,z], [x,y,z], [x,y,z]]
            total_count: restResponse.data.total_count,
            bounds: {
              x: { min_value: restResponse.data.bounds?.x?.min_value || 0, max_value: restResponse.data.bounds?.x?.max_value || 0 },
              y: { min_value: restResponse.data.bounds?.y?.min_value || 0, max_value: restResponse.data.bounds?.y?.max_value || 0 },
              z: { min_value: restResponse.data.bounds?.z?.min_value || 0, max_value: restResponse.data.bounds?.z?.max_value || 0 }
            }
          };
        }
        
        restFrontendSize = JSON.stringify(restUsableData).length;
      } else {
        // Fallback: measure metadata only
        restUsableData = {
          total_count: restResponse.data.total_count || 0,
          bounds: restResponse.data.bounds || {}
        };
        restFrontendSize = JSON.stringify(restUsableData).length;
      }
      const restParseEnd = performance.now();
      
      result.rest = {
        responseTime: restEnd - restStart,
        transmissionTime: restResponse.transmissionTime,
        networkPayloadSize: restResponse.networkPayloadSize,
        frontendMemorySize: restFrontendSize, // Use our calculated size
        parsingTime: (restResponse.parsingTime || 0) + (restParseEnd - restParseStart), // JSON parsing + application processing
        data: restUsableData
      };
    } catch (error) {
      result.error = result.error 
        ? `${result.error} | REST Error: ${error instanceof Error ? error.message : 'Unknown error'}`
        : `REST Error: ${error instanceof Error ? error.message : 'Unknown error'}`;
    }

    // Validar consistencia de datos si ambos protocolos funcionaron
    if (result.grpc && result.rest && !result.error) {
      result.dataConsistency = validateDataConsistency(result.grpc.data, result.rest.data);
    }

    setResults(prev => [result, ...prev]);
    setIsLoading(false);
  };

  const testBasicMethods = async () => {
    // Test HelloWorld
    await runTest(
      'HelloWorld',
      () => window.autoGrpc.helloWorld({ message: 'Performance test message' }),
      () => window.electronBackend.rest.helloWorld({ message: 'Performance test message' })
    );

    // Test EchoParameter
    await runTest(
      'EchoParameter',
      () => window.autoGrpc.echoParameter({ value: 42, operation: 'square' }),
      () => window.electronBackend.rest.echoParameter({ value: 42, operation: 'square' })
    );

    // Test HealthCheck
    await runTest(
      'HealthCheck',
      () => window.autoGrpc.healthCheck({}),
      () => window.electronBackend.rest.healthCheck()
    );
  };

  const testDataGeneration = async () => {
    // PRUEBA COMPLETA: Mide el flujo completo de la aplicación 
    // - Transmisión por red
    // - Parsing del protocolo (Protocol Buffer binario → array / JSON string → array)  
    // - Procesamiento de aplicación (array plano → array de puntos [[x,y,z], [x,y,z]])
    // - Medición de memoria frontend final
    // Propósito: Rendimiento real que experimentaría el usuario final
    await runTest(
      `GetColumnarData JSON (${testSize.toLocaleString()} points)`,
      () => window.autoGrpc.getColumnarData({ data_types: ['elevation'], max_points: testSize }),
      () => window.electronBackend.rest.getColumnarData({ data_types: ['elevation'], max_points: testSize })
    );
  };

  const testDataGenerationMsgpack = async () => {
    // PRUEBA MESSAGEPACK: Compara Protocol Buffer vs MessagePack
    // - Transmisión por red con MessagePack binario
    // - Parsing MessagePack → JavaScript object
    // - Mismo procesamiento de aplicación que JSON
    // Propósito: Evaluar MessagePack como alternativa a JSON
    await runTest(
      `GetColumnarData MessagePack (${testSize.toLocaleString()} points)`,
      () => window.autoGrpc.getColumnarData({ data_types: ['elevation'], max_points: testSize }),
      () => window.electronBackend.rest.getColumnarDataMsgpack({ data_types: ['elevation'], max_points: testSize })
    );
  };


  const testProjectMethods = async () => {
    // Test GetProjects
    await runTest(
      'GetProjects',
      () => window.autoGrpc.getProjects({}),
      () => window.electronBackend.rest.getProjects()
    );
  };


  const clearResults = () => setResults([]);

  const formatTime = (ms?: number) => ms ? `${ms.toFixed(2)}ms` : '-';
  const formatSize = (bytes?: number) => bytes ? `${(bytes / 1024).toFixed(2)} KB` : '-';

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Comparación de Rendimiento</h2>
          <p className="text-muted-foreground">
            Compara el rendimiento de gRPC + Protocol Buffers vs REST + JSON
          </p>
        </div>
        
        <Card className="p-4 bg-blue-50 dark:bg-blue-950">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="globalTestSize" className="text-lg font-semibold">
                Número de puntos para todas las pruebas:
              </Label>
              <p className="text-sm text-muted-foreground">
                Este valor se usará en todas las pruebas de datos (excepto métodos básicos y proyectos)
              </p>
            </div>
            <div className="w-48">
              <Input
                id="globalTestSize"
                type="number"
                value={testSize}
                onChange={(e) => setTestSize(Number(e.target.value))}
                min={1}
                max={10000000}
                className="text-lg font-semibold text-center"
                placeholder="Ej: 100000"
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <Card className="p-4">
            <div className="space-y-2">
              <Button onClick={testBasicMethods} disabled={isLoading} className="w-full">
                Test Basic Methods
              </Button>
              <p className="text-sm text-muted-foreground">
                Prueba métodos simples de gRPC (HelloWorld, EchoParameter, HealthCheck) para establecer rendimiento base
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <div className="space-y-2">
              <Button onClick={testDataGeneration} disabled={isLoading} className="w-full">
                Test JSON Data ({testSize.toLocaleString()} puntos)
              </Button>
              <p className="text-sm text-muted-foreground">
                Protocol Buffer vs JSON. Flujo completo: Red + Parsing + Procesamiento
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <div className="space-y-2">
              <Button onClick={testDataGenerationMsgpack} disabled={isLoading} className="w-full">
                Test MessagePack ({testSize.toLocaleString()} puntos)
              </Button>
              <p className="text-sm text-muted-foreground">
                Protocol Buffer vs MessagePack. Compara formatos binarios compactos
              </p>
            </div>
          </Card>


          <Card className="p-4">
            <div className="space-y-2">
              <Button onClick={testProjectMethods} disabled={isLoading} className="w-full">
                Test Project Methods
              </Button>
              <p className="text-sm text-muted-foreground">
                Prueba operaciones de gestión de proyectos (GetProjects) para comparar rendimiento en operaciones de metadata
              </p>
            </div>
          </Card>

          <Card className="p-4">
            <div className="space-y-2">
              <Button variant="destructive" onClick={clearResults} className="w-full">
                Clear Results
              </Button>
              <p className="text-sm text-muted-foreground">
                Limpia todos los resultados de pruebas de la pantalla
              </p>
            </div>
          </Card>
        </div>
      </div>

      <Tabs defaultValue="results" className="w-full">
        <TabsList>
          <TabsTrigger value="results">Resultados</TabsTrigger>
          <TabsTrigger value="summary">Resumen</TabsTrigger>
        </TabsList>

        <TabsContent value="results" className="space-y-4">
          {results.length === 0 ? (
            <Card>
              <CardContent className="p-8 text-center">
                <p className="text-muted-foreground">Aún no hay resultados de pruebas. Ejecuta algunas pruebas para ver comparaciones.</p>
              </CardContent>
            </Card>
          ) : (
            results.map((result, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex justify-between items-center">
                    <span>{result.method}</span>
                    {result.error && <Badge variant="destructive">Error</Badge>}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {result.error ? (
                    <p className="text-red-600">{result.error}</p>
                  ) : (
                    <div className="grid grid-cols-2 gap-6">
                      <div>
                        <h4 className="font-semibold text-blue-600 mb-3">gRPC + Protocol Buffers</h4>
                        {result.grpc ? (
                          <div className="space-y-1 text-sm">
                            <div className="space-y-1">
                              <p><span className="font-medium">Respuesta Total:</span> {formatTime(result.grpc.responseTime)}</p>
                              <p className="text-xs text-muted-foreground pl-4">
                                📋 Tiempo completo desde llamada hasta datos procesados. Se calcula con performance.now() al inicio y fin de toda la operación.
                              </p>
                            </div>
                            
                            <div className="space-y-1">
                              <p><span className="font-medium">🚀 Backend→Frontend:</span> {formatTime(result.grpc.transmissionTime)}</p>
                              <p className="text-xs text-muted-foreground pl-4">
                                📡 Tiempo puro de transmisión de red. Se calcula: tiempo_recibido - server.generated_at. Mide solo la velocidad de la red.
                              </p>
                            </div>
                            
                            
                            <div className="space-y-1">
                              <p><span className="font-medium">Tiempo Binario→JS:</span> {formatTime(result.grpc.parsingTime)}</p>
                              <p className="text-xs text-muted-foreground pl-4">
                                ⚡ Tiempo de conversión Protocol Buffer→JavaScript. Se mide desde new Float32Array(binary) hasta objeto final.
                              </p>
                            </div>
                            
                            <div className="space-y-1">
                              <p><span className="font-medium">Payload de Red:</span> {
                                result.grpc.data?.message_size_bytes 
                                  ? `${(result.grpc.data.message_size_bytes / 1024).toFixed(1)} KB (mensaje completo)` 
                                  : result.grpc.data?.binary_data 
                                    ? `${(result.grpc.data.binary_data.length / 1024).toFixed(1)} KB (solo datos)`
                                    : 'N/A'
                              }</p>
                              <p className="text-xs text-muted-foreground pl-4">
                                📦 Tamaño del mensaje Protocol Buffer completo serializado tal como se transmite por la red (incluye datos + metadata).
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No data</p>
                        )}
                      </div>
                      <div>
                        <h4 className="font-semibold text-green-600 mb-3">REST + JSON</h4>
                        {result.rest ? (
                          <div className="space-y-1 text-sm">
                            <div className="space-y-1">
                              <p><span className="font-medium">Respuesta Total:</span> {formatTime(result.rest.responseTime)}</p>
                              <p className="text-xs text-muted-foreground pl-4">
                                📋 Tiempo completo desde llamada hasta datos procesados. Se calcula con performance.now() al inicio y fin de toda la operación.
                              </p>
                            </div>
                            
                            <div className="space-y-1">
                              <p><span className="font-medium">🚀 Backend→Frontend:</span> {formatTime(result.rest.transmissionTime)}</p>
                              <p className="text-xs text-muted-foreground pl-4">
                                📡 Tiempo puro de transmisión de red. Se calcula: tiempo_recibido - server.generated_at. Mide solo la velocidad de la red.
                              </p>
                            </div>
                            
                            <div className="space-y-1">
                              <p><span className="font-medium">Payload de Red:</span> {formatSize(result.rest.networkPayloadSize)}</p>
                              <p className="text-xs text-muted-foreground pl-4">
                                📦 Tamaño del texto JSON tal como se transmite por la red. Se calcula: new Blob([responseText]).size.
                              </p>
                            </div>
                            
                            
                            <div className="space-y-1">
                              <p><span className="font-medium">Tiempo Parsing JSON:</span> {formatTime(result.rest.parsingTime)}</p>
                              <p className="text-xs text-muted-foreground pl-4">
                                ⚡ Tiempo de conversión JSON→JavaScript + procesamiento. Incluye JSON.parse() + conversión a formato final.
                              </p>
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No data</p>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {result.grpc && result.rest && (
                    <div className="mt-4 pt-4 border-t space-y-2">
                      <div className="text-sm">
                        <span className="font-medium">🚀 Tiempo Backend→Frontend:</span> {' '}
                        {result.grpc.transmissionTime < result.rest.transmissionTime ? (
                          <span className="text-blue-600 font-medium">gRPC es {((result.rest.transmissionTime / result.grpc.transmissionTime - 1) * 100).toFixed(1)}% más rápido</span>
                        ) : (
                          <span className="text-green-600 font-medium">REST es {((result.grpc.transmissionTime / result.rest.transmissionTime - 1) * 100).toFixed(1)}% más rápido</span>
                        )}
                      </div>
                      
                      <div className="text-sm">
                        <span className="font-medium">Tiempo Total de Respuesta:</span> {' '}
                        {result.grpc.responseTime < result.rest.responseTime ? (
                          <span className="text-blue-600">gRPC es {((result.rest.responseTime / result.grpc.responseTime - 1) * 100).toFixed(1)}% más rápido</span>
                        ) : (
                          <span className="text-green-600">REST es {((result.grpc.responseTime / result.rest.responseTime - 1) * 100).toFixed(1)}% más rápido</span>
                        )}
                      </div>
                      
                    </div>
                  )}

                  {/* Mostrar validación de consistencia de datos */}
                  {result.dataConsistency && (
                    <div className="mt-4 pt-4 border-t">
                      <h5 className="font-semibold text-purple-600 mb-2">📊 Validación de Consistencia</h5>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div className="flex items-center gap-1">
                          {result.dataConsistency.totalCountMatch ? (
                            <span className="text-green-600">✓ Total Count</span>
                          ) : (
                            <span className="text-red-600">✗ Total Count</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {result.dataConsistency.boundsMatch ? (
                            <span className="text-green-600">✓ Bounds</span>
                          ) : (
                            <span className="text-red-600">✗ Bounds</span>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {result.dataConsistency.sampleDataMatch ? (
                            <span className="text-green-600">✓ Sample Data</span>
                          ) : (
                            <span className="text-red-600">✗ Sample Data</span>
                          )}
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground mt-2">
                        {result.dataConsistency.details}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="summary">
          <Card>
            <CardHeader>
              <CardTitle>Performance Summary</CardTitle>
              <CardDescription>
                Average performance across all completed tests
              </CardDescription>
            </CardHeader>
            <CardContent>
              {results.filter(r => r.grpc && r.rest).length === 0 ? (
                <p className="text-muted-foreground">No completed comparisons yet.</p>
              ) : (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    {results.filter(r => r.grpc && r.rest).length} successful comparisons completed
                  </p>
                  <div className="text-sm">
                    <p className="font-medium mb-2">🚀 Enhanced Performance Breakdown:</p>
                    <p className="text-muted-foreground">
                      • <span className="font-medium">Server Generation:</span> Time to generate data on backend (should be identical)
                    </p>
                    <p className="text-muted-foreground">
                      • <span className="font-medium">Network Transmission:</span> Time to send data over network (Protocol Buffer vs JSON)
                    </p>
                    <p className="text-muted-foreground">
                      • <span className="font-medium">Frontend Memory:</span> JavaScript object representation size after parsing
                    </p>
                    <p className="text-muted-foreground">
                      • <span className="font-medium">Parsing Time:</span> Binary-to-JS vs JSON-to-JS conversion time
                    </p>
                    <p className="text-xs text-muted-foreground mt-2">
                      Network transmission time calculated using server&apos;s generated_at timestamp for precise measurement
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}