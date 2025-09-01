import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as echarts from 'echarts';
import { Button } from './ui/button';
import { toast } from 'sonner';

// Type definitions
type EChartsParams = {
  data: [number, number, number] | Record<string, unknown>;
};

type GetColumnarDataResponse = {
  data: number[];
  total_count: number;
  bounds: { [key: string]: { min_value: number; max_value: number } };
};

interface VisualizationProps {
  title?: string;
  autoResize?: boolean;
}

export function VisualizacionDatos({ 
  title = "Geospatial Data Visualization", 
  autoResize = true 
}: VisualizationProps) {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [totalPoints, setTotalPoints] = useState(0);
  const [currentBounds, setCurrentBounds] = useState<{x: [number, number], y: [number, number], z: [number, number]} | null>(null);

  // Initialize chart
  useEffect(() => {
    if (!chartRef.current) return;

    const chart = echarts.init(chartRef.current, undefined, {
      renderer: 'canvas',
      useDirtyRect: true,
    });

    chartInstanceRef.current = chart;

    // Set initial empty chart
    chart.setOption({
      title: {
        text: title,
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'item',
        formatter: function(params: EChartsParams) {
          if (Array.isArray(params.data)) {
            const [lng, lat, value] = params.data;
            return `
              <strong>Point Data</strong><br/>
              Longitude: ${lng.toFixed(6)}<br/>
              Latitude: ${lat.toFixed(6)}<br/>
              Value: ${value.toFixed(2)}
            `;
          }
          return 'Loading...';
        }
      },
      grid: {
        left: '3%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'value',
        name: 'Longitude',
        nameLocation: 'middle',
        nameGap: 30
      },
      yAxis: {
        type: 'value',
        name: 'Latitude',
        nameLocation: 'middle',
        nameGap: 30
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none'
        },
        {
          type: 'inside', 
          yAxisIndex: 0,
          filterMode: 'none'
        },
        {
          type: 'slider',
          show: true,
          xAxisIndex: 0,
          bottom: '10%'
        },
        {
          type: 'slider',
          show: true,
          yAxisIndex: 0,
          right: '10px',
          width: '20px'
        }
      ],
      toolbox: {
        feature: {
          dataZoom: {
            yAxisIndex: 'none'
          },
          restore: {}
        }
      },
      series: [{
        type: 'scatter',
        data: [],
        symbolSize: 3,
        itemStyle: {
          opacity: 0.8,
          borderWidth: 0
        },
        emphasis: {
          itemStyle: {
            borderColor: '#fff',
            borderWidth: 2
          }
        }
      }],
      animation: false
    });

    // Handle resize
    const handleResize = () => {
      if (autoResize && chart && !chart.isDisposed()) {
        chart.resize();
      }
    };

    if (autoResize) {
      window.addEventListener('resize', handleResize);
    }

    return () => {
      if (autoResize) {
        window.removeEventListener('resize', handleResize);
      }
      if (chart && !chart.isDisposed()) {
        chart.dispose();
      }
      chartInstanceRef.current = null;
    };
  }, [title, autoResize]);

  // Update chart with new data
  const updateChart = useCallback((flatData: number[], bounds: {x: [number, number], y: [number, number], z: [number, number]}, pointCount: number) => {
    const chart = chartInstanceRef.current;
    if (!chart || chart.isDisposed() || !flatData.length) return;

    // Convert flat array [x1,y1,z1,x2,y2,z2,...] to tuples for ECharts
    const tupleData: Array<[number, number, number]> = [];
    for (let i = 0; i < flatData.length; i += 3) {
      tupleData.push([flatData[i], flatData[i+1], flatData[i+2]]);
    }

    chart.setOption({
      title: {
        text: `${title} (${pointCount.toLocaleString()} points)`
      },
      visualMap: {
        min: bounds.z[0],
        max: bounds.z[1],
        dimension: 2, // Use the third dimension (Z value) for color mapping
        orient: 'vertical',
        right: 10,
        top: 'center',
        text: ['HIGH', 'LOW'],
        calculable: true,
        inRange: {
          color: ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#fef3c7', '#fcd34d', '#f59e0b', '#d97706', '#b45309']
        },
        textStyle: {
          color: '#374151'
        }
      },
      xAxis: {
        min: bounds.x[0],
        max: bounds.x[1]
      },
      yAxis: {
        min: bounds.y[0],
        max: bounds.y[1]
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none'
        },
        {
          type: 'inside', 
          yAxisIndex: 0,
          filterMode: 'none'
        },
        {
          type: 'slider',
          show: true,
          xAxisIndex: 0,
          bottom: '10%'
        },
        {
          type: 'slider',
          show: true,
          yAxisIndex: 0,
          right: '10px',
          width: '20px'
        }
      ],
      toolbox: {
        feature: {
          dataZoom: {
            yAxisIndex: 'none'
          },
          restore: {}
        }
      },
      series: [{
        type: 'scatter',
        data: tupleData,
        symbolSize: pointCount > 50000 ? 2 : 3,
        itemStyle: {
          opacity: 0.8,
          borderWidth: 0
        },
        large: true,
        largeThreshold: 10000,
        blendMode: 'screen',
        progressive: 100000,
        progressiveThreshold: 20000,
        progressiveChunkMode: 'sequential'
      }]
    });

    toast.success('Chart Updated!', {
      description: `Visualizing ${pointCount.toLocaleString()} points`
    });
  }, [title]);

  

  // Test with flat array format
  const testColumnarData = useCallback(async (testMaxPoints: number) => {
    setIsLoading(true);

    try {
      const result = await window.autoGrpc.getColumnarData({
        max_points: testMaxPoints
      }) as GetColumnarDataResponse;

      // Extract bounds from gRPC response
      const bounds = {
        x: [result.bounds['x']?.min_value ?? 0, result.bounds['x']?.max_value ?? 0] as [number, number],
        y: [result.bounds['y']?.min_value ?? 0, result.bounds['y']?.max_value ?? 0] as [number, number],
        z: [result.bounds['z']?.min_value ?? 0, result.bounds['z']?.max_value ?? 0] as [number, number]
      };

      setTotalPoints(result.total_count);
      setCurrentBounds(bounds);
      updateChart(result.data, bounds, result.total_count);

      toast.success('Chart Updated!', {
        description: `${result.total_count.toLocaleString()} points loaded`
      });

    } catch (error) {
      toast.error('Failed to load data', {
        description: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      setIsLoading(false);
    }
  }, [updateChart]);



  // Test sizes for child process
  const testSizes = [1000, 5000, 10000, 25000, 50000, 100000,500000];

  return (
    <div className="w-full space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap gap-3 items-center justify-between p-4 bg-gradient-to-r from-green-50 to-blue-50 rounded-lg border">
        <div>
          <h3 className="text-lg font-semibold text-gray-800">Visualización datos backend</h3>
        </div>
        
        <div className="flex flex-wrap gap-2">
          {testSizes.map(size => (
            <Button
              key={`columnar-${size}`}
              onClick={() => testColumnarData(size)}
              disabled={isLoading}
              size="sm"
              variant="default"
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              {size.toLocaleString()}
            </Button>
          ))}
        </div>
      </div>



      {/* Chart */}
      <div className="relative">
        <div 
          ref={chartRef}
          className="w-full bg-white rounded-lg border shadow-sm"
          style={{ height: '500px' }}
        />
      </div>

   
    </div>
  );
}