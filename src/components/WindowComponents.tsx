import React, { useRef, useCallback, useEffect } from "react";
import * as echarts from "echarts";
import { useQuery } from "@tanstack/react-query";
import { GrpcDemo } from "./GrpcDemo";

// Type para data de prueba observablehq
interface AthleteData {
  name: string;
  sex: string;
  sport: string;
  height: number | null;
  weight: number | null;
  [key: string]: string | number | null;
}

// Parse CSV function
function parseCSV(csvText: string) {
  const lines = csvText.trim().split('\n');
  const headers = lines[0].split(',');
  
  return lines.slice(1).map(line => {
    const values = line.split(',');
    const obj: any = {};
    headers.forEach((header, index) => {
      const value = values[index]?.trim();
      // Try to parse as number, otherwise keep as string
      obj[header.trim()] = isNaN(Number(value)) ? value : Number(value);
    });
    return obj;
  });
}

export function Prueba2D() {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.ECharts | null>(null);
  const resizeObserverRef = useRef<ResizeObserver | null>(null);
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isInitializedRef = useRef<boolean>(false);

  const { data: athletesData, isLoading, error } = useQuery({
    queryKey: ["athletes"],
    queryFn: async () => {
      const response = await fetch("https://observablehq.com/plot/data/athletes.csv");
      const csvText = await response.text();
      return parseCSV(csvText);
    },
  });

  // Stable resize handler - doesn't change between renders
  const handleResize = useCallback(() => {
    if (resizeTimeoutRef.current) {
      clearTimeout(resizeTimeoutRef.current);
    }
    
    resizeTimeoutRef.current = setTimeout(() => {
      if (chartInstanceRef.current && isInitializedRef.current) {
        chartInstanceRef.current.resize();
      }
    }, 100);
  }, []); // Empty dependency array - function never changes

  // Chart initialization and data rendering - only when data changes
  useEffect(() => {
    if (!chartRef.current || !athletesData) return;

    // Wait for the container to be properly sized
    const initChart = () => {
      if (!chartRef.current) return;
      
      // Check if container has proper dimensions
      const rect = chartRef.current.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        // Container not ready, try again shortly
        setTimeout(initChart, 50);
        return;
      }

      // Initialize chart only once
      if (!chartInstanceRef.current) {
        chartInstanceRef.current = echarts.init(chartRef.current);
      }

      const validData = athletesData.filter(d => d.height && d.weight);
      
      if (validData.length === 0) {
        console.error('No valid data found!');
        return;
      }

      const maleData = validData
        .filter(d => d.sex === 'male')
        .map(d => [d.weight, d.height, d.name, d.sport]);
      
      const femaleData = validData
        .filter(d => d.sex === 'female')
        .map(d => [d.weight, d.height, d.name, d.sport]);

      const option = {
        title: {
          text: `Athletes Height vs Weight (${validData.length} athletes)`,
          left: 'center',
          textStyle: {
            fontSize: 16,
            fontWeight: 'normal'
          }
        },
        tooltip: {
          trigger: 'item',
          formatter: (params: any) => {
            const [weight, height, name, sport] = params.data;
            return `
              <strong>${name}</strong><br/>
              Sport: ${sport}<br/>
              Weight: ${weight}kg<br/>
              Height: ${height}m
            `;
          }
        },
        legend: {
          data: ['Male', 'Female'],
          bottom: 10
        },
        xAxis: {
          type: 'value',
          name: 'Weight (kg)',
          nameLocation: 'middle',
          nameGap: 30,
          min: 40,
          max: 150
        },
        yAxis: {
          type: 'value',
          name: 'Height (m)',
          nameLocation: 'middle',
          nameGap: 40,
          min: 1.4,
          max: 2.2
        },
        series: [
          {
            name: 'Male',
            type: 'scatter',
            data: maleData,
            symbolSize: 6,
            itemStyle: {
              color: '#3b82f6'
            },
          },
          {
            name: 'Female',
            type: 'scatter',
            data: femaleData,
            symbolSize: 6,
            itemStyle: {
              color: '#ec4899'
            },
          }
        ],
        animation: true,
        animationDuration: 0,
        silent: false,
        // Enable progressive rendering for large datasets
        progressive: true,
        progressiveThreshold: 3000
      };

      chartInstanceRef.current.setOption(option, true);
      isInitializedRef.current = true;
    };

    // Small delay to ensure DOM is ready
    setTimeout(initChart, 100);
  }, [athletesData]); // Only re-run when data changes

  // Resize observers setup - only once
  useEffect(() => {
    if (!chartRef.current) return;

    // ResizeObserver for container size changes
    if (window.ResizeObserver) {
      resizeObserverRef.current = new ResizeObserver(handleResize);
      resizeObserverRef.current.observe(chartRef.current);
    }

    // Window resize fallback
    window.addEventListener('resize', handleResize);

    return () => {
      if (resizeObserverRef.current) {
        resizeObserverRef.current.disconnect();
      }
      window.removeEventListener('resize', handleResize);
      
      if (resizeTimeoutRef.current) {
        clearTimeout(resizeTimeoutRef.current);
      }
    };
  }, []); // Empty dependency - only run once

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
      isInitializedRef.current = false;
    };
  }, []);

  if (isLoading) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-sm text-muted-foreground">Loading athletes data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex items-center justify-center">
        <div className="text-sm text-red-500">Error loading data: {error.message}</div>
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div 
        ref={chartRef} 
        className="flex-1 w-full min-h-0"
        style={{ minHeight: '300px' }}
      />
    </div>
  );
}

export function Prueba3D() {
  return (
    <div className="p-4 text-center">
      <h2 className="text-xl font-bold mb-4">Prueba 3D Component</h2>
      <p>This is a 3D component placeholder.</p>
      <div className="mt-4 p-4 bg-blue-50 rounded">
        <p className="text-sm text-gray-600">
          3D visualization would go here
        </p>
      </div>
    </div>
  );
}

// Export the gRPC Demo component
export { GrpcDemo };

// Export the Brushed Data Viewer component
export { default as BrushedDataViewer } from './BrushedDataViewer';
