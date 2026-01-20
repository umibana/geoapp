import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import DeckGL from '@deck.gl/react';
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers';
import { OrthographicView, OrthographicViewState, PickingInfo } from '@deck.gl/core';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Activity, Brush, Database, X, Camera, TrendingUp, Split, Type, RotateCcw } from 'lucide-react';
import { GetDatasetDataResponse, DatasetInfo, DataBoundaries } from '@/generated/projects';
import { useBrushStore, BrushSelection } from '@/stores/brushStore';

/**
 * Props for the DatasetViewerDeckGL component
 */
interface DatasetViewerDeckGLProps {
  DatasetInfo?: DatasetInfo;
  onBack?: () => void;
}

/**
 * Color scale for value-based coloring
 * Maps a normalized value (0-1) to an RGBA color array
 */
const getColorForValue = (normalizedValue: number): [number, number, number, number] => {
  // Color gradient from blue (low) to red (high)
  const colors: [number, number, number][] = [
    [30, 58, 138],    // #1e3a8a - dark blue
    [30, 64, 175],    // #1e40af
    [59, 130, 246],   // #3b82f6
    [96, 165, 250],   // #60a5fa
    [251, 191, 36],   // #fbbf24 - yellow
    [245, 158, 11],   // #f59e0b
    [234, 88, 12],    // #ea580c
    [220, 38, 38],    // #dc2626 - red
    [185, 28, 28],    // #b91c1c
    [127, 29, 29],    // #7f1d1d - dark red
  ];

  const index = Math.min(Math.floor(normalizedValue * (colors.length - 1)), colors.length - 2);
  const t = (normalizedValue * (colors.length - 1)) - index;

  const c1 = colors[index];
  const c2 = colors[index + 1];

  return [
    Math.round(c1[0] + (c2[0] - c1[0]) * t),
    Math.round(c1[1] + (c2[1] - c1[1]) * t),
    Math.round(c1[2] + (c2[2] - c1[2]) * t),
    200 // Alpha
  ];
};

/**
 * DatasetViewerDeckGL - Geospatial dataset visualization using Deck.gl
 * Replaces ECharts with Deck.gl for better performance with large datasets
 */
const DatasetViewerDeckGL: React.FC<DatasetViewerDeckGLProps> = ({ DatasetInfo, onBack }) => {
  // Get dataset info from props or Zustand store
  const datasetInfoFromStore = useBrushStore((state) => state.selectedDataset);
  const datasetDataFromStore = useBrushStore((state) => state.datasetData);
  const globalColumnsFromStore = useBrushStore((state) => state.globalColumns);
  const setGlobalColumnsInStore = useBrushStore((state) => state.setGlobalColumns);

  const datasetInfo = DatasetInfo || datasetInfoFromStore;

  // State for live column list
  const [liveColumns, setLiveColumns] = useState<string[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  // Available columns
  const availableColumns: string[] = useMemo(() => {
    if (liveColumns.length > 0) {
      return liveColumns;
    }
    return datasetInfo?.column_mappings
      ?.filter((mapping: { column_type: number }) => mapping.column_type !== 3)
      ?.map((mapping: { column_name: string }) => mapping.column_name) || [];
  }, [liveColumns, datasetInfo?.column_mappings]);

  // Find coordinate columns from mappings
  const coordinateColumns = useMemo(() => {
    return {
      x: datasetInfo?.column_mappings?.find((m: { mapped_field: string }) => m.mapped_field === 'x')?.column_name || 'x',
      y: datasetInfo?.column_mappings?.find((m: { mapped_field: string }) => m.mapped_field === 'y')?.column_name || 'y',
      z: datasetInfo?.column_mappings?.find((m: { mapped_field: string }) => m.mapped_field === 'z')?.column_name || 'z'
    };
  }, [datasetInfo?.column_mappings]);

  // Dataset state
  const [dataset, setDataset] = useState<GetDatasetDataResponse | null>(() =>
    datasetDataFromStore || null
  );
  const [loading, setLoading] = useState(false);
  const [timetook, setTimetook] = useState(0);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Column selection state
  const [selectedValueColumn, setSelectedValueColumn] = useState<string>(() =>
    globalColumnsFromStore?.value || coordinateColumns.z || 'z'
  );
  const [selectedXAxis, setSelectedXAxis] = useState<string>(() =>
    globalColumnsFromStore?.xAxis || coordinateColumns.x || 'x'
  );
  const [selectedYAxis, setSelectedYAxis] = useState<string>(() =>
    globalColumnsFromStore?.yAxis || coordinateColumns.y || 'y'
  );

  // UI state
  const [brushAppliedTimestamp, setBrushAppliedTimestamp] = useState(0);
  const [isApplyingSelection, setIsApplyingSelection] = useState(false);
  const [isBrushMode, setIsBrushMode] = useState(false);
  const [showRegressionLine, setShowRegressionLine] = useState(false);
  const [showRMALine, setShowRMALine] = useState(false);
  const [showEquations, setShowEquations] = useState(false);

  // Brush selection state
  const [brushStart, setBrushStart] = useState<{ x: number; y: number } | null>(null);
  const [brushEnd, setBrushEnd] = useState<{ x: number; y: number } | null>(null);
  const [currentBrushRect, setCurrentBrushRect] = useState<{ x1: number; x2: number; y1: number; y2: number } | null>(null);

  // Tooltip state
  const [tooltipInfo, setTooltipInfo] = useState<{ x: number; y: number; object: { x: number; y: number; value: number; index: number } } | null>(null);

  // Container ref for dimensions
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ width: 800, height: 600 });

  // Brush info ref to prevent re-renders
  const brushInfoRef = useRef<{ count: number; selection: BrushSelection } | null>(null);

  // Update brush info ref
  const updateBrushInfoRef = useCallback(() => {
    if (!datasetInfo) return;
    const { getBrushSelection, columnsMatch } = useBrushStore.getState();
    const selection = getBrushSelection(datasetInfo.id);
    if (!selection) {
      brushInfoRef.current = null;
      return;
    }
    if (!columnsMatch(datasetInfo.id, selectedXAxis, selectedYAxis, selectedValueColumn)) {
      brushInfoRef.current = null;
      return;
    }
    brushInfoRef.current = {
      count: selection.selectedIndices.length,
      selection: selection
    };
  }, [datasetInfo, selectedXAxis, selectedYAxis, selectedValueColumn]);

  // Calculate OLS linear regression
  const calculateLinearRegression = useCallback((data: Float32Array) => {
    if (!data || data.length === 0) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = data.length / 3;

    for (let i = 0; i < n; i++) {
      const x = data[i * 3] as number;
      const y = data[i * 3 + 1] as number;
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept, type: 'OLS' as const };
  }, []);

  // Calculate RMA regression
  const calculateRMARegression = useCallback((data: Float32Array) => {
    if (!data || data.length === 0) return null;

    let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
    const n = data.length / 3;

    for (let i = 0; i < n; i++) {
      const x = data[i * 3] as number;
      const y = data[i * 3 + 1] as number;
      sumX += x;
      sumY += y;
      sumX2 += x * x;
      sumY2 += y * y;
      sumXY += x * y;
    }

    const meanX = sumX / n;
    const meanY = sumY / n;
    const varX = (sumX2 / n) - (meanX * meanX);
    const varY = (sumY2 / n) - (meanY * meanY);
    const stdX = Math.sqrt(varX);
    const stdY = Math.sqrt(varY);
    const covarXY = (sumXY / n) - (meanX * meanY);
    const r = covarXY / (stdX * stdY);
    const slope = Math.sign(r) * (stdY / stdX);
    const intercept = meanY - slope * meanX;

    return { slope, intercept, type: 'RMA' as const };
  }, []);

  // Update brush info ref on mount and when columns change
  useEffect(() => {
    updateBrushInfoRef();
  }, [updateBrushInfoRef]);

  // Update local dataset when store dataset changes
  useEffect(() => {
    if (datasetDataFromStore) {
      setDataset(datasetDataFromStore);
      updateBrushInfoRef();
      setBrushAppliedTimestamp(Date.now());
    }
  }, [datasetDataFromStore, updateBrushInfoRef]);

  // Observe container size
  useEffect(() => {
    if (!containerRef.current) return;

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        if (width > 0 && height > 0) {
          setContainerSize({ width, height });
        }
      }
    });

    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  // Full dataset from initial load
  const fullData = useMemo(() => {
    if (!dataset || !selectedValueColumn || !selectedXAxis || !selectedYAxis || !dataset.binary_data) {
      return null;
    }
    return new Float32Array(dataset.binary_data.buffer, dataset.binary_data.byteOffset, dataset.data_length);
  }, [dataset, selectedValueColumn, selectedXAxis, selectedYAxis]);

  // Chart data - show filtered data if brush selection exists
  const chartData = useMemo(() => {
    if (!fullData) return null;

    if (brushInfoRef.current) {
      const selection = brushInfoRef.current.selection;
      if (
        selection.columns.xAxis === selectedXAxis &&
        selection.columns.yAxis === selectedYAxis &&
        selection.columns.value === selectedValueColumn
      ) {
        return selection.selectedPoints;
      }
    }

    return fullData;
  }, [fullData, selectedXAxis, selectedYAxis, selectedValueColumn, brushAppliedTimestamp]);

  // Convert Float32Array to point objects for Deck.gl
  const pointData = useMemo(() => {
    if (!chartData) return [];

    const points: { x: number; y: number; value: number; index: number }[] = [];
    const n = chartData.length / 3;

    for (let i = 0; i < n; i++) {
      points.push({
        x: chartData[i * 3],
        y: chartData[i * 3 + 1],
        value: chartData[i * 3 + 2],
        index: i
      });
    }

    return points;
  }, [chartData]);

  // Calculate data bounds for normalization and view
  const dataBounds = useMemo(() => {
    if (!chartData || chartData.length === 0) return null;

    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minValue = Infinity, maxValue = -Infinity;

    const n = chartData.length / 3;
    for (let i = 0; i < n; i++) {
      const x = chartData[i * 3];
      const y = chartData[i * 3 + 1];
      const value = chartData[i * 3 + 2];

      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      if (value < minValue) minValue = value;
      if (value > maxValue) maxValue = value;
    }

    return { minX, maxX, minY, maxY, minValue, maxValue };
  }, [chartData]);

  // Calculate initial view state
  const initialViewState = useMemo((): OrthographicViewState => {
    if (!dataBounds) {
      return {
        target: [0, 0, 0],
        zoom: 0,
        minZoom: -10,
        maxZoom: 10
      };
    }

    const { minX, maxX, minY, maxY } = dataBounds;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    const rangeX = maxX - minX || 1;
    const rangeY = maxY - minY || 1;

    // Calculate zoom to fit data in viewport
    const zoomX = Math.log2(containerSize.width / rangeX) - 1;
    const zoomY = Math.log2(containerSize.height / rangeY) - 1;
    const zoom = Math.min(zoomX, zoomY);

    return {
      target: [centerX, centerY, 0],
      zoom: zoom,
      minZoom: -10,
      maxZoom: 10
    };
  }, [dataBounds, containerSize]);

  const [viewState, setViewState] = useState<OrthographicViewState>(initialViewState);

  // Update view state when initial view state changes (e.g., new data)
  useEffect(() => {
    setViewState(initialViewState);
  }, [initialViewState]);

  // Regression calculations
  const olsRegression = useMemo(() => {
    if (!chartData) return null;
    return calculateLinearRegression(chartData);
  }, [chartData, calculateLinearRegression]);

  const rmaRegression = useMemo(() => {
    if (!chartData) return null;
    return calculateRMARegression(chartData);
  }, [chartData, calculateRMARegression]);

  // Regression line data for Deck.gl LineLayer
  const regressionLineData = useMemo(() => {
    if (!showRegressionLine || !olsRegression || !dataBounds) return [];

    const { slope, intercept } = olsRegression;
    const { minX, maxX } = dataBounds;
    const y1 = slope * minX + intercept;
    const y2 = slope * maxX + intercept;

    return [{
      sourcePosition: [minX, y1, 0],
      targetPosition: [maxX, y2, 0],
      color: [239, 68, 68, 255] // Red
    }];
  }, [showRegressionLine, olsRegression, dataBounds]);

  const rmaLineData = useMemo(() => {
    if (!showRMALine || !rmaRegression || !dataBounds) return [];

    const { slope, intercept } = rmaRegression;
    const { minX, maxX } = dataBounds;
    const y1 = slope * minX + intercept;
    const y2 = slope * maxX + intercept;

    return [{
      sourcePosition: [minX, y1, 0],
      targetPosition: [maxX, y2, 0],
      color: [139, 92, 246, 255] // Purple
    }];
  }, [showRMALine, rmaRegression, dataBounds]);

  // Update global columns in store when local columns change (mosaic mode only)
  useEffect(() => {
    if (!DatasetInfo && datasetInfo) {
      setGlobalColumnsInStore({
        xAxis: selectedXAxis,
        yAxis: selectedYAxis,
        value: selectedValueColumn
      });
    }
  }, [selectedXAxis, selectedYAxis, selectedValueColumn, DatasetInfo, datasetInfo, setGlobalColumnsInStore]);

  // Load live column list from file statistics
  useEffect(() => {
    if (datasetInfo?.file_id) {
      loadLiveColumns();
    }
  }, [datasetInfo?.file_id]);

  // Load dataset when selection changes
  useEffect(() => {
    if (datasetInfo?.id) {
      loadDataset();
    }
  }, [datasetInfo?.id, selectedXAxis, selectedYAxis, selectedValueColumn]);

  const loadLiveColumns = async () => {
    if (!datasetInfo) return;

    try {
      setLoadingColumns(true);
      const response = await window.grpc.getFileStatistics({
        file_id: datasetInfo.file_id,
        columns: []
      });
      const columns = response.statistics?.map((stat: { column_name: string }) => stat.column_name) || [];
      setLiveColumns(columns);
    } catch (err) {
      console.error('Error loading live columns:', err);
    } finally {
      setLoadingColumns(false);
    }
  };

  const loadDataset = async () => {
    if (!datasetInfo) return;

    try {
      if (dataset) {
        setRefetching(true);
      } else {
        setLoading(true);
      }
      setError(null);

      const startTime = performance.now();
      const response = await window.grpc.getDatasetData({
        dataset_id: datasetInfo.id,
        columns: [selectedXAxis, selectedYAxis, selectedValueColumn]
      }) as GetDatasetDataResponse;
      setTimetook(performance.now() - startTime);

      if (response.binary_data && response.data_length > 0) {
        setDataset(response);

        // Update brush selection in mosaic mode
        if (!DatasetInfo && response.binary_data && response.data_length > 0) {
          const { getBrushSelection } = useBrushStore.getState();
          const existingBrush = getBrushSelection(datasetInfo.id);
          const shouldPreserveBrush = existingBrush && existingBrush.selectedIndices.length < datasetInfo.total_rows;

          if (!shouldPreserveBrush) {
            const fullData = new Float32Array(
              response.binary_data.buffer,
              response.binary_data.byteOffset,
              response.data_length
            );

            const xBoundary = response.data_boundaries?.find((b: DataBoundaries) => b.column_name === selectedXAxis);
            const yBoundary = response.data_boundaries?.find((b: DataBoundaries) => b.column_name === selectedYAxis);

            const boundariesMap: Record<string, DataBoundaries> = {};
            if (response.data_boundaries) {
              response.data_boundaries.forEach((boundary: DataBoundaries) => {
                boundariesMap[boundary.column_name] = boundary;
              });
            }

            const newBrushSelection = {
              datasetId: datasetInfo.id,
              coordRange: {
                x1: xBoundary?.min_value ?? 0,
                x2: xBoundary?.max_value ?? 100,
                y1: yBoundary?.min_value ?? 0,
                y2: yBoundary?.max_value ?? 100
              },
              selectedIndices: Array.from({ length: response.total_count }, (_, i) => i),
              selectedPoints: fullData,
              columns: {
                xAxis: selectedXAxis,
                yAxis: selectedYAxis,
                value: selectedValueColumn
              },
              timestamp: Date.now(),
              statistics: {
                histograms: response.histograms || {},
                boxPlots: response.box_plots || [],
                heatmap: response.heatmap,
                totalCount: response.total_count,
                boundaries: boundariesMap
              },
              datasetInfo: {
                id: datasetInfo.id,
                name: datasetInfo.file_name,
                totalRows: datasetInfo.total_rows,
                fileId: datasetInfo.file_id
              }
            };

            const { setBrushSelection } = useBrushStore.getState();
            setBrushSelection(datasetInfo.id, newBrushSelection);
          }
        }
      } else {
        console.error('Error loading dataset: No data returned');
        setError('Error al cargar el dataset');
      }
    } catch (err) {
      console.error('Error loading dataset:', err);
      setError('Error al cargar el dataset');
    } finally {
      setLoading(false);
      setRefetching(false);
    }
  };

  // Toggle brush mode
  const toggleBrushMode = () => {
    setIsBrushMode(!isBrushMode);
    if (isBrushMode) {
      // Clear brush when exiting brush mode
      setBrushStart(null);
      setBrushEnd(null);
      setCurrentBrushRect(null);
    }
  };

  // Clear drawn rectangle
  const clearDrawnRectangle = () => {
    setCurrentBrushRect(null);
    setBrushStart(null);
    setBrushEnd(null);
    setIsBrushMode(false);
  };

  // Apply brush selection
  const applyBrushSelection = async () => {
    if (!currentBrushRect || !datasetInfo) {
      console.warn('No brush rectangle or dataset info to apply');
      return;
    }

    try {
      setIsApplyingSelection(true);
      const rect = currentBrushRect;

      const response = await window.grpc.getDatasetData({
        dataset_id: datasetInfo.id,
        columns: [selectedXAxis, selectedYAxis, selectedValueColumn],
        bounding_box: [rect.x1, rect.x2, rect.y1, rect.y2]
      }) as GetDatasetDataResponse;

      if (response.binary_data && response.data_length > 0) {
        const filteredData = response.binary_data_f32;

        if (!filteredData) {
          console.error('Error: No filtered data returned from backend');
          return;
        }

        const boundariesMap: Record<string, DataBoundaries> = {};
        if (response.data_boundaries) {
          response.data_boundaries.forEach((boundary: DataBoundaries) => {
            boundariesMap[boundary.column_name] = boundary;
          });
        }

        const brushSelection = {
          datasetId: datasetInfo.id,
          coordRange: rect,
          selectedIndices: Array.from({ length: response.total_count }, (_, i) => i),
          selectedPoints: filteredData,
          columns: {
            xAxis: selectedXAxis,
            yAxis: selectedYAxis,
            value: selectedValueColumn
          },
          timestamp: Date.now(),
          statistics: {
            histograms: response.histograms || {},
            boxPlots: response.box_plots || [],
            heatmap: response.heatmap,
            totalCount: response.total_count,
            boundaries: boundariesMap
          },
          datasetInfo: {
            id: datasetInfo.id,
            name: datasetInfo.file_name,
            totalRows: datasetInfo.total_rows,
            fileId: datasetInfo.file_id
          }
        };

        const { setBrushSelection } = useBrushStore.getState();
        setBrushSelection(datasetInfo.id, brushSelection);

        brushInfoRef.current = {
          count: response.total_count,
          selection: brushSelection
        };

        setCurrentBrushRect(null);
        setBrushAppliedTimestamp(Date.now());
      }
    } catch (err) {
      console.error('Error applying brush selection:', err);
      setError('Error al aplicar la selección');
    } finally {
      setIsApplyingSelection(false);
    }
  };

  // Reset view to initial
  const resetView = () => {
    setViewState(initialViewState);
  };

  // Handle click for picking
  const handleClick = (info: PickingInfo) => {
    if (!isBrushMode && info.object) {
      console.log('Clicked point:', info.object);
    }
  };

  // Handle hover for tooltip
  const handleHover = (info: PickingInfo) => {
    if (info.object && !isBrushMode) {
      setTooltipInfo({
        x: info.x || 0,
        y: info.y || 0,
        object: info.object as { x: number; y: number; value: number; index: number }
      });
    } else {
      setTooltipInfo(null);
    }
  };

  // Handle drag for brush selection
  const handleDragStart = (info: PickingInfo, event: { type: string }) => {
    if (isBrushMode && info.coordinate) {
      setBrushStart({ x: info.coordinate[0], y: info.coordinate[1] });
      setBrushEnd(null);
      return true; // Consume the event
    }
    return false;
  };

  const handleDrag = (info: PickingInfo, event: { type: string }) => {
    if (isBrushMode && brushStart && info.coordinate) {
      setBrushEnd({ x: info.coordinate[0], y: info.coordinate[1] });
      return true;
    }
    return false;
  };

  const handleDragEnd = (info: PickingInfo, event: { type: string }) => {
    if (isBrushMode && brushStart && brushEnd) {
      const rect = {
        x1: Math.min(brushStart.x, brushEnd.x),
        x2: Math.max(brushStart.x, brushEnd.x),
        y1: Math.min(brushStart.y, brushEnd.y),
        y2: Math.max(brushStart.y, brushEnd.y)
      };
      setCurrentBrushRect(rect);
      setBrushStart(null);
      setBrushEnd(null);
      return true;
    }
    return false;
  };

  // Create Deck.gl layers
  const layers = useMemo(() => {
    const result = [];

    // Scatter plot layer for points
    if (pointData.length > 0 && dataBounds) {
      const valueRange = dataBounds.maxValue - dataBounds.minValue || 1;

      result.push(
        new ScatterplotLayer({
          id: 'scatter-plot',
          data: pointData,
          pickable: !isBrushMode,
          opacity: 0.8,
          stroked: false,
          filled: true,
          radiusScale: 1,
          radiusMinPixels: 2,
          radiusMaxPixels: 10,
          getPosition: (d: { x: number; y: number }) => [d.x, d.y, 0],
          getRadius: 4,
          getFillColor: (d: { value: number }) => {
            const normalized = (d.value - dataBounds.minValue) / valueRange;
            return getColorForValue(Math.max(0, Math.min(1, normalized)));
          },
          updateTriggers: {
            getFillColor: [dataBounds.minValue, dataBounds.maxValue]
          }
        })
      );
    }

    // OLS Regression line
    if (regressionLineData.length > 0) {
      result.push(
        new LineLayer({
          id: 'ols-regression-line',
          data: regressionLineData,
          pickable: false,
          getWidth: 3,
          getSourcePosition: (d: { sourcePosition: number[] }) => d.sourcePosition as [number, number, number],
          getTargetPosition: (d: { targetPosition: number[] }) => d.targetPosition as [number, number, number],
          getColor: (d: { color: number[] }) => d.color as [number, number, number, number]
        })
      );
    }

    // RMA Regression line
    if (rmaLineData.length > 0) {
      result.push(
        new LineLayer({
          id: 'rma-regression-line',
          data: rmaLineData,
          pickable: false,
          getWidth: 3,
          getSourcePosition: (d: { sourcePosition: number[] }) => d.sourcePosition as [number, number, number],
          getTargetPosition: (d: { targetPosition: number[] }) => d.targetPosition as [number, number, number],
          getColor: (d: { color: number[] }) => d.color as [number, number, number, number]
        })
      );
    }

    return result;
  }, [pointData, dataBounds, isBrushMode, regressionLineData, rmaLineData]);

  // Brush rectangle overlay
  const brushRectStyle = useMemo(() => {
    if (!brushStart || !brushEnd || !containerRef.current) return null;

    // Convert data coordinates to screen coordinates
    // This is a simplified conversion - in a real app you'd use the view matrix
    const view = viewState;
    const zoom = typeof view.zoom === 'number' ? view.zoom : (Array.isArray(view.zoom) ? view.zoom[0] : 0);
    const scale = Math.pow(2, zoom);
    const target = view.target as [number, number, number];

    const toScreen = (dataX: number, dataY: number) => {
      const screenX = (dataX - target[0]) * scale + containerSize.width / 2;
      const screenY = containerSize.height / 2 - (dataY - target[1]) * scale;
      return { x: screenX, y: screenY };
    };

    const start = toScreen(brushStart.x, brushStart.y);
    const end = toScreen(brushEnd.x, brushEnd.y);

    return {
      left: Math.min(start.x, end.x),
      top: Math.min(start.y, end.y),
      width: Math.abs(end.x - start.x),
      height: Math.abs(end.y - start.y)
    };
  }, [brushStart, brushEnd, viewState, containerSize]);

  // Applied brush rectangle display
  const appliedBrushStyle = useMemo(() => {
    if (!currentBrushRect || !containerRef.current) return null;

    const view = viewState;
    const zoom = typeof view.zoom === 'number' ? view.zoom : (Array.isArray(view.zoom) ? view.zoom[0] : 0);
    const scale = Math.pow(2, zoom);
    const target = view.target as [number, number, number];

    const toScreen = (dataX: number, dataY: number) => {
      const screenX = (dataX - target[0]) * scale + containerSize.width / 2;
      const screenY = containerSize.height / 2 - (dataY - target[1]) * scale;
      return { x: screenX, y: screenY };
    };

    const topLeft = toScreen(currentBrushRect.x1, currentBrushRect.y2);
    const bottomRight = toScreen(currentBrushRect.x2, currentBrushRect.y1);

    return {
      left: topLeft.x,
      top: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y
    };
  }, [currentBrushRect, viewState, containerSize]);

  // Check if datasetInfo is available
  if (!datasetInfo) {
    return (
      <Card className="w-full h-full flex items-center justify-center">
        <CardContent className="text-center py-12">
          <Database className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No hay dataset seleccionado</p>
          <p className="text-sm text-muted-foreground mt-2">
            Selecciona un dataset desde el administrador de proyectos
          </p>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <span className="ml-3">Cargando dataset...</span>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center">
            <p className="text-red-600 mb-4">{error}</p>
            {onBack && (
              <Button variant="outline" onClick={onBack}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Volver a Proyectos
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full h-full flex flex-col p-4 space-y-4">
      {/* Header with back button (standalone mode only) */}
      {onBack && (
        <div className="flex items-center flex-shrink-0">
          <Button variant="outline" onClick={onBack} size="sm">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
        </div>
      )}

      {/* Column Selectors */}
      <div className="grid grid-cols-3 gap-3 flex-shrink-0">
        <div>
          <Label className="text-xs font-medium">Eje X</Label>
          <Select value={selectedXAxis} onValueChange={setSelectedXAxis}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableColumns.map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs font-medium">Eje Y</Label>
          <Select value={selectedYAxis} onValueChange={setSelectedYAxis}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableColumns.map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div>
          <Label className="text-xs font-medium">Valor</Label>
          <Select value={selectedValueColumn} onValueChange={setSelectedValueColumn}>
            <SelectTrigger className="h-8">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {availableColumns.map((column) => (
                <SelectItem key={column} value={column}>
                  {column}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Chart Title */}
      <div className="text-center">
        <h3 className="text-sm font-semibold">
          {datasetInfo.file_name} - Visualización 2D (Deck.gl)
        </h3>
        <p className="text-xs text-muted-foreground">
          {pointData.length.toLocaleString()} puntos | {timetook.toFixed(0)}ms
        </p>
      </div>

      {/* Deck.gl Chart */}
      <div
        ref={containerRef}
        className="flex-1 relative bg-background border rounded-md overflow-hidden"
        style={{ minHeight: '400px' }}
      >
        {pointData.length > 0 ? (
          <>
            <DeckGL
              views={new OrthographicView({ id: 'ortho', flipY: false })}
              viewState={viewState}
              onViewStateChange={({ viewState: newViewState }) => {
                if (!isBrushMode) {
                  setViewState(newViewState as OrthographicViewState);
                }
              }}
              layers={layers}
              controller={!isBrushMode}
              onClick={handleClick}
              onHover={handleHover}
              onDragStart={handleDragStart}
              onDrag={handleDrag}
              onDragEnd={handleDragEnd}
              getCursor={({ isDragging }) => isBrushMode ? 'crosshair' : (isDragging ? 'grabbing' : 'grab')}
              style={{ background: 'transparent' }}
            />

            {/* Brush rectangle during drag */}
            {brushRectStyle && (
              <div
                className="absolute pointer-events-none border-2 border-orange-500 bg-orange-500/25"
                style={brushRectStyle}
              />
            )}

            {/* Applied brush rectangle */}
            {appliedBrushStyle && (
              <div
                className="absolute pointer-events-none border-3 border-orange-500 bg-orange-500/25"
                style={appliedBrushStyle}
              />
            )}

            {/* Tooltip */}
            {tooltipInfo && (
              <div
                className="absolute z-50 bg-popover text-popover-foreground border rounded-md shadow-md px-3 py-2 text-xs pointer-events-none"
                style={{
                  left: tooltipInfo.x + 10,
                  top: tooltipInfo.y + 10
                }}
              >
                <p className="font-semibold mb-1">Punto {tooltipInfo.object.index + 1}</p>
                <p>{selectedXAxis}: {tooltipInfo.object.x.toFixed(4)}</p>
                <p>{selectedYAxis}: {tooltipInfo.object.y.toFixed(4)}</p>
                <p>{selectedValueColumn}: {tooltipInfo.object.value.toFixed(4)}</p>
              </div>
            )}

            {/* Regression Equations */}
            {showEquations && (olsRegression || rmaRegression) && (
              <div className="absolute top-2 left-2 z-10 bg-background/90 border rounded-md px-3 py-2 text-xs">
                {olsRegression && showRegressionLine && (
                  <p className="text-red-500 font-semibold">
                    OLS: y = {olsRegression.slope.toFixed(4)}x + {olsRegression.intercept.toFixed(4)}
                  </p>
                )}
                {rmaRegression && showRMALine && (
                  <p className="text-purple-500 font-semibold">
                    RMA: y = {rmaRegression.slope.toFixed(4)}x + {rmaRegression.intercept.toFixed(4)}
                  </p>
                )}
              </div>
            )}

            {/* Color Legend */}
            {dataBounds && (
              <div className="absolute bottom-2 right-2 z-10 bg-background/90 border rounded-md px-2 py-1 text-xs">
                <div className="flex flex-col items-center gap-1">
                  <span className="text-muted-foreground">ALTO</span>
                  <div
                    className="w-4 h-24 rounded"
                    style={{
                      background: 'linear-gradient(to bottom, #7f1d1d, #b91c1c, #dc2626, #ea580c, #f59e0b, #fbbf24, #60a5fa, #3b82f6, #1e40af, #1e3a8a)'
                    }}
                  />
                  <span className="text-muted-foreground">BAJO</span>
                  <div className="text-center mt-1">
                    <p>{dataBounds.maxValue.toFixed(2)}</p>
                    <p className="text-muted-foreground">-</p>
                    <p>{dataBounds.minValue.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Chart Controls */}
            <div className="absolute top-2 right-2 z-10 flex flex-col gap-2">
              {/* Brush Mode Toggle */}
              <Button
                variant={isBrushMode ? "default" : "outline"}
                size="sm"
                onClick={toggleBrushMode}
                title={isBrushMode ? "Modo puntero" : "Modo dibujo"}
                className="shadow-lg h-8"
              >
                {isBrushMode ? <Brush className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
              </Button>

              {/* Reset View Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={resetView}
                title="Restablecer vista"
                className="shadow-lg h-8"
              >
                <RotateCcw className="h-3 w-3" />
              </Button>

              {/* OLS Regression Line Toggle */}
              <Button
                variant={showRegressionLine ? "default" : "outline"}
                size="sm"
                onClick={() => setShowRegressionLine(!showRegressionLine)}
                title={showRegressionLine ? "Ocultar regresión OLS" : "Mostrar regresión OLS"}
                className="shadow-lg h-8"
              >
                <TrendingUp className="h-3 w-3" />
              </Button>

              {/* RMA Regression Line Toggle */}
              <Button
                variant={showRMALine ? "default" : "outline"}
                size="sm"
                onClick={() => setShowRMALine(!showRMALine)}
                title={showRMALine ? "Ocultar regresión RMA" : "Mostrar regresión RMA"}
                className="shadow-lg h-8"
              >
                <Split className="h-3 w-3" />
              </Button>

              {/* Show Equations Toggle */}
              <Button
                variant={showEquations ? "default" : "outline"}
                size="sm"
                onClick={() => setShowEquations(!showEquations)}
                title={showEquations ? "Ocultar ecuaciones" : "Mostrar ecuaciones"}
                className="shadow-lg h-8"
              >
                <Type className="h-3 w-3" />
              </Button>

              {/* Apply/Clear Brush Selection */}
              {currentBrushRect && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={applyBrushSelection}
                    disabled={isApplyingSelection}
                    className="shadow-lg bg-blue-600 hover:bg-blue-700 h-8 text-xs"
                  >
                    {isApplyingSelection ? '...' : '✓'}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={clearDrawnRectangle}
                    title="Limpiar rectángulo dibujado"
                    className="shadow-lg h-8"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground text-sm">
              {loading || refetching ? 'Cargando...' : 'No hay datos disponibles'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default DatasetViewerDeckGL;
