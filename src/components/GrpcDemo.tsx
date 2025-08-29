import React, { useEffect, useState } from 'react';
import { Button } from './ui/button';
import { toast } from 'sonner';
import { ChildProcessVisualization } from './VisualizacionChunks';

/**
 * Componente de demostración de gRPC
 * Muestra las capacidades del backend gRPC con ejemplos interactivos
 * Incluye carga de datos, streaming, procesamiento optimizado y visualizaciones
 */
export function GrpcDemo() {
  const [isConnected, setIsConnected] = useState(false);

  const [loading, setLoading] = useState(false);
  // Simple gRPC examples state
  const [helloWorldInput, setHelloWorldInput] = useState('');
  const [echoParamInput, setEchoParamInput] = useState('');

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
    } catch (error) {
      setIsConnected(false);
    } finally {
      setLoading(false);
    }
  };
 
  return (
    <div className="p-6 max-w-4xl mx-auto">
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