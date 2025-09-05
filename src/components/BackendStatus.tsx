import React, { useState, useEffect } from 'react';
import { Button } from './ui/button';

interface BackendStatusProps {
  className?: string;
}

interface HealthStatus {
  healthy: boolean;
  version: string;
  status: Record<string, string>;
  timestamp?: number;
  error?: string;
}

export function BackendStatus({ className = '' }: BackendStatusProps) {
  const [backendUrl, setBackendUrl] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const checkBackendStatus = async () => {
    try {
      const url = await window.electronBackend.getBackendUrl();
      setBackendUrl(url);
      
      // Use gRPC health check via auto-generated API
      const healthData = await window.autoGrpc.healthCheck({});
      
      setHealthStatus({
        ...healthData,
        timestamp: Date.now()
      });
      
      console.log('gRPC health status:', healthData);
    } catch (error) {
      console.error('Failed to check gRPC status:', error);
      setBackendUrl(null);
      setHealthStatus({
        healthy: false,
        version: '1.0.0',
        status: { error: 'gRPC connection failed' },
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : 'Connection failed'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestartBackend = async () => {
    try {
      setLoading(true);
      const result = await window.electronBackend.restartBackend();
      console.log('gRPC backend restarted:', result);
      // Wait a moment for the backend to start
      await new Promise(resolve => setTimeout(resolve, 3000));
      await checkBackendStatus();
    } catch (error) {
      console.error('Failed to restart gRPC backend:', error);
    } finally {
      setLoading(false);
    }
  };

  const testGrpcAPI = async () => {
    try {
      // Test gRPC HelloWorld call using auto-generated API
      const result = await window.autoGrpc.helloWorld({
        message: 'Test from frontend'
      });
      
      console.log('gRPC API response:', result);
      alert(`gRPC API Test (HelloWorld):\nMessage: ${result.message}`);
    } catch (error) {
      console.error('Failed to test gRPC API:', error);
      alert('Failed to connect to gRPC API');
    }
  };

  useEffect(() => {
    checkBackendStatus();
    
    // Check status every 30 seconds
    const interval = setInterval(checkBackendStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className={`p-4 border rounded-lg ${className}`}>
        <div className="flex items-center">
          <div className="animate-spin h-4 w-4 border-2 border-blue-500 border-t-transparent rounded-full"></div>
          <span className="ml-2">Checking gRPC backend status...</span>
        </div>
      </div>
    );
  }

  const isHealthy = healthStatus?.healthy === true;

  return (
    <div className={`p-4 border rounded-lg ${className} ${isHealthy ? 'border-green-200 bg-green-50' : 'border-red-200 bg-red-50'}`}>
      <h3 className="font-semibold mb-3 flex items-center">
        <div 
          className={`w-3 h-3 rounded-full mr-2 ${
            isHealthy ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        gRPC Backend Status: {isHealthy ? 'Healthy' : 'Unhealthy'}
      </h3>
      
      <div className="space-y-3">
        {/* Basic Info */}
        {backendUrl && (
          <div className="text-sm">
            <strong>Server:</strong> {backendUrl}
          </div>
        )}
        
        {healthStatus && (
          <>
            {/* Version */}
            <div className="text-sm">
              <strong>Version:</strong> {healthStatus.version}
            </div>

            {/* gRPC Status */}
            <div className="text-sm">
              <strong>gRPC Service:</strong> 
              <span className={`ml-1 px-1 py-0.5 text-xs rounded ${
                isHealthy ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {isHealthy ? 'running' : 'stopped'}
              </span>
              <span className="ml-1 text-gray-600">:50077</span>
            </div>

            {/* Services Status */}
            <div className="text-sm">
              <strong>Services:</strong>
              <div className="ml-2 mt-1 space-y-1">
                <div className="flex items-center">
                  <span className={`w-2 h-2 rounded-full mr-2 ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  Geospatial Service
                </div>
                <div className="flex items-center">
                  <span className={`w-2 h-2 rounded-full mr-2 ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  Data Streaming
                </div>
                <div className="flex items-center">
                  <span className={`w-2 h-2 rounded-full mr-2 ${isHealthy ? 'bg-green-500' : 'bg-red-500'}`}></span>
                  Health Monitoring
                </div>
              </div>
            </div>

            {/* Status Details */}
            {healthStatus.status && Object.keys(healthStatus.status).length > 0 && (
              <div className="text-sm">
                <strong>Status Details:</strong>
                <div className="ml-2 mt-1 text-xs">
                  {Object.entries(healthStatus.status).map(([key, value]) => (
                    <div key={key} className="flex">
                      <span className="w-20 text-gray-600">{key}:</span>
                      <span>{value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Error Info */}
            {healthStatus.error && (
              <div className="text-sm text-red-600 bg-red-100 p-2 rounded">
                <strong>Error:</strong> {healthStatus.error}
              </div>
            )}

            {/* Timestamp */}
            {healthStatus.timestamp && (
              <div className="text-xs text-gray-500">
                Last checked: {new Date(healthStatus.timestamp).toLocaleTimeString()}
              </div>
            )}
          </>
        )}
        
        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button 
            size="sm" 
            onClick={checkBackendStatus}
            variant="outline"
            disabled={loading}
          >
            Refresh
          </Button>
          
          <Button 
            size="sm" 
            onClick={handleRestartBackend}
            variant="outline"
            disabled={loading}
          >
            Restart
          </Button>
          
          {isHealthy && (
            <Button 
              size="sm" 
              onClick={testGrpcAPI}
              variant="outline"
              disabled={loading}
            >
              Probar gRPC
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}