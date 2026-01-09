/**
 * Custom Plotly Chart Component for Electron
 *
 * This component fixes the WebGL detection issue in Electron by using
 * the pre-built Plotly distribution instead of the main entry point.
 *
 * It also provides optimizations for large datasets when WebGL is not available:
 * - Point decimation (sampling)
 * - Smaller markers
 * - Reduced opacity
 * - SVG optimization settings
 */

import React, { useMemo, useCallback, useState, useEffect } from 'react';
import createPlotlyComponent from 'react-plotly.js/factory';
// Use pre-built distribution for proper WebGL support in Electron
// @ts-ignore - Plotly dist doesn't have proper types
import Plotly from 'plotly.js/dist/plotly';

// Create the Plot component using the pre-built Plotly distribution
const Plot = createPlotlyComponent(Plotly);

// Re-export for convenience
export { Plot, Plotly };

/**
 * Optimization settings for large datasets
 */
export interface ScatterOptimizationOptions {
  /** Enable point decimation (random sampling) */
  enableDecimation?: boolean;
  /** Maximum number of points to display (for decimation) */
  maxDisplayPoints?: number;
  /** Marker size for optimized rendering */
  markerSize?: number;
  /** Marker opacity for optimized rendering */
  markerOpacity?: number;
  /** Force SVG rendering (disable WebGL) */
  forceSVG?: boolean;
}

const DEFAULT_OPTIMIZATION: ScatterOptimizationOptions = {
  enableDecimation: true,
  maxDisplayPoints: 10000,
  markerSize: 3,
  markerOpacity: 0.6,
  forceSVG: false,
};

/**
 * Decimate (downsample) data arrays by random sampling
 * Preserves the statistical distribution while reducing point count
 */
export function decimateData<T>(
  data: T[],
  maxPoints: number,
  seed?: number
): { data: T[]; indices: number[] } {
  if (data.length <= maxPoints) {
    return { data, indices: Array.from({ length: data.length }, (_, i) => i) };
  }

  // Seeded random for reproducibility
  const random = seed !== undefined
    ? (() => {
        let s = seed;
        return () => {
          s = (s * 1103515245 + 12345) & 0x7fffffff;
          return s / 0x7fffffff;
        };
      })()
    : Math.random;

  // Reservoir sampling for uniform random selection
  const indices: number[] = [];
  const result: T[] = [];

  for (let i = 0; i < maxPoints; i++) {
    indices.push(i);
    result.push(data[i]);
  }

  for (let i = maxPoints; i < data.length; i++) {
    const j = Math.floor(random() * (i + 1));
    if (j < maxPoints) {
      indices[j] = i;
      result[j] = data[i];
    }
  }

  return { data: result, indices };
}

/**
 * Decimate Float32Array data in [x, y, v, x, y, v, ...] format
 */
export function decimateFloat32Data(
  data: Float32Array,
  maxPoints: number,
  stride: number = 3
): { data: Float32Array; originalIndices: number[] } {
  const totalPoints = Math.floor(data.length / stride);

  if (totalPoints <= maxPoints) {
    return {
      data,
      originalIndices: Array.from({ length: totalPoints }, (_, i) => i)
    };
  }

  // Generate random indices to keep
  const step = totalPoints / maxPoints;
  const indices: number[] = [];

  // Systematic sampling with jitter for better distribution
  for (let i = 0; i < maxPoints; i++) {
    const baseIdx = Math.floor(i * step);
    const jitter = Math.floor(Math.random() * Math.min(step, totalPoints - baseIdx));
    const idx = Math.min(baseIdx + jitter, totalPoints - 1);
    if (!indices.includes(idx)) {
      indices.push(idx);
    }
  }

  // Fill any missing slots
  while (indices.length < maxPoints) {
    const idx = Math.floor(Math.random() * totalPoints);
    if (!indices.includes(idx)) {
      indices.push(idx);
    }
  }

  // Create decimated array
  const result = new Float32Array(indices.length * stride);
  for (let i = 0; i < indices.length; i++) {
    const srcOffset = indices[i] * stride;
    const dstOffset = i * stride;
    for (let j = 0; j < stride; j++) {
      result[dstOffset + j] = data[srcOffset + j];
    }
  }

  return { data: result, originalIndices: indices };
}

/**
 * Parse Float32Array into separate x, y, value arrays with optional decimation
 */
export function parseFloat32ToArrays(
  data: Float32Array,
  options?: ScatterOptimizationOptions
): { x: number[]; y: number[]; values: number[]; decimated: boolean; originalCount: number } {
  const opts = { ...DEFAULT_OPTIMIZATION, ...options };
  const totalPoints = Math.floor(data.length / 3);
  let sourceData = data;
  let decimated = false;

  // Apply decimation if enabled and data is large
  if (opts.enableDecimation && opts.maxDisplayPoints && totalPoints > opts.maxDisplayPoints) {
    const result = decimateFloat32Data(data, opts.maxDisplayPoints);
    sourceData = result.data;
    decimated = true;
  }

  const pointCount = Math.floor(sourceData.length / 3);
  const x: number[] = new Array(pointCount);
  const y: number[] = new Array(pointCount);
  const values: number[] = new Array(pointCount);

  for (let i = 0; i < pointCount; i++) {
    x[i] = sourceData[i * 3];
    y[i] = sourceData[i * 3 + 1];
    values[i] = sourceData[i * 3 + 2];
  }

  return { x, y, values, decimated, originalCount: totalPoints };
}

/**
 * Get optimized scatter trace configuration
 */
export function getOptimizedScatterTrace(
  x: number[],
  y: number[],
  values: number[],
  options?: ScatterOptimizationOptions & {
    colorscale?: Plotly.ColorScale;
    cmin?: number;
    cmax?: number;
    name?: string;
    hovertemplate?: string;
    showColorbar?: boolean;
    colorbarTitle?: string;
  }
): Plotly.Data {
  const opts = { ...DEFAULT_OPTIMIZATION, ...options };
  const pointCount = x.length;

  // Adjust marker size based on point count
  let markerSize = opts.markerSize || 3;
  if (pointCount > 50000) markerSize = 1;
  else if (pointCount > 20000) markerSize = 2;
  else if (pointCount > 5000) markerSize = 3;
  else if (pointCount > 1000) markerSize = 4;

  // Adjust opacity based on point count
  let opacity = opts.markerOpacity || 0.6;
  if (pointCount > 50000) opacity = 0.3;
  else if (pointCount > 20000) opacity = 0.4;
  else if (pointCount > 5000) opacity = 0.5;

  return {
    type: opts.forceSVG ? 'scatter' : 'scattergl',
    mode: 'markers',
    x,
    y,
    marker: {
      color: values,
      colorscale: options?.colorscale || [
        [0, '#1e3a8a'],
        [0.1, '#1e40af'],
        [0.2, '#3b82f6'],
        [0.3, '#60a5fa'],
        [0.4, '#fbbf24'],
        [0.5, '#f59e0b'],
        [0.6, '#ea580c'],
        [0.7, '#dc2626'],
        [0.8, '#b91c1c'],
        [1, '#7f1d1d']
      ],
      cmin: options?.cmin,
      cmax: options?.cmax,
      size: markerSize,
      opacity: opacity,
      ...(options?.showColorbar !== false && {
        colorbar: {
          title: {
            text: options?.colorbarTitle || 'Value',
            side: 'right' as const
          },
          thickness: 15,
          len: 0.8
        }
      })
    },
    hovertemplate: options?.hovertemplate,
    name: options?.name || 'data'
  } as Plotly.Data;
}

/**
 * Hook to detect WebGL support
 */
export function useWebGLSupport(): { supported: boolean; checked: boolean } {
  const [state, setState] = useState({ supported: false, checked: false });

  useEffect(() => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
      setState({ supported: !!gl, checked: true });
    } catch {
      setState({ supported: false, checked: true });
    }
  }, []);

  return state;
}

/**
 * Optimized Plot wrapper component
 */
interface OptimizedPlotProps extends React.ComponentProps<typeof Plot> {
  /** Optimization options for scatter plots */
  optimizationOptions?: ScatterOptimizationOptions;
  /** Callback when data is decimated */
  onDecimation?: (info: { originalCount: number; displayedCount: number }) => void;
}

export const OptimizedPlot: React.FC<OptimizedPlotProps> = ({
  data,
  layout,
  config,
  optimizationOptions,
  onDecimation,
  ...props
}) => {
  const webgl = useWebGLSupport();

  // Apply SVG fallback if WebGL not supported and not already forcing SVG
  const processedData = useMemo(() => {
    if (!data) return data;

    return data.map(trace => {
      // If WebGL is not supported or force SVG is set, convert scattergl to scatter
      if ((webgl.checked && !webgl.supported) || optimizationOptions?.forceSVG) {
        if (trace.type === 'scattergl') {
          return { ...trace, type: 'scatter' as const };
        }
      }
      return trace;
    });
  }, [data, webgl.checked, webgl.supported, optimizationOptions?.forceSVG]);

  return (
    <Plot
      data={processedData}
      layout={layout}
      config={config}
      {...props}
    />
  );
};

export default Plot;
