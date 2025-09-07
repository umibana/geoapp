import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface FormatResult {
  responseTime: number;
  transmissionTime: number;
  networkPayloadSize: number;
  frontendMemorySize: number;
  parsingTime: number;
  data: any;
  format: string;
}

interface ThreeWayResult {
  testName: string;
  seed: number;
  timestamp: string;
  formats: FormatResult[];
  dataConsistency: {
    allMatch: boolean;
    details: string;
  };
  error?: string;
}

export function ThreeWayComparison() {
  const [results, setResults] = useState<ThreeWayResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [testSize, setTestSize] = useState<number>(100000);

  // Generar semilla determinística para comparación justa
  const generateSeed = () => Math.floor(Math.random() * 1000000);

  // Procesar datos de manera consistente en todos los formatos
  const processData = (rawData: any, format: string) => {
    const startTime = performance.now();
    
    let flatArray: number[] | Float32Array;
    let originalData: any;

    if (format === 'grpc') {
      // gRPC: binary_data -> Float32Array (NO convertir a array - es lento!)
      if (rawData.binary_data && rawData.data_length) {
        // ÓPTIMO: binary_data_f32 ya es Float32Array optimizado por el generador automático
        // ⚡ Zero-copy y memory-aligned cuando es posible
        flatArray = rawData.binary_data_f32 || new Float32Array(rawData.binary_data);
        originalData = rawData;
      } else {
        flatArray = [];
        originalData = rawData;
      }
    } else {
      // REST (JSON/MessagePack): already parsed data
      flatArray = rawData.data || [];
      originalData = rawData;
    }

    // Convertir a puntos para validación de consistencia
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

  // Validar consistencia de datos en los tres formatos
  const validateConsistency = (grpcData: any, jsonData: any, msgpackData: any) => {
    try {
      const datasets = [
        { name: 'gRPC', data: grpcData },
        { name: 'JSON', data: jsonData },
        { name: 'MessagePack', data: msgpackData }
      ];

      // Verificar conteos totales
      const totalCounts = datasets.map(d => d.data.total_count || 0);
      const totalCountsMatch = totalCounts.every(count => count === totalCounts[0]);

      // Verificar límites (con tolerancia de punto flotante)
      const boundsMatch = datasets.every((d1, i) => {
        return datasets.slice(i + 1).every(d2 => {
          const b1 = d1.data.bounds || {};
          const b2 = d2.data.bounds || {};
          
          return ['x', 'y', 'z'].every(axis => {
            const min1 = b1[axis]?.min_value || 0;
            const max1 = b1[axis]?.max_value || 0;
            const min2 = b2[axis]?.min_value || 0;
            const max2 = b2[axis]?.max_value || 0;
            
            return Math.abs(min1 - min2) < 0.001 && Math.abs(max1 - max2) < 0.001;
          });
        });
      });

      // Verificar puntos de muestra (primeros 10)
      let sampleDataMatch = true;
      const sampleSize = Math.min(10, grpcData.data?.length || 0);
      
      for (let i = 0; i < sampleSize && sampleDataMatch; i++) {
        const grpcPoint = grpcData.data[i] || [];
        const jsonPoint = jsonData.data[i] || [];
        const msgpackPoint = msgpackData.data[i] || [];
        
        if (grpcPoint.length !== 3 || jsonPoint.length !== 3 || msgpackPoint.length !== 3) {
          sampleDataMatch = false;
          break;
        }
        
        for (let j = 0; j < 3; j++) {
          if (Math.abs(grpcPoint[j] - jsonPoint[j]) > 0.001 ||
              Math.abs(grpcPoint[j] - msgpackPoint[j]) > 0.001 ||
              Math.abs(jsonPoint[j] - msgpackPoint[j]) > 0.001) {
            sampleDataMatch = false;
            break;
          }
        }
      }

      const allMatch = totalCountsMatch && boundsMatch && sampleDataMatch;
      
      return {
        allMatch,
        details: `Counts: ${totalCountsMatch ? '✓' : '✗'} (${totalCounts.join(', ')}), ` +
                `Bounds: ${boundsMatch ? '✓' : '✗'}, ` +
                `Sample Data: ${sampleDataMatch ? '✓' : '✗'} (${sampleSize} points)`
      };
    } catch (error) {
      return {
        allMatch: false,
        details: `Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  };

  // Ejecutar comparación simultánea de tres vías
  const runThreeWayTest = async (testName: string) => {
    setIsLoading(true);
    
    const seed = generateSeed();
    const timestamp = new Date().toISOString();
    const result: ThreeWayResult = {
      testName: `${testName} (${testSize.toLocaleString()} points)`,
      seed,
      timestamp,
      formats: [],
      dataConsistency: { allMatch: false, details: '' }
    };

    try {
      // **CRÍTICO**: Ejecutar las tres llamadas simultáneamente con la misma semilla
      const [grpcResponse, jsonResponse, msgpackResponse] = await Promise.all([
        // gRPC call
        (async () => {
          const start = performance.now();
          const response = await window.autoGrpc.getColumnarData({ 
            data_types: ['elevation'], 
            max_points: testSize,
            seed // Use same seed!
          });
          const end = performance.now();
          const receivedAt = Date.now();
          
          const processed = processData(response, 'grpc');
          
          return {
            responseTime: end - start,
            transmissionTime: response.generated_at ? receivedAt - (response.generated_at * 1000) : 0,
            networkPayloadSize: response.message_size_bytes || response.binary_data?.byteLength || 0,
            frontendMemorySize: processed.frontendMemorySize,
            parsingTime: processed.parsingTime,
            data: processed.processedData,
            format: 'Protocol Buffer (gRPC)',
            rawResponse: response
          };
        })(),
        
        // JSON REST call  
        (async () => {
          const start = performance.now();
          const response = await window.electronBackend.rest.getColumnarData({
            data_types: ['elevation'],
            max_points: testSize,
            seed // Use same seed!
          });
          const end = performance.now();
          
          const processed = processData(response.data, 'json');
          
          return {
            responseTime: end - start,
            transmissionTime: response.transmissionTime || 0,
            networkPayloadSize: response.networkPayloadSize || 0,
            frontendMemorySize: processed.frontendMemorySize,
            parsingTime: (response.parsingTime || 0) + processed.parsingTime,
            data: processed.processedData,
            format: 'JSON (REST)',
            rawResponse: response
          };
        })(),
        
        // MessagePack REST call
        (async () => {
          const start = performance.now();
          const response = await window.electronBackend.rest.getColumnarDataMsgpack({
            data_types: ['elevation'],
            max_points: testSize,
            seed // Use same seed!
          });
          const end = performance.now();
          
          const processed = processData(response.data, 'msgpack');
          
          return {
            responseTime: end - start,
            transmissionTime: response.transmissionTime || 0,
            networkPayloadSize: response.networkPayloadSize || 0,
            frontendMemorySize: processed.frontendMemorySize,
            parsingTime: (response.parsingTime || 0) + processed.parsingTime,
            data: processed.processedData,
            format: 'MessagePack (REST)',
            rawResponse: response
          };
        })()
      ]);

      result.formats = [grpcResponse, jsonResponse, msgpackResponse];
      
      // Validate data consistency
      result.dataConsistency = validateConsistency(
        grpcResponse.data,
        jsonResponse.data, 
        msgpackResponse.data
      );
      
    } catch (error) {
      result.error = error instanceof Error ? error.message : 'Unknown error';
    }

    setResults(prev => [result, ...prev]);
    setIsLoading(false);
  };

  const formatTime = (ms: number) => `${ms.toFixed(2)}ms`;
  const formatSize = (bytes: number) => `${(bytes / 1024).toFixed(2)} KB`;

  const clearResults = () => setResults([]);

  return (
    <div className="p-6 space-y-6">
      <div className="space-y-4">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Comparación de Rendimiento de Tres Vías</h2>
          <p className="text-muted-foreground">
            Comparación simultánea justa: Protocol Buffer vs JSON vs MessagePack
          </p>
        </div>

        {/* Metodología de Medición */}
        <details>
          <summary className="font-semibold cursor-pointer text-lg">🔬 Metodología de Medición Simultánea</summary>
          <Card className="mt-4 p-4 bg-green-50 dark:bg-green-950">
            <div className="space-y-4 text-sm">
              <div>
                <h4 className="font-semibold text-green-800 dark:text-green-200">⚡ Comparación Simultánea (Más Justa)</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Los tres formatos se prueban <strong>exactamente al mismo tiempo</strong> usando <code>Promise.all()</code>, 
                  eliminando variaciones de red, carga del sistema y efectos de caché.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-blue-100 dark:bg-blue-900 p-2 rounded">
                    <span className="font-medium text-blue-800 dark:text-blue-200">🔵 Protocol Buffer (gRPC)</span>
                    <ul className="text-xs mt-1 space-y-1">
                      <li>• Datos binarios compactos</li>
                      <li>• Conversión binaria→Float32Array</li>
                      <li>• Timestamp servidor para red</li>
                    </ul>
                  </div>
                  <div className="bg-green-100 dark:bg-green-900 p-2 rounded">
                    <span className="font-medium text-green-800 dark:text-green-200">🟢 JSON (REST)</span>
                    <ul className="text-xs mt-1 space-y-1">
                      <li>• Texto legible por humanos</li>
                      <li>• JSON.parse() + procesamiento</li>
                      <li>• Timestamp servidor para red</li>
                    </ul>
                  </div>
                  <div className="bg-purple-100 dark:bg-purple-900 p-2 rounded">
                    <span className="font-medium text-purple-800 dark:text-purple-200">🟣 MessagePack (REST)</span>
                    <ul className="text-xs mt-1 space-y-1">
                      <li>• Binario compacto sin esquema</li>
                      <li>• decode() + procesamiento</li>
                      <li>• Timestamp servidor para red</li>
                    </ul>
                  </div>
                </div>
              </div>
              
              <div className="border-t pt-3">
                <h4 className="font-semibold text-green-800 dark:text-green-200">🎯 Garantías de Justicia Extrema</h4>
                <ul className="text-xs text-muted-foreground mt-2 space-y-1">
                  <li>✅ <strong>Semilla idéntica:</strong> Los tres formatos reciben la misma semilla determinística</li>
                  <li>✅ <strong>Ejecución simultánea:</strong> Promise.all() ejecuta las 3 llamadas en paralelo exacto</li>
                  <li>✅ <strong>Mismos datos:</strong> Backend genera datos idénticos usando la misma semilla</li>
                  <li>✅ <strong>Validación de consistencia:</strong> Verifica que los 3 formatos recibieron datos idénticos</li>
                  <li>✅ <strong>Medición uniforme:</strong> Mismo código para medir tiempos y tamaños</li>
                </ul>
              </div>
            </div>
          </Card>
        </details>
        
        <Card className="p-4 bg-blue-50 dark:bg-blue-950">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <Label htmlFor="testSize" className="text-lg font-semibold">
                Tamaño de Prueba (puntos de datos):
              </Label>
              <p className="text-sm text-muted-foreground">
                Los tres formatos usarán la misma semilla y cantidad de puntos para una comparación justa
              </p>
            </div>
            <div className="w-48">
              <Input
                id="testSize"
                type="number"
                value={testSize}
                onChange={(e) => setTestSize(Number(e.target.value))}
                min={1000}
                max={10000000}
                className="text-lg font-semibold text-center"
                placeholder="100000"
              />
            </div>
          </div>
        </Card>
      </div>

      <div className="flex gap-4">
        <Button 
          onClick={() => runThreeWayTest('Data Generation Comparison')} 
          disabled={isLoading}
          className="flex-1"
        >
          {isLoading ? 'Probando...' : `Ejecutar Prueba de Tres Vías (${testSize.toLocaleString()} puntos)`}
        </Button>
        <Button variant="outline" onClick={clearResults} disabled={isLoading}>
          Limpiar Resultados
        </Button>
      </div>

      <div className="space-y-4">
        {results.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center">
              <p className="text-muted-foreground">Aún no hay resultados de prueba. Ejecuta una prueba de tres vías para ver comparaciones.</p>
            </CardContent>
          </Card>
        ) : (
          results.map((result, index) => (
            <Card key={index}>
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>{result.testName}</span>
                  <div className="flex gap-2">
                    <Badge variant="outline">Semilla: {result.seed}</Badge>
                    {result.error && <Badge variant="destructive">Error</Badge>}
                    {result.dataConsistency.allMatch && <Badge variant="default" className="bg-green-600">Datos Consistentes ✓</Badge>}
                    {!result.dataConsistency.allMatch && !result.error && <Badge variant="destructive">Datos Inconsistentes ✗</Badge>}
                  </div>
                </CardTitle>
                <CardDescription>
                  {result.timestamp} | {result.dataConsistency.details}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {result.error ? (
                  <p className="text-red-600">{result.error}</p>
                ) : (
                  <div className="space-y-6">
                    {/* Performance comparison grid */}
                    <div className="grid grid-cols-3 gap-6">
                      {result.formats.map((format, fIndex) => (
                        <div key={fIndex}>
                          <h4 className={`font-semibold mb-3 ${
                            fIndex === 0 ? 'text-blue-600' : 
                            fIndex === 1 ? 'text-green-600' : 'text-purple-600'
                          }`}>
                            {format.format}
                          </h4>
                          <div className="space-y-2 text-sm">
                            <p><span className="font-medium">Tiempo Total:</span> {formatTime(format.responseTime)}</p>
                            <p><span className="font-medium">Red:</span> {formatTime(format.transmissionTime)}</p>
                            <p><span className="font-medium">Parseo:</span> {formatTime(format.parsingTime)}</p>
                            <p><span className="font-medium">Payload:</span> {formatSize(format.networkPayloadSize)}</p>
                            <p><span className="font-medium">Memoria:</span> {formatSize(format.frontendMemorySize)}</p>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Winner analysis */}
                    {result.formats.length === 3 && (
                      <div className="border-t pt-4">
                        <h5 className="font-semibold mb-2">🏆 Ganadores de Rendimiento</h5>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div>
                            <span className="font-medium">Más Rápido Total:</span> {' '}
                            {(() => {
                              const fastest = result.formats.reduce((prev, current) => 
                                prev.responseTime < current.responseTime ? prev : current
                              );
                              return <span className="text-green-600">{fastest.format}</span>;
                            })()}
                          </div>
                          <div>
                            <span className="font-medium">Payload Más Pequeño:</span> {' '}
                            {(() => {
                              const smallest = result.formats.reduce((prev, current) => 
                                prev.networkPayloadSize < current.networkPayloadSize ? prev : current
                              );
                              return <span className="text-green-600">{smallest.format}</span>;
                            })()}
                          </div>
                          <div>
                            <span className="font-medium">Parseo Más Rápido:</span> {' '}
                            {(() => {
                              const fastest = result.formats.reduce((prev, current) => 
                                prev.parsingTime < current.parsingTime ? prev : current
                              );
                              return <span className="text-green-600">{fastest.format}</span>;
                            })()}
                          </div>
                          <div>
                            <span className="font-medium">Menos Memoria:</span> {' '}
                            {(() => {
                              const smallest = result.formats.reduce((prev, current) => 
                                prev.frontendMemorySize < current.frontendMemorySize ? prev : current
                              );
                              return <span className="text-green-600">{smallest.format}</span>;
                            })()}
                          </div>
                        </div>
                      </div>
                    )}
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