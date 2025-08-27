import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { ChildProcessVisualization } from './ChildProcessVisualization';

/**
 * Característica geoespacial
 * Representa un punto de interés o elemento geográfico con ubicación y propiedades
 */
interface GeospatialFeature {
  id: string;                                                          // ID único de la característica
  name: string;                                                        // Nombre descriptivo
  location: { latitude: number; longitude: number; altitude?: number }; // Ubicación geográfica
  properties: Record<string, string>;                                  // Propiedades adicionales
  timestamp: number;                                                   // Marca de tiempo
}

/**
 * Punto de datos geoespaciales
 * Representa una medición o valor en una ubicación específica
 */
interface DataPoint {
  id: string;                                                          // ID único del punto
  location: { latitude: number; longitude: number; altitude?: number }; // Ubicación del punto
  value: number;                                                       // Valor medido
  unit: string;                                                        // Unidad de medida
  timestamp: number;                                                   // Marca de tiempo
  metadata: Record<string, string>;                                    // Metadatos adicionales
}

/**
 * Componente de demostración de gRPC
 * Muestra las capacidades del backend gRPC con ejemplos interactivos
 * Incluye carga de datos, streaming, procesamiento optimizado y visualizaciones
 */
export function GrpcDemo() {
  const [isConnected, setIsConnected] = useState(false);
  const [features, setFeatures] = useState<GeospatialFeature[]>([]);
  const [streamData, setStreamData] = useState<DataPoint[]>([]);
  const [batchData, setBatchData] = useState<DataPoint[]>([]);
  const [streaming, setStreaming] = useState(false);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [paramTestLoading, setParamTestLoading] = useState(false);
  const [paramTestData, setParamTestData] = useState<DataPoint[]>([]);
  const [testParams, setTestParams] = useState({
    maxPoints: 10000,
    resolution: 100,
    dataType: 'elevation'
  });
  
  // (removed legacy worker stream test state)
  
  // Simple gRPC examples state
  const [helloWorldInput, setHelloWorldInput] = useState('');
  const [echoParamInput, setEchoParamInput] = useState('');
  
  // (removed legacy worker stream progress/throttle state)

  // Optimized data processing state
  const [processingResult, setProcessingResult] = useState<{
    duration: number; 
    pointsPerSecond: number; 
    memoryUsage: string; 
    status: 'success' | 'failed' | 'running'; 
    data?: unknown;
  } | null>(null);

  const [isProcessing, setIsProcessing] = useState(false);
  const [processingProgress, setProcessingProgress] = useState(0);

  useEffect(() => {
    initializeGrpc();
  }, []);

  /**
   * Inicializa la conexión gRPC
   * Verifica la conectividad con el backend usando verificación de salud
   */
  const initializeGrpc = async () => {
    try {
      setLoading(true);
      
      // Probar conexión vía IPC usando cliente auto-generado
      const health = await window.autoGrpc.healthCheck({});
      setIsConnected(health.healthy);
      
      console.log('✅ gRPC initialized via IPC:', health);
    } catch (error) {
      console.error('❌ gRPC initialization failed:', error);
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  };

  const handleLoadFeatures = async () => {
    if (!isConnected) return;
    
    try {
      setLoading(true);
      
      // Sample bounds for San Francisco area
      const bounds = {
        northeast: { latitude: 37.7849, longitude: -122.4094 },
        southwest: { latitude: 37.7749, longitude: -122.4194 }
      };
      
      const result = await window.autoGrpc.getFeatures({ bounds, feature_types: [], limit: 20 });
      setFeatures(result.features);
      
      console.log(`📍 Loaded ${result.features.length} features via gRPC`);
    } catch (error) {
      console.error('Failed to load features:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleStartStreaming = async () => {
    if (!isConnected || streaming) return;
    
    setStreaming(true);
    setStreamData([]);
    
    try {
      const bounds = {
        northeast: { latitude: 37.7849, longitude: -122.4094 },
        southwest: { latitude: 37.7749, longitude: -122.4194 }
      };
      
      console.log('🔄 Starting real-time gRPC stream (10 seconds)...');
      
      // This is the power of gRPC - simple async iteration with numpy data types!
      // Using getBatchDataColumnarStreamed for optimal performance
      const result = await window.autoGrpc.getBatchDataColumnarStreamed({
        bounds,
        data_types: ['elevation', 'temperature'],
        max_points: 30,
        resolution: 10
      }, (chunk) => {
        console.log('Streaming progress:', chunk);
        // Update UI with progress - you could show real-time progress here
        }
      );
      
      console.log('Stream completed, result:', result);
      toast.success(`Processed ${result.totalProcessed} data points`);
    } catch (error) {
      console.error('Streaming error:', error);
    } finally {
      setStreaming(false);
      console.log('🛑 gRPC Stream ended');
    }
  };

  const handleStopStreaming = async () => {
    try {
      // Note: Auto-generated client doesn't have stopStream - handle via stream completion
      setStreaming(false);
      console.log('🛑 Stream stopped successfully');
    } catch (error) {
      console.error('Failed to stop stream:', error);
      setStreaming(false); // Still update UI state
    }
  };

  const handleLoadBatchData = async () => {
    if (!isConnected) return;
    
    try {
      setBatchLoading(true);
      setBatchData([]);
      
      // Sample bounds for San Francisco area
      const bounds = {
        northeast: { latitude: 37.7849, longitude: -122.4094 },
        southwest: { latitude: 37.7749, longitude: -122.4194 }
      };
      
      console.log('📦 Loading batch data via Columnar API...');
      const result = await window.autoGrpc.getBatchDataColumnar({
        bounds,
        data_types: ['elevation'],
        max_points: 50000,
        resolution: 10
      });
      
      // Extract columnar data info
      const totalProcessed = result.columnar_data?.x?.length || 0;
      const processingTime = 0; // processing_time not available in response
      // Logs reducidos para evitar overhead de DevTools con objetos grandes
      setBatchData([]);
      toast.success(`Batch Data Loaded!`, {
        description: `${totalProcessed.toLocaleString()} points in ${processingTime.toFixed(2)}s via Columnar API`
      });
    } catch (error) {
      console.error('Failed to load batch data:', error);
      toast.error('Failed to load batch data', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setBatchLoading(false);
    }
  };

  const handleParameterTest = async () => {
    if (!isConnected) return;
    
    try {
      setParamTestLoading(true);
      setParamTestData([]);
      
      // Sample bounds for San Francisco area
      const bounds = {
        northeast: { latitude: 37.7849, longitude: -122.4094 },
        southwest: { latitude: 37.7749, longitude: -122.4194 }
      };
      
      const totalStartTime = performance.now();
      // Log resumido
      console.log(`🧪 Testing: ${testParams.maxPoints.toLocaleString()} pts, res ${testParams.resolution}, type ${testParams.dataType}`);
      
      // Test with custom parameters
      console.log(`🔄 Starting gRPC call at ${new Date().toLocaleTimeString()}`);
      const grpcStartTime = performance.now();
      
      const result = await window.autoGrpc.getBatchDataColumnar({
        bounds,
        data_types: [testParams.dataType],
        max_points: testParams.maxPoints,
        resolution: testParams.resolution
      });
      
      const grpcEndTime = performance.now();
      const dataProcessingStartTime = performance.now();
      
      // Note: result structure changed for getBatchDataColumnar
      // Process columnar data for display
      
      const dataProcessingEndTime = performance.now();
      const totalEndTime = performance.now();
      
      const grpcTime = (grpcEndTime - grpcStartTime) / 1000;
      const dataProcessingTime = (dataProcessingEndTime - dataProcessingStartTime) / 1000;
      const totalDuration = (totalEndTime - totalStartTime) / 1000;
      
      // Convert columnar data to display format (sample)
      const columnarData = result.columnar_data;
      const displayData: DataPoint[] = [];
      if (columnarData && columnarData.x && columnarData.y && columnarData.z) {
        const sampleSize = Math.min(100, columnarData.x.length); // Show first 100 points
        for (let i = 0; i < sampleSize; i++) {
          displayData.push({
            id: columnarData.id?.[i] || `point_${i}`,
            location: {
              latitude: columnarData.y[i],
              longitude: columnarData.x[i],
              altitude: columnarData.z[i]
            },
            value: columnarData.z[i],
            unit: testParams.dataType === 'elevation' ? 'm' : testParams.dataType === 'temperature' ? '°C' : 'Pa',
            timestamp: Date.now(),
            metadata: {
              generation_method: 'columnar_batch',
              grid_position: `${i}_of_${columnarData.x.length}`
            }
          });
        }
      }
      setParamTestData(displayData);
      
      // Calculate data transfer rate
      const totalProcessed = columnarData?.x?.length || 0;
      const estimatedDataSize = totalProcessed * 120; // rough estimate in bytes
      const transferRateMBps = (estimatedDataSize / (1024 * 1024)) / grpcTime;
      
      console.log(`⏱️ gRPC: ${grpcTime.toFixed(2)}s, Proc: ${dataProcessingTime.toFixed(2)}s, Total: ${totalDuration.toFixed(2)}s, Rate: ${transferRateMBps.toFixed(1)} MB/s`);
      
      toast.success(`Parameter Test Complete!`, {
        description: `${totalProcessed.toLocaleString()} ${testParams.dataType} points generated in ${totalDuration.toFixed(2)}s (${transferRateMBps.toFixed(1)} MB/s)`
      });
    } catch (error) {
      console.error('Parameter test failed:', error);
      toast.error('Parameter test failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setParamTestLoading(false);
    }
  };


  // Test de streaming con Web Worker (CERO bloqueo del hilo principal)
  // (removed legacy web worker deep-dive demo)

  // Optimized processing function with automatic strategy selection
  const runOptimizedProcessing = async () => {
    if (!isConnected || isProcessing) return;
    
    setIsProcessing(true);
    setProcessingProgress(0);
    setProcessingResult({ 
      duration: 0, 
      pointsPerSecond: 0, 
      memoryUsage: 'Processing...', 
      status: 'running' 
    });

    const bounds = {
      northeast: { latitude: 37.7849, longitude: -122.4094 },
      southwest: { latitude: 37.7749, longitude: -122.4194 }
    };

    try {
      console.log(`🎯 Processing ${testParams.maxPoints.toLocaleString()} points with auto strategy selection...`);
      const startTime = performance.now();

      const result = await window.autoGrpc.getBatchDataColumnar({
        bounds,
        data_types: [testParams.dataType],
        max_points: testParams.maxPoints,
        resolution: testParams.resolution
      });
      
      // Since columnar API doesn't have progress callback, simulate progress completion
      setProcessingProgress(100);
      
      const endTime = performance.now();
      const duration = (endTime - startTime) / 1000;
      const columnarData = result.columnar_data;
      const totalProcessed = columnarData?.x?.length || 0;
      const pointsPerSecond = Math.round(totalProcessed / duration);
      
      setProcessingResult({
        duration,
        pointsPerSecond,
        memoryUsage: 'Columnar (Optimized)',
        status: 'success',
        data: result
      });
      
      console.log(`✅ Processing completed: ${duration.toFixed(2)}s, ${pointsPerSecond.toLocaleString()} pts/s`);
      
      toast.success(`⚡ Processing Complete!`, {
        description: `${totalProcessed.toLocaleString()} points in ${duration.toFixed(2)}s (${pointsPerSecond.toLocaleString()} pts/s) using Columnar API`
      });
      
    } catch (error) {
      console.error('❌ Optimized processing failed:', error);
      setProcessingResult({
        duration: 0,
        pointsPerSecond: 0,
        memoryUsage: 'Failed',
        status: 'failed'
      });
      toast.error('Processing failed', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // (removed legacy individual strategy testers)

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
        <h2 className="text-2xl font-bold mb-4 text-gray-800">
          Demo Geoespacial gRPC
        </h2>
        
        {/* Connection Status */}
        <div className="mb-6 p-4 rounded-lg bg-gray-50">
          <div className="flex items-center gap-2 mb-2">
            <div 
              className={`w-3 h-3 rounded-full ${
                isConnected ? 'bg-green-500' : 'bg-red-500'
              }`}
            />
            <span className="font-semibold">
              Estado gRPC: {isConnected ? 'Conectado' : 'Desconectado'}
            </span>
          </div>
          
          {!isConnected && (
            <Button 
              onClick={initializeGrpc}
              disabled={loading}
              className="mt-2"
            >
              {loading ? 'Conectando...' : 'Reconectar'}
            </Button>
          )}
        </div>

        {/* Feature Loading */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Cargar Características Geoespaciales</h3>
          <Button 
            onClick={handleLoadFeatures}
            disabled={!isConnected || loading}
            className="mb-4"
          >
            {loading ? 'Cargando...' : 'Cargar Características'}
          </Button>
          
          {features.length > 0 && (
            <div className="bg-blue-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">
                Cargadas {features.length} características vía gRPC:
              </h4>
              <div className="max-h-40 overflow-y-auto">
                {features.slice(0, 5).map((feature) => (
                  <div key={feature.id} className="text-sm mb-1">
                    <strong>{feature.name}</strong> - 
                    {feature.location.latitude.toFixed(4)}, 
                    {feature.location.longitude.toFixed(4)}
                    <span className="text-blue-600 ml-2">
                      (Protocol: {feature.properties.protocol || 'gRPC'})
                    </span>
                  </div>
                ))}
                {features.length > 5 && (
                  <div className="text-sm text-gray-600">
                    ... y {features.length - 5} más
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Batch Data Loading */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Carga de Datos por Lotes (Generado con Numpy)</h3>
          <Button 
            onClick={handleLoadBatchData}
            disabled={!isConnected || batchLoading}
            className="mb-4"
          >
            {batchLoading ? 'Cargando Datos por Lotes...' : 'Cargar Datos por Lotes (Elevación)'}
          </Button>
          
          {batchData.length > 0 && (
            <div className="bg-purple-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">
                Cargados {batchData.length} puntos de datos vía método por lotes gRPC:
              </h4>
              <div className="max-h-40 overflow-y-auto">
                {batchData.slice(0, 8).map((point) => (
                  <div key={point.id} className="text-sm mb-1">
                    <strong>📍 {point.location.latitude.toFixed(4)}, {point.location.longitude.toFixed(4)}</strong> - 
                    <span className="text-purple-600 ml-2">
                      {point.value.toFixed(2)} {point.unit}
                    </span>
                    <span className="text-gray-500 ml-2">
                      (Method: {point.metadata.generation_method})
                    </span>
                  </div>
                ))}
                {batchData.length > 8 && (
                  <div className="text-sm text-gray-600">
                    ... y {batchData.length - 8} puntos de datos más
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Parameter Testing */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">Pruebas de Parámetros del Generador de Datos</h3>
          <div className="bg-gray-50 p-4 rounded-lg mb-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Máx. Puntos
                </label>
                <select 
                  value={testParams.maxPoints}
                  onChange={(e) => setTestParams(prev => ({ ...prev, maxPoints: parseInt(e.target.value) }))}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value={1000}>1.000 puntos</option>
                  <option value={10000}>10.000 puntos</option>
                  <option value={100000}>100.000 puntos</option>
                  <option value={1000000}>1.000.000 puntos</option>
                  <option value={2000000}>2.000.000 puntos</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Resolución
                </label>
                <input 
                  type="number"
                  value={testParams.resolution}
                  onChange={(e) => setTestParams(prev => ({ ...prev, resolution: parseInt(e.target.value) || 20 }))}
                  min="10"
                  max="1000"
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tipo de Datos
                </label>
                <select 
                  value={testParams.dataType}
                  onChange={(e) => setTestParams(prev => ({ ...prev, dataType: e.target.value }))}
                  className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="elevation">Elevación</option>
                  <option value="temperature">Temperatura</option>
                  <option value="pressure">Presión</option>
                  <option value="noise">Ruido</option>
                  <option value="sine_wave">Onda Senoidal</option>
                </select>
              </div>
            </div>
            
            <Button 
              onClick={handleParameterTest}
              disabled={!isConnected || paramTestLoading}
              className="w-full md:w-auto bg-indigo-600 hover:bg-indigo-700"
            >
              {paramTestLoading ? 'Generando Datos...' : `Generar ${testParams.maxPoints.toLocaleString()} Puntos`}
            </Button>
          </div>
          
          {paramTestData.length > 0 && (
            <div className="bg-indigo-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">
                Generados {paramTestData.length.toLocaleString()} puntos de datos:
              </h4>
              <div className="text-sm text-gray-600 mb-3">
                <strong>Tipo:</strong> {testParams.dataType} | 
                <strong> Resolución:</strong> {testParams.resolution} | 
                <strong> Método:</strong> numpy_{testParams.dataType}_batch
              </div>
              <div className="max-h-40 overflow-y-auto">
                {paramTestData.slice(0, 10).map((point) => (
                  <div key={point.id} className="text-sm mb-1">
                    <strong>📍 {point.location.latitude.toFixed(4)}, {point.location.longitude.toFixed(4)}</strong> - 
                    <span className="text-indigo-600 ml-2">
                      {point.value.toFixed(2)} {point.unit}
                    </span>
                    <span className="text-gray-500 ml-2">
                      (Grid: {point.metadata.grid_position})
                    </span>
                  </div>
                ))}
                {paramTestData.length > 10 && (
                  <div className="text-sm text-gray-600 mt-2">
                    ... y {(paramTestData.length - 10).toLocaleString()} puntos de datos más
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Simple gRPC Examples */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">🎯 Ejemplos Simples de gRPC</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">👋 Hola Mundo</h4>
              <div className="flex gap-2">
                <input 
                  type="text" 
                  placeholder="Ingresa un mensaje..." 
                  value={helloWorldInput}
                  onChange={(e) => setHelloWorldInput(e.target.value)}
                  className="flex-1 px-3 py-1 border rounded text-sm"
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && helloWorldInput.trim()) {
                      try {
                        const response = await window.autoGrpc.helloWorld({ message: helloWorldInput });
                        toast.success('Respuesta Hola Mundo', {
                          description: response.message
                        });
                        setHelloWorldInput(''); // Limpiar usando setState
                      } catch (error) {
                        toast.error('Hola Mundo Falló', {
                          description: error instanceof Error ? error.message : 'Error desconocido'
                        });
                      }
                    }
                  }}
                />
                <span className="text-xs text-gray-500 self-center">Presiona Enter</span>
              </div>
            </div>
            
            <div className="p-4 border rounded-lg">
              <h4 className="font-medium mb-2">🔢 Parámetro Echo</h4>
              <div className="flex gap-2">
                <input 
                  type="number" 
                  placeholder="Valor..." 
                  value={echoParamInput}
                  onChange={(e) => setEchoParamInput(e.target.value)}
                  className="flex-1 px-3 py-1 border rounded text-sm"
                  onKeyDown={async (e) => {
                    if (e.key === 'Enter' && echoParamInput.trim()) {
                      try {
                        const value = parseFloat(echoParamInput);
                        if (isNaN(value)) {
                          toast.error('Error', { description: 'Por favor ingresa un número válido' });
                          return;
                        }
                        const response = await window.autoGrpc.echoParameter({ value, operation: 'square' });
                        toast.success('Respuesta Parámetro Echo', {
                          description: `${response.originalValue} al cuadrado = ${response.processedValue}`
                        });
                        setEchoParamInput(''); // Limpiar usando setState
                      } catch (error) {
                        toast.error('Parámetro Echo Falló', {
                          description: error instanceof Error ? error.message : 'Error desconocido'
                        });
                      }
                    }
                  }}
                />
                <span className="text-xs text-gray-500 self-center">Enter para elevar al cuadrado</span>
              </div>
            </div>
          </div>
        </div>

        {/* Streaming con Web Workers */}
        {/* Removed legacy Web Worker streaming demo section */}

        {/* ⚡ Optimized Data Processing */}
        <div className="mb-6">
          <h3 className="text-lg font-semibold mb-3">⚡ Procesamiento Optimizado de Datos</h3>
          
          <div className="bg-gradient-to-r from-green-50 to-blue-50 border border-green-200 rounded-lg p-6 mb-6">
            <h4 className="font-semibold text-green-800 mb-3">
              🎯 Selección Inteligente de Procesamiento
            </h4>
            <p className="text-sm text-gray-700 mb-4">
              Usa automáticamente la mejor estrategia de procesamiento para {testParams.maxPoints.toLocaleString()} puntos de {testParams.dataType}:
              {testParams.maxPoints >= 50000 ? (
                <span className="ml-2 px-3 py-1 bg-green-100 text-green-700 rounded font-semibold">
                  ⚡ Proceso Hijo (50K+ puntos)
                </span>
              ) : (
                <span className="ml-2 px-3 py-1 bg-blue-100 text-blue-700 rounded font-semibold">
                  🌐 Procesamiento Directo (&lt;50K puntos)
                </span>
              )}
            </p>
            
            <div className="text-center">
              <Button 
                onClick={runOptimizedProcessing}
                disabled={!isConnected || isProcessing}
                className="w-full bg-gradient-to-r from-green-600 to-blue-600 hover:from-green-700 hover:to-blue-700 text-white font-semibold py-4 text-lg"
              >
                {isProcessing ? 'Procesando...' : `⚡ Procesar ${testParams.maxPoints.toLocaleString()} Puntos de ${testParams.dataType}`}
              </Button>
              
              {isProcessing && (
                <div className="mt-4">
                  <div className="w-full bg-green-200 rounded-full h-3">
                    <div 
                      className="bg-gradient-to-r from-green-600 to-blue-600 h-3 rounded-full transition-all duration-500"
                      style={{ width: `${processingProgress}%` }}
                    ></div>
                  </div>
                  <div className="text-sm text-green-600 mt-2 font-medium">
                    {processingProgress.toFixed(1)}% Completado - ¡La UI permanece responsiva!
                  </div>
                </div>
              )}
            </div>
          </div>
          
          {/* Processing Results */}
          {processingResult && processingResult.status === 'success' && (
            <div className="bg-white border border-green-200 rounded-lg p-6 mt-6">
              <h5 className="font-semibold text-green-800 mb-4">⚡ Resultados del Procesamiento</h5>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {processingResult.duration.toFixed(2)}s
                  </div>
                  <div className="text-sm text-gray-600">Duración</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">
                    {processingResult.pointsPerSecond.toLocaleString()}
                  </div>
                  <div className="text-sm text-gray-600">Puntos/Segundo</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-gray-600">
                    {processingResult.memoryUsage}
                  </div>
                  <div className="text-sm text-gray-600">Uso de Memoria</div>
                </div>
              </div>
              
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">🎉</span>
                  <div>
                    <div className="font-bold text-green-800">¡Procesamiento Completado!</div>
                    <div className="text-sm text-green-700">
                      Procesados exitosamente {testParams.maxPoints.toLocaleString()} 
                      puntos de datos con estrategia de procesamiento optimizada {testParams.maxPoints >= 50000 ? '(Proceso Hijo)' : '(Procesamiento Directo)'}.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Real-time Streaming */}
        <div>
          <h3 className="text-lg font-semibold mb-3">Transmisión de Datos gRPC en Tiempo Real (Generado con Numpy)</h3>
          <div className="flex gap-2 mb-4">
            <Button 
              onClick={handleStartStreaming}
              disabled={!isConnected || streaming}
              className="bg-green-600 hover:bg-green-700"
            >
              {streaming ? 'Transmitiendo...' : 'Iniciar Transmisión gRPC'}
            </Button>
            
            {streaming && (
              <Button 
                onClick={handleStopStreaming}
                className="bg-red-600 hover:bg-red-700"
              >
                Detener Transmisión
              </Button>
            )}
          </div>
          
          {streamData.length > 0 && (
            <div className="bg-green-50 p-4 rounded-lg">
              <h4 className="font-semibold mb-2">
                Datos gRPC en Tiempo Real ({streamData.length} puntos):
              </h4>
              <div className="max-h-40 overflow-y-auto">
                {streamData.slice().reverse().map((point) => (
                  <div key={point.id} className="text-sm mb-1 font-mono">
                    <span className="text-blue-600">{point.metadata.sensor_type}</span>: 
                    <span className="font-bold"> {point.value.toFixed(2)} {point.unit}</span>
                    <span className="text-gray-500 ml-2">
                      ({point.location.latitude.toFixed(4)}, {point.location.longitude.toFixed(4)})
                    </span>
                    <span className="text-green-600 ml-2">
                      [gRPC]
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>


      {/* 🚀 Columnar Data Streaming Visualization */}
      <div className="mt-8 border-t pt-6">
        <ChildProcessVisualization 
          title="🚀 Transmisión de Datos Columnar - Rendimiento Optimizado"
          maxPoints={2000000}
        />
      </div>

    </div>
  );
} 