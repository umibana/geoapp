/**
 * Custom Plotly Chart Component using Plotly.js directly
 *
 * This component uses Plotly.js directly (not react-plotly.js) for better
 * control over rendering in Electron, especially for WebGL support.
 */

import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import Plotly from 'plotly.js-dist';

// Re-export Plotly for direct access
export { Plotly };

/**
 * Props for the Plot component
 */
export interface PlotProps {
  data: Plotly.Data[];
  layout?: Partial<Plotly.Layout>;
  config?: Partial<Plotly.Config>;
  style?: React.CSSProperties;
  className?: string;
  onSelected?: (event: Plotly.PlotSelectionEvent) => void;
  onSelecting?: (event: Plotly.PlotSelectionEvent) => void;
  onClick?: (event: Plotly.PlotMouseEvent) => void;
  onHover?: (event: Plotly.PlotHoverEvent) => void;
  onUnhover?: (event: Plotly.PlotMouseEvent) => void;
  onRelayout?: (event: Plotly.PlotRelayoutEvent) => void;
  useResizeHandler?: boolean;
  revision?: number;
}

/**
 * Plot component using Plotly.js directly
 */
export const Plot: React.FC<PlotProps> = ({
  data,
  layout = {},
  config = {},
  style,
  className,
  onSelected,
  onSelecting,
  onClick,
  onHover,
  onUnhover,
  onRelayout,
  useResizeHandler = true,
  revision
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const plotCreated = useRef(false);
  const lastTraceTypes = useRef<string>('');

  // Create/update the plot
  const updatePlot = useCallback(async () => {
    if (!containerRef.current) return;

    const finalLayout: Partial<Plotly.Layout> = {
      ...layout,
      autosize: true
    };

    const finalConfig: Partial<Plotly.Config> = {
      responsive: useResizeHandler,
      displaylogo: false,
      ...config
    };

    // Debug: Log trace types being rendered
    const traceTypes = data.map(d => d.type).join(', ');
    console.log(`[Plotly Debug] Rendering traces: ${traceTypes}`);
    console.log(`[Plotly Debug] Data points per trace:`, data.map(d => (d as any).x?.length || 0));

    // Check if trace types changed (e.g., scatter -> scattergl)
    // This requires a full recreation of the plot
    const traceTypesChanged = lastTraceTypes.current !== '' && lastTraceTypes.current !== traceTypes;
    if (traceTypesChanged) {
      console.log(`[Plotly Debug] Trace types changed from "${lastTraceTypes.current}" to "${traceTypes}" - forcing recreation`);
      // Purge existing plot to force recreation
      if (plotCreated.current) {
        Plotly.purge(containerRef.current);
        plotCreated.current = false;
      }
    }
    lastTraceTypes.current = traceTypes;

    try {
      if (!plotCreated.current) {
        // Create new plot
        console.log('[Plotly Debug] Creating new plot...');
        await Plotly.newPlot(containerRef.current, data, finalLayout, finalConfig);
        console.log('[Plotly Debug] Plot created successfully');
        plotCreated.current = true;

        // Attach event handlers
        if (onSelected) {
          containerRef.current.on('plotly_selected', onSelected);
        }
        if (onSelecting) {
          containerRef.current.on('plotly_selecting', onSelecting);
        }
        if (onClick) {
          containerRef.current.on('plotly_click', onClick);
        }
        if (onHover) {
          containerRef.current.on('plotly_hover', onHover);
        }
        if (onUnhover) {
          containerRef.current.on('plotly_unhover', onUnhover);
        }
        if (onRelayout) {
          containerRef.current.on('plotly_relayout', onRelayout);
        }
      } else {
        // Update existing plot - use react for efficient updates
        await Plotly.react(containerRef.current, data, finalLayout, finalConfig);
      }
    } catch (error) {
      console.error('[Plotly Debug] ERROR during plot creation/update:', error);
      // Log more details about the error
      if (error instanceof Error) {
        console.error('[Plotly Debug] Error message:', error.message);
        console.error('[Plotly Debug] Error stack:', error.stack);
      }
    }
  }, [data, layout, config, useResizeHandler, onSelected, onSelecting, onClick, onHover, onUnhover, onRelayout]);

  // Initial render and updates
  useEffect(() => {
    updatePlot();
  }, [updatePlot, revision]);

  // Handle resize
  useEffect(() => {
    if (!useResizeHandler || !containerRef.current) return;

    const resizeObserver = new ResizeObserver(() => {
      if (containerRef.current && plotCreated.current) {
        Plotly.Plots.resize(containerRef.current);
      }
    });

    resizeObserver.observe(containerRef.current);

    return () => {
      resizeObserver.disconnect();
    };
  }, [useResizeHandler]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (containerRef.current && plotCreated.current) {
        Plotly.purge(containerRef.current);
        plotCreated.current = false;
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      style={style}
      className={className}
    />
  );
};

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

  // Generate indices using systematic sampling with jitter
  const step = totalPoints / maxPoints;
  const indices: number[] = [];
  const usedIndices = new Set<number>();

  for (let i = 0; i < maxPoints; i++) {
    const baseIdx = Math.floor(i * step);
    const jitter = Math.floor(Math.random() * Math.min(step, totalPoints - baseIdx));
    let idx = Math.min(baseIdx + jitter, totalPoints - 1);

    // Avoid duplicates
    while (usedIndices.has(idx) && idx < totalPoints - 1) {
      idx++;
    }
    if (!usedIndices.has(idx)) {
      indices.push(idx);
      usedIndices.add(idx);
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
 * Hook to detect WebGL support
 */
export function useWebGLSupport(): { supported: boolean; checked: boolean; details: string } {
  const [state, setState] = useState({ supported: false, checked: false, details: '' });

  useEffect(() => {
    const checkWebGL = () => {
      const debugInfo: string[] = [];

      try {
        const canvas = document.createElement('canvas');
        debugInfo.push(`Canvas created: ${!!canvas}`);

        // Try WebGL 2 first
        let gl = canvas.getContext('webgl2');
        if (gl) {
          debugInfo.push('WebGL2 context obtained');
        } else {
          // Try WebGL 1
          gl = canvas.getContext('webgl') as WebGLRenderingContext | null;
          if (gl) {
            debugInfo.push('WebGL1 context obtained');
          } else {
            // Try experimental
            gl = canvas.getContext('experimental-webgl') as WebGLRenderingContext | null;
            if (gl) {
              debugInfo.push('Experimental WebGL context obtained');
            }
          }
        }

        if (gl) {
          const glContext = gl as WebGLRenderingContext;

          // Get renderer info
          const debugRendererInfo = glContext.getExtension('WEBGL_debug_renderer_info');
          if (debugRendererInfo) {
            const vendor = glContext.getParameter(debugRendererInfo.UNMASKED_VENDOR_WEBGL);
            const renderer = glContext.getParameter(debugRendererInfo.UNMASKED_RENDERER_WEBGL);
            debugInfo.push(`Vendor: ${vendor}`);
            debugInfo.push(`Renderer: ${renderer}`);
          }

          // Check if getParameter works
          const hasGetParameter = typeof glContext.getParameter === 'function';
          debugInfo.push(`getParameter available: ${hasGetParameter}`);

          // Get max texture size as additional check
          const maxTextureSize = glContext.getParameter(glContext.MAX_TEXTURE_SIZE);
          debugInfo.push(`Max texture size: ${maxTextureSize}`);

          console.log('[WebGL Debug] SUCCESS:', debugInfo.join(' | '));
          setState({ supported: true, checked: true, details: debugInfo.join(' | ') });
        } else {
          debugInfo.push('No WebGL context available');
          console.log('[WebGL Debug] FAILED:', debugInfo.join(' | '));
          setState({ supported: false, checked: true, details: debugInfo.join(' | ') });
        }
      } catch (error) {
        debugInfo.push(`Error: ${error}`);
        console.error('[WebGL Debug] ERROR:', debugInfo.join(' | '), error);
        setState({ supported: false, checked: true, details: debugInfo.join(' | ') });
      }
    };

    // Small delay to ensure DOM is ready
    const timer = setTimeout(checkWebGL, 100);
    return () => clearTimeout(timer);
  }, []);

  return state;
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

export default Plot;
