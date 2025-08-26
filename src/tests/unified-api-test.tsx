// Test component to verify the Unified Worker Thread API implementation
import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';

export const UnifiedApiTest: React.FC = () => {
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeOperations, setActiveOperations] = useState<string[]>([]);

  // Test 1: Simple method without worker threads
  const testSimpleMethod = async () => {
    setIsLoading(true);
    setResults([]);
    
    try {
      console.log('🧪 Testing simple method without worker threads...');
      
      const result = await window.autoGrpc.helloWorld({
        message: "Testing unified API"
      });
      
      console.log('✅ Simple method result:', result);
      setResults(prev => [...prev, {
        test: 'Simple Method',
        result: result,
        type: 'success'
      }]);
      
    } catch (error) {
      console.error('❌ Simple method failed:', error);
      setResults(prev => [...prev, {
        test: 'Simple Method',
        result: error.message,
        type: 'error'
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  // Test 2: Method with worker threads enabled
  const testWorkerThreadMethod = async () => {
    setIsLoading(true);
    setResults([]);
    setProgress(0);
    
    try {
      console.log('🧪 Testing method with worker threads...');
      
      const result = await window.autoGrpc.getBatchDataColumnar({
        bounds: {
          northeast: { latitude: 37.8, longitude: -122.3 },
          southwest: { latitude: 37.7, longitude: -122.5 }
        },
        data_types: ['elevation'],
        max_points: 150000, // Trigger worker thread threshold
        resolution: 25
      }, {
        useWorkerThread: true,
        onProgress: (progress) => {
          console.log(`📊 Progress: ${progress.percentage.toFixed(1)}% - ${progress.phase}`);
          setProgress(progress.percentage);
        }
      });
      
      console.log('✅ Worker thread method result:', result);
      setResults(prev => [...prev, {
        test: 'Worker Thread Method',
        result: result,
        type: 'success'
      }]);
      
    } catch (error) {
      console.error('❌ Worker thread method failed:', error);
      setResults(prev => [...prev, {
        test: 'Worker Thread Method',
        result: error.message,
        type: 'error'
      }]);
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  // Test 3: Streaming method with worker threads
  const testStreamingWorkerMethod = async () => {
    setIsLoading(true);
    setResults([]);
    setProgress(0);
    let chunkCount = 0;
    
    try {
      console.log('🧪 Testing streaming method with worker threads...');
      
      const result = await window.autoGrpc.getBatchDataColumnarStreamed({
        bounds: {
          northeast: { latitude: 37.8, longitude: -122.3 },
          southwest: { latitude: 37.7, longitude: -122.5 }
        },
        data_types: ['elevation', 'temperature'],
        max_points: 200000, // Trigger worker thread threshold
        resolution: 30
      }, {
        useWorkerThread: true,
        onProgress: (progress) => {
          console.log(`📊 Streaming Progress: ${progress.percentage.toFixed(1)}% - ${progress.phase}`);
          setProgress(progress.percentage);
        },
        onData: (chunk) => {
          chunkCount++;
          console.log(`📦 Received chunk ${chunkCount}:`, chunk);
        }
      });
      
      console.log('✅ Streaming worker thread method result:', result);
      setResults(prev => [...prev, {
        test: 'Streaming Worker Thread',
        result: { chunks: result, totalChunks: chunkCount },
        type: 'success'
      }]);
      
    } catch (error) {
      console.error('❌ Streaming worker thread method failed:', error);
      setResults(prev => [...prev, {
        test: 'Streaming Worker Thread',
        result: error.message,
        type: 'error'
      }]);
    } finally {
      setIsLoading(false);
      setProgress(0);
    }
  };

  // Test 4: Method capabilities detection
  const testMethodCapabilities = async () => {
    try {
      console.log('🧪 Testing method capabilities detection...');
      
      const capabilities = window.autoGrpc.getMethodCapabilities(
        'GetBatchDataColumnar',
        'GetBatchDataRequest',
        'GetBatchDataColumnarResponse',
        false
      );
      
      console.log('✅ Method capabilities:', capabilities);
      setResults(prev => [...prev, {
        test: 'Method Capabilities',
        result: capabilities,
        type: 'success'
      }]);
      
    } catch (error) {
      console.error('❌ Method capabilities failed:', error);
      setResults(prev => [...prev, {
        test: 'Method Capabilities',
        result: error.message,
        type: 'error'
      }]);
    }
  };

  // Test 5: Active operations management
  const testActiveOperations = async () => {
    try {
      console.log('🧪 Testing active operations management...');
      
      const operations = window.autoGrpc.getActiveOperations();
      setActiveOperations(operations);
      
      console.log('✅ Active operations:', operations);
      setResults(prev => [...prev, {
        test: 'Active Operations',
        result: operations,
        type: 'success'
      }]);
      
    } catch (error) {
      console.error('❌ Active operations failed:', error);
      setResults(prev => [...prev, {
        test: 'Active Operations',
        result: error.message,
        type: 'error'
      }]);
    }
  };

  // Run all tests
  const runAllTests = async () => {
    setResults([]);
    await testSimpleMethod();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait between tests
    
    await testMethodCapabilities();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testActiveOperations();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    await testWorkerThreadMethod();
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await testStreamingWorkerMethod();
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="text-2xl font-bold text-center">
          🧪 Unified Worker Thread API Test Suite
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Test Controls */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          <Button 
            onClick={testSimpleMethod} 
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            Simple Method
          </Button>
          
          <Button 
            onClick={testWorkerThreadMethod} 
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            Worker Thread
          </Button>
          
          <Button 
            onClick={testStreamingWorkerMethod} 
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            Streaming + Worker
          </Button>
          
          <Button 
            onClick={testMethodCapabilities} 
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            Capabilities
          </Button>
          
          <Button 
            onClick={testActiveOperations} 
            disabled={isLoading}
            variant="outline"
            size="sm"
          >
            Active Ops
          </Button>
          
          <Button 
            onClick={runAllTests} 
            disabled={isLoading}
            className="bg-blue-600 hover:bg-blue-700"
            size="sm"
          >
            Run All Tests
          </Button>
        </div>

        {/* Progress Bar */}
        {progress > 0 && (
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
            <p className="text-sm text-gray-600 mt-1">
              Progress: {progress.toFixed(1)}%
            </p>
          </div>
        )}

        {/* Active Operations */}
        {activeOperations.length > 0 && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded">
            <h4 className="font-semibold text-yellow-800">Active Operations:</h4>
            <ul className="list-disc list-inside text-yellow-700 text-sm">
              {activeOperations.map((op, index) => (
                <li key={index}>{op}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Loading State */}
        {isLoading && (
          <div className="text-center py-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-2 text-gray-600">Running test...</p>
          </div>
        )}

        {/* Test Results */}
        <div className="space-y-2 max-h-96 overflow-y-auto">
          <h3 className="font-semibold text-lg">Test Results:</h3>
          
          {results.map((result, index) => (
            <div 
              key={index}
              className={`p-3 rounded border ${
                result.type === 'success' 
                  ? 'bg-green-50 border-green-200' 
                  : 'bg-red-50 border-red-200'
              }`}
            >
              <div className="flex justify-between items-start">
                <h4 className={`font-semibold ${
                  result.type === 'success' ? 'text-green-800' : 'text-red-800'
                }`}>
                  {result.type === 'success' ? '✅' : '❌'} {result.test}
                </h4>
              </div>
              
              <pre className={`mt-2 text-xs overflow-x-auto p-2 rounded ${
                result.type === 'success' 
                  ? 'bg-green-100 text-green-800' 
                  : 'bg-red-100 text-red-800'
              }`}>
                {JSON.stringify(result.result, null, 2)}
              </pre>
            </div>
          ))}
        </div>

        {/* API Usage Examples */}
        <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded">
          <h3 className="font-semibold text-lg mb-2">💡 Unified API Usage Examples</h3>
          
          <div className="space-y-3 text-sm">
            <div>
              <strong>Simple usage (no worker threads):</strong>
              <pre className="bg-gray-100 p-2 rounded mt-1 text-xs">
{`const result = await window.autoGrpc.helloWorld({ message: "test" });`}
              </pre>
            </div>
            
            <div>
              <strong>With worker threads and progress:</strong>
              <pre className="bg-gray-100 p-2 rounded mt-1 text-xs">
{`const result = await window.autoGrpc.getBatchDataColumnar(request, {
  useWorkerThread: true,
  onProgress: (progress) => console.log(progress.percentage + '%')
});`}
              </pre>
            </div>
            
            <div>
              <strong>Streaming with chunks and progress:</strong>
              <pre className="bg-gray-100 p-2 rounded mt-1 text-xs">
{`const result = await window.autoGrpc.getBatchDataColumnarStreamed(request, {
  useWorkerThread: true,
  onProgress: (progress) => updateProgress(progress),
  onData: (chunk) => processChunk(chunk)
});`}
              </pre>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};