import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import ReactECharts from 'echarts-for-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Activity, Brush, Database, X, Camera, TrendingUp, Split, Type } from 'lucide-react';
import { GetDatasetDataResponse, DatasetInfo, DataBoundaries } from '@/generated/projects';
import { useBrushStore, BrushSelection } from '@/stores/brushStore';

/**
 * Propiedades del componente DatasetViewer
 * Define los parámetros necesarios para visualizar un dataset
 */
interface DatasetViewerProps {
  DatasetInfo?: DatasetInfo;    // Información completa del dataset (optional - reads from Zustand if not provided)
  onBack?: () => void;     // Función callback para regresar a la vista anterior (optional - hides back button if not provided)
}
/**
 * Componente principal para visualizar datasets geoespaciales
 * Permite seleccionar ejes X/Y/Valor y muestra gráfico de dispersión 2D
 * con escalado automático basado en límites calculados en el backend
 * 
 * Can work in two modes:
 * 1. Standalone: Receives DatasetInfo prop and onBack callback (used in ProjectManager)
 * 2. Mosaic mode: Reads from Zustand store (used in ChartMosaicExample)
 */
const DatasetViewer: React.FC<DatasetViewerProps> = ({ DatasetInfo, onBack }) => {

  // Get dataset info from props or Zustand store
  const datasetInfoFromStore = useBrushStore((state) => state.selectedDataset);
  const datasetDataFromStore = useBrushStore((state) => state.datasetData);
  const globalColumnsFromStore = useBrushStore((state) => state.globalColumns);
  const setGlobalColumnsInStore = useBrushStore((state) => state.setGlobalColumns);
  
  const datasetInfo = DatasetInfo || datasetInfoFromStore; // Use prop if provided, otherwise use store

  // CRITICAL: Don't use any Zustand hooks - access store imperatively to prevent re-renders
  // We use useBrushStore.getState() directly instead to avoid subscribing to store updates

  // State for live column list (loaded from file statistics)
  const [liveColumns, setLiveColumns] = useState<string[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);

  // Memoize column calculations - use live columns if available, fallback to column_mappings
  const availableColumns = useMemo(() => {
    // Prefer live columns from file statistics (includes dynamically added columns)
    if (liveColumns.length > 0) {
      return liveColumns;
    }
    // Fallback to static column_mappings from dataset metadata
    return datasetInfo?.column_mappings
      ?.filter(mapping => mapping.column_type !== 3) // Not UNUSED
      ?.map(mapping => mapping.column_name) || [];
  }, [liveColumns, datasetInfo?.column_mappings]);

  // Find coordinate columns from mappings
  const coordinateColumns = useMemo(() => {
    return {
      x: datasetInfo?.column_mappings?.find(m => m.mapped_field === 'x')?.column_name || 'x',
      y: datasetInfo?.column_mappings?.find(m => m.mapped_field === 'y')?.column_name || 'y',
      z: datasetInfo?.column_mappings?.find(m => m.mapped_field === 'z')?.column_name || 'z'
    };
  }, [datasetInfo?.column_mappings]);

  const [dataset, setDataset] = useState<GetDatasetDataResponse | null>(() => 
    datasetDataFromStore || null
  );
  const [loading, setLoading] = useState(false);
  const [timetook, setTimetook] = useState(0);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Initialize selected columns with global columns from store, fallback to coordinate mappings
  const [selectedValueColumn, setSelectedValueColumn] = useState<string>(() =>
    globalColumnsFromStore?.value || coordinateColumns.z || 'z'
  );
  const [selectedXAxis, setSelectedXAxis] = useState<string>(() =>
    globalColumnsFromStore?.xAxis || coordinateColumns.x || 'x'
  );
  const [selectedYAxis, setSelectedYAxis] = useState<string>(() =>
    globalColumnsFromStore?.yAxis || coordinateColumns.y || 'y'
  );
  const [brushAppliedTimestamp, setBrushAppliedTimestamp] = useState(0); // Track when brush is applied to trigger re-render
  const [isApplyingSelection, setIsApplyingSelection] = useState(false); // Separate state for backend filtering
  const [isBrushMode, setIsBrushMode] = useState(false); // Track if brush mode is active
  const [showRegressionLine, setShowRegressionLine] = useState(false); // Toggle for OLS regression line
  const [showRMALine, setShowRMALine] = useState(false); // Toggle for RMA regression line
  const [showEquations, setShowEquations] = useState(false); // Toggle for showing equations
  const chartRef = useRef<ReactECharts>(null);

  // Flag to prevent infinite loop when applying brush programmatically
  const isApplyingBrushProgrammatically = useRef(false);

  // Track last brush update to prevent rapid-fire updates
  const lastBrushUpdateTime = useRef(0);
  const BRUSH_UPDATE_DEBOUNCE = 300; // milliseconds (reduced for better responsiveness)

  // Large dataset mode threshold
  const LARGE_THRESHOLD = 20000;

  // Check if we're in large dataset mode
  const isLargeDataset = useMemo(() => {
    return (dataset?.total_count || 0) > LARGE_THRESHOLD;
  }, [dataset?.total_count]);

  // Track current brush rectangle for large dataset mode
  const currentBrushRectRef = useRef<{x1: number; x2: number; y1: number; y2: number} | null>(null);
  
  // Track the last applied brush timestamp to prevent re-application
  const lastAppliedBrushTimestamp = useRef<number>(0);

  // Use a ref to store brush info so it doesn't trigger re-renders
  // Only read from store when explicitly needed (filter toggle, render badge)
  const brushInfoRef = useRef<{ count: number; selection: BrushSelection } | null>(null);

  // Update ref when columns or dataset change, or manually on filter toggle
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

  // Calculate OLS linear regression (ordinary least squares method)
  const calculateLinearRegression = useCallback((data: Float32Array) => {
    if (!data || data.length === 0) return null;

    let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
    const n = data.length / 3; // data is [x, y, value] triplets

    for (let i = 0; i < n; i++) {
      const x = data[i * 3] as number;     // X coordinate
      const y = data[i * 3 + 1] as number; // Y coordinate
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumX2 += x * x;
    }

    const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;

    return { slope, intercept, type: 'OLS' as const };
  }, []);

  // Calculate RMA regression (Reduced Major Axis)
  const calculateRMARegression = useCallback((data: Float32Array) => {
    if (!data || data.length === 0) return null;

    let sumX = 0, sumY = 0, sumX2 = 0, sumY2 = 0, sumXY = 0;
    const n = data.length / 3; // data is [x, y, value] triplets

    // Calculate sums
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

    // Calculate standard deviations
    const varX = (sumX2 / n) - (meanX * meanX);
    const varY = (sumY2 / n) - (meanY * meanY);
    const stdX = Math.sqrt(varX);
    const stdY = Math.sqrt(varY);

    // Calculate correlation coefficient
    const covarXY = (sumXY / n) - (meanX * meanY);
    const r = covarXY / (stdX * stdY);

    // RMA slope: sign(r) * (stdY / stdX)
    const slope = Math.sign(r) * (stdY / stdX);
    const intercept = meanY - slope * meanX;

    return { slope, intercept, type: 'RMA' as const };
  }, []);

  // Update brush info ref on mount and when columns change
  useEffect(() => {
    updateBrushInfoRef();
  }, [updateBrushInfoRef]);

  // Update local dataset when store dataset changes (e.g., when clearing selection refetches)
  useEffect(() => {
    if (datasetDataFromStore) {
      setDataset(datasetDataFromStore);
      // Also update brush info ref when dataset changes
      updateBrushInfoRef();
      // Trigger re-render to update chartData
      setBrushAppliedTimestamp(Date.now());
    }
  }, [datasetDataFromStore, updateBrushInfoRef]);

  // Listen for brush selection being cleared from external source (like mosaic sidebar)
  // and clear the visual brush rectangle on the chart
  useEffect(() => {
    if (!datasetInfo || !chartRef.current) return;
    
    const { getBrushSelection } = useBrushStore.getState();
    const selection = getBrushSelection(datasetInfo.id);
    
    // If selection is cleared, also clear the visual brush and rectangle ref
    if (!selection) {
      currentBrushRectRef.current = null;
      setIsBrushMode(false);
      
      // Clear the brush visually on the chart
      chartRef.current.getEchartsInstance().dispatchAction({
        type: 'brush',
        command: 'clear',
        areas: []
      });
      
      // Trigger re-render
      setBrushAppliedTimestamp(Date.now());
    }
  }, [datasetInfo]);

  // Poll for brush selection changes (since we can't subscribe to specific dataset changes)
  useEffect(() => {
    if (!datasetInfo) return;
    
    const interval = setInterval(() => {
      const { getBrushSelection } = useBrushStore.getState();
      const selection = getBrushSelection(datasetInfo.id);
      
      // Update brush info ref if selection changed
      const currentTimestamp = brushInfoRef.current?.selection.timestamp;
      const newTimestamp = selection?.timestamp;
      
      if (currentTimestamp !== newTimestamp) {
        console.log('🔍 Brush selection changed in store, updating ref');
        updateBrushInfoRef();
        setBrushAppliedTimestamp(Date.now());
        
        // If selection was cleared, also clear visual brush
        if (!selection && currentBrushRectRef.current) {
          currentBrushRectRef.current = null;
          setIsBrushMode(false);
          
          if (chartRef.current) {
            chartRef.current.getEchartsInstance().dispatchAction({
              type: 'brush',
              command: 'clear',
              areas: []
            });
          }
        }
      }
    }, 500); // Check every 500ms
    
    return () => clearInterval(interval);
  }, [datasetInfo, updateBrushInfoRef]);

  // Full dataset from initial load
  const fullData = useMemo(() => {
    if (!dataset || !selectedValueColumn || !selectedXAxis || !selectedYAxis || !dataset.binary_data) {
      return null;
    }
    return new Float32Array(dataset.binary_data.buffer, dataset.binary_data.byteOffset, dataset.data_length);
  }, [dataset, selectedValueColumn, selectedXAxis, selectedYAxis]);

  // Chart data - show filtered data if brush selection exists, otherwise show full data
  const chartData = useMemo(() => {
    if (!fullData) return null;

    // If we have an active brush selection for this dataset with matching columns, show filtered data
    if (brushInfoRef.current) {
      const selection = brushInfoRef.current.selection;
      // Check if columns match
      if (
        selection.columns.xAxis === selectedXAxis &&
        selection.columns.yAxis === selectedYAxis &&
        selection.columns.value === selectedValueColumn
      ) {
        return selection.selectedPoints;
      }
    }

    return fullData;
  }, [fullData, selectedXAxis, selectedYAxis, selectedValueColumn, brushAppliedTimestamp]); // Re-compute when brush is applied

  // Calculate OLS regression results
  const olsRegression = useMemo(() => {
    if (!chartData) return null;
    return calculateLinearRegression(chartData);
  }, [chartData, calculateLinearRegression]);

  // Calculate RMA regression results
  const rmaRegression = useMemo(() => {
    if (!chartData) return null;
    return calculateRMARegression(chartData);
  }, [chartData, calculateRMARegression]);

  // Calculate OLS regression line data points
  const regressionLineData = useMemo(() => {
    if (!showRegressionLine || !olsRegression) return null;

    // Get X axis boundaries to draw line across the full range
    const xBoundary = dataset?.data_boundaries?.find(b => b.column_name === selectedXAxis);
    if (!xBoundary) return null;

    const { slope, intercept } = olsRegression;
    const x1 = xBoundary.min_value;
    const x2 = xBoundary.max_value;
    const y1 = slope * x1 + intercept;
    const y2 = slope * x2 + intercept;

    return [[x1, y1], [x2, y2]];
  }, [showRegressionLine, olsRegression, dataset, selectedXAxis]);

  // Calculate RMA regression line data points
  const rmaLineData = useMemo(() => {
    if (!showRMALine || !rmaRegression) return null;

    // Get X axis boundaries to draw line across the full range
    const xBoundary = dataset?.data_boundaries?.find(b => b.column_name === selectedXAxis);
    if (!xBoundary) return null;

    const { slope, intercept } = rmaRegression;
    const x1 = xBoundary.min_value;
    const x2 = xBoundary.max_value;
    const y1 = slope * x1 + intercept;
    const y2 = slope * x2 + intercept;

    return [[x1, y1], [x2, y2]];
  }, [showRMALine, rmaRegression, dataset, selectedXAxis]);

  // Update global columns in store when local columns change (only in mosaic mode)
  useEffect(() => {
    if (!DatasetInfo && datasetInfo) {
      // Only update store if we're in mosaic mode (no prop provided)
      setGlobalColumnsInStore({
        xAxis: selectedXAxis,
        yAxis: selectedYAxis,
        value: selectedValueColumn
      });
    }
  }, [selectedXAxis, selectedYAxis, selectedValueColumn, DatasetInfo, datasetInfo, setGlobalColumnsInStore]);

  // Load live column list from file statistics on mount
  useEffect(() => {
    if (datasetInfo?.file_id) {
      loadLiveColumns();
    }
  }, [datasetInfo?.file_id]);

  useEffect(() => {
    if (datasetInfo?.id) {
      loadDataset();
    }
  }, [datasetInfo?.id, selectedXAxis, selectedYAxis, selectedValueColumn]);


  // Apply brush selection from store ONLY if it's a user-drawn selection (not initial full dataset)
  // and wasn't just applied by this component
  useEffect(() => {
    if (!chartRef.current || !fullData || !datasetInfo) return;

    // Get the current brush selection from store imperatively
    const { getBrushSelection } = useBrushStore.getState();
    const selection = getBrushSelection(datasetInfo.id);
    if (!selection) return;

    // Don't re-apply a brush that we just applied ourselves
    if (selection.timestamp === lastAppliedBrushTimestamp.current) {
      console.log('🔍 Skipping re-application of brush we just applied');
      return;
    }

    // Only apply if columns match
    if (
      selection.columns.xAxis !== selectedXAxis ||
      selection.columns.yAxis !== selectedYAxis ||
      selection.columns.value !== selectedValueColumn
    ) {
      return;
    }

    // Don't apply if this is the initial "full dataset" brush selection
    // Check if the coordRange covers the entire dataset boundaries
    const xBoundary = dataset?.data_boundaries?.find(b => b.column_name === selectedXAxis);
    const yBoundary = dataset?.data_boundaries?.find(b => b.column_name === selectedYAxis);
    
    if (xBoundary && yBoundary) {
      const isFullDatasetBrush = 
        Math.abs(selection.coordRange.x1 - xBoundary.min_value) < 0.0001 &&
        Math.abs(selection.coordRange.x2 - xBoundary.max_value) < 0.0001 &&
        Math.abs(selection.coordRange.y1 - yBoundary.min_value) < 0.0001 &&
        Math.abs(selection.coordRange.y2 - yBoundary.max_value) < 0.0001;
      
      if (isFullDatasetBrush) {
        console.log('🔍 Skipping visual application of full dataset brush');
        return; // Don't apply full dataset brush visually
      }
    }

    const chartInstance = chartRef.current.getEchartsInstance();

    // Small delay to ensure chart is fully rendered
    const timer = setTimeout(() => {
      try {
        console.log('🔍 Applying brush selection from another source visually');

        // Set flag to prevent triggering brushSelected event
        isApplyingBrushProgrammatically.current = true;

        // Apply brush programmatically using dispatchAction
        chartInstance.dispatchAction({
          type: 'brush',
          areas: [{
            brushType: 'rect',
            coordRange: [
              [selection.coordRange.x1, selection.coordRange.x2],
              [selection.coordRange.y1, selection.coordRange.y2]
            ],
            xAxisIndex: 0,
            yAxisIndex: 0
          }]
        });

        // Reset flag after a short delay
        setTimeout(() => {
          isApplyingBrushProgrammatically.current = false;
        }, 100);
      } catch (err) {
        console.error('Error applying brush:', err);
        isApplyingBrushProgrammatically.current = false;
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [fullData, dataset, selectedXAxis, selectedYAxis, selectedValueColumn, datasetInfo]);

  // Resize chart when container size changes with debouncing
  useEffect(() => {
    let resizeTimeout: NodeJS.Timeout;

    const debouncedResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        if (chartRef.current) {
          const chartInstance = chartRef.current.getEchartsInstance();
          chartInstance.resize();
        }
      }, 100); // Delay para actualizar el gráfico
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Chart resize callback
  const handleChartReady = useCallback((chartInstance: { resize: () => void }) => {
    if (chartData) {
      setTimeout(() => chartInstance.resize(), 100);
    }
  }, [chartData]);

  const loadLiveColumns = async () => {
    if (!datasetInfo) return;
    
    try {
      setLoadingColumns(true);

      const response = await window.autoGrpc.getFileStatistics({
        file_id: datasetInfo.file_id,
        columns: [] // Get all columns
      });

      // Extract column names from statistics
      const columns = response.statistics?.map((stat: {column_name: string}) => stat.column_name) || [];

      setLiveColumns(columns);
    } catch (err) {
      console.error('❌ Error loading live columns:', err);
      // On error, fall back to static column_mappings (no state update needed)
    } finally {
      setLoadingColumns(false);
    }
  };

  const loadDataset = async () => {
    if (!datasetInfo) return;
    
    try {
      // Use different loading state for refetches vs initial load
      if (dataset) {
        setRefetching(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Get dataset data with binary format - request currently selected columns
      const startTime = performance.now();
      const response = await window.autoGrpc.getDatasetData({
        dataset_id: datasetInfo.id,
        columns: [selectedXAxis, selectedYAxis, selectedValueColumn]
      }) as GetDatasetDataResponse;
      setTimetook((performance.now() - startTime));

      if (response.binary_data && response.data_length > 0) {
        setDataset(response);
      } else {
        console.error('❌ Error loading dataset: No data returned');
        setError('Error al cargar el dataset');
      }
    } catch (err) {
      console.error('❌ Error loading dataset:', err);
      setError('Error al cargar el dataset');
    } finally {
      setLoading(false);
      setRefetching(false);
    }
  };

  // Toggle brush drawing mode
  const toggleBrushMode = () => {
    if (chartRef.current) {
      const chartInstance = chartRef.current.getEchartsInstance();

      if (isBrushMode) {
        // Disable brush mode - return to pointer/pan mode
        chartInstance.dispatchAction({
          type: 'takeGlobalCursor',
          key: 'brush',
          brushOption: {
            brushType: false  // Disable brush
          }
        });
        setIsBrushMode(false);
      } else {
        // Enable brush mode
        chartInstance.dispatchAction({
          type: 'takeGlobalCursor',
          key: 'brush',
          brushOption: {
            brushType: 'rect',
            brushMode: 'single'
          }
        });
        setIsBrushMode(true);
      }
    }
  };

  // Clear only the drawn rectangle (not the stored selection)
  const clearDrawnRectangle = () => {
    // Clear the rectangle ref
    currentBrushRectRef.current = null;
    setIsBrushMode(false);
    
    // Clear the brush visually on the chart
    if (chartRef.current) {
      chartRef.current.getEchartsInstance().dispatchAction({
        type: 'brush',
        command: 'clear',
        areas: []
      });
    }
    
    // Trigger re-render to hide Apply button
    setBrushAppliedTimestamp(Date.now());
  };

  // Apply brush selection (works for both small and large datasets)
  const applyBrushSelection = async () => {
    if (!currentBrushRectRef.current || !datasetInfo) {
      console.warn('⚠️ No brush rectangle or dataset info to apply');
      return;
    }

    try {
      setIsApplyingSelection(true);
      const rect = currentBrushRectRef.current;

      const response = await window.autoGrpc.getDatasetData({
        dataset_id: datasetInfo.id,
        columns: [selectedXAxis, selectedYAxis, selectedValueColumn],
        bounding_box: [rect.x1, rect.x2, rect.y1, rect.y2]
      }) as GetDatasetDataResponse;

      if (response.binary_data && response.data_length > 0) {

        // Consigo la data filtrada como Float32Array
        const filteredData = response.binary_data_f32;
        
        // Ensure filteredData exists
        if (!filteredData) {
          console.error('❌ Error: No filtered data returned from backend');
          return;
        }

        // Convert data_boundaries array to Record<string, DataBoundaries>
        const boundariesMap: Record<string, DataBoundaries> = {};
        if (response.data_boundaries) {
          response.data_boundaries.forEach(boundary => {
            boundariesMap[boundary.column_name] = boundary;
          });
        }

        // Create brush selection for Zustand store with backend statistics
        const brushSelection = {
          datasetId: datasetInfo.id,
          coordRange: rect,
          selectedIndices: Array.from({ length: response.total_count }, (_, i) => i), // Sequential indices
          selectedPoints: filteredData,
          columns: {
            xAxis: selectedXAxis,
            yAxis: selectedYAxis,
            value: selectedValueColumn
          },
          timestamp: Date.now(),

          // Add statistics from backend response
          statistics: {
            histograms: response.histograms || {},
            boxPlots: response.box_plots || [],
            heatmap: response.heatmap,
            totalCount: response.total_count,
            boundaries: boundariesMap
          },

          // Add dataset metadata
          datasetInfo: {
            id: datasetInfo.id,
            name: datasetInfo.file_name,
            totalRows: datasetInfo.total_rows,
            fileId: datasetInfo.file_id
          }
        };

        // Save to Zustand store
        const { setBrushSelection } = useBrushStore.getState();
        setBrushSelection(datasetInfo.id, brushSelection);

        // Track that we just applied this brush so we don't re-apply it
        lastAppliedBrushTimestamp.current = brushSelection.timestamp;

        // Update brush info ref
        brushInfoRef.current = {
          count: response.total_count,
          selection: brushSelection
        };

        // Clear the drawn rectangle since it's now applied
        currentBrushRectRef.current = null;

        console.log('✅ Brush selection saved to store');
        setBrushAppliedTimestamp(Date.now()); // Trigger re-render of chartData
      }
    } catch (err) {
      console.error('❌ Error applying brush selection:', err);
      setError('Error al aplicar la selección');
    } finally {
      setIsApplyingSelection(false);
    }
  };

  // Save chart as image using ECharts built-in method
  const handleSaveAsImage = () => {
    if (!chartRef.current) return;
    
    try {
      const chartInstance = chartRef.current.getEchartsInstance();
      
      // Get current theme from document
      const isDarkMode = document.documentElement.classList.contains('dark');
     
      const backgroundColor = isDarkMode ? 'hsl(222.2, 84%, 4.9%)' : 'hsl(0, 0%, 100%)';
      
      // Get image data URL with high pixel ratio for better quality
      const imageDataURL = chartInstance.getDataURL({
        type: 'png',
        pixelRatio:2,
        backgroundColor: backgroundColor
      });
      
      // Create download link
      const link = document.createElement('a');
      const fileName = `${datasetInfo?.file_name || 'chart'}_${selectedXAxis}_${selectedYAxis}_${selectedValueColumn}.png`;
      link.href = imageDataURL;
      link.download = fileName;
      
      // Trigger download
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      console.log('✅ Chart saved as image:', fileName);
    } catch (error) {
      console.error('❌ Error saving chart as image:', error);
      setError('Error al guardar la imagen');
    }
  };

  // Toggle OLS regression line visibility
  const toggleRegressionLine = () => {
    setShowRegressionLine(prev => !prev);
  };

  // Toggle RMA regression line visibility
  const toggleRMALine = () => {
    setShowRMALine(prev => !prev);
  };

  // Toggle equations visibility
  const toggleEquations = () => {
    setShowEquations(prev => !prev);
  };

  // Opciones de chart de echarts.
  const chartOptions = useMemo(() => {
    if (!chartData || chartData.length === 0 || !datasetInfo) return null;

    // Get boundaries for automatic scaling
    const getBoundaryForColumn = (columnName: string) => {
      if (!dataset?.data_boundaries) return null;
      return dataset.data_boundaries.find(b => b.column_name === columnName);
    };

    const valueBoundary = getBoundaryForColumn(selectedValueColumn);


    return {
      animation: false,
      title: {
        text: `${datasetInfo.file_name} - Visualización 2D`,
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      visualMap: {
        min: valueBoundary?.min_value ?? 0,
        max: valueBoundary?.max_value ?? 100,
        dimension: 2,
        orient: 'vertical',
        right: 10,
        top: 'center',
        text: ['ALTO', 'BAJO'],
        calculable: true,
        realtime: true,
        inRange: {
          color: ['#1e3a8a', '#1e40af', '#3b82f6', '#60a5fa', '#fbbf24', '#f59e0b', '#ea580c', '#dc2626', '#b91c1c', '#7f1d1d'],
        },
        textStyle: {
          color: '#374151'
        }
      },
      tooltip: {
        trigger: 'item',
        axisPointer: {
          type: 'cross'
        },
        formatter: function(params: {data: number[], dataIndex: number}) {
          const data = params.data;
          return `
            <strong>Punto ${params.dataIndex + 1}</strong><br/>
            ${selectedXAxis}: ${data[0]}<br/>
            ${selectedYAxis}: ${data[1]}<br/>
            ${selectedValueColumn}: ${data[2]}
          `;
        }
      },
      xAxis: {
        name: selectedXAxis,
        type: 'value',
        nameLocation: 'middle',
        nameGap: 30,
        scale:true

      },
      yAxis: {
        name: selectedYAxis,
        type: 'value',
        nameLocation: 'middle',
        scale:true,
        nameGap: 50,

      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'none',  // Changed to 'none' so regression line stays visible
          throttle: 30,
        },
        {
          type: 'inside',
          yAxisIndex: 0,
          filterMode: 'none',  // Changed to 'none' so regression line stays visible
          throttle: 30,
        }
      ],
      // Toolbox disabled - using custom controls instead
      toolbox: {
        show: false,
      },
      // Opciones de brush de echarts.
      brush: {
        toolbox: ['rect', 'clear'],
        xAxisIndex: 0,
        yAxisIndex: 0,
        seriesIndex: [],  // Don't connect brush to any series - always use manual "Apply Selection" button
        throttleType: 'debounce',
        throttleDelay: 1000,
        brushMode: 'single',           // Only one brush area at a time
        brushLink: 'none',             // Don't link brush to other components (prevents filtering lag)
        z:10000,
        inBrush: {                     // Don't change appearance of selected points (performance)
          opacity: 1
        },
        outOfBrush: {                  // Don't dim unselected points (prevents lag in large mode)
          opacity: 1
        },
        brushStyle: {
          borderWidth: 3,              // Thicker border for better visibility
          borderColor: 'rgba(251, 146, 60, 1)',    // Bright orange border - full opacity
          color: 'rgba(251, 146, 60, 0.25)'        // Orange fill - slightly more opaque
        },
        transformable: true,
        removeOnClick: false
      },
      series: [
        {
          name: `${selectedValueColumn} values`,
          type: 'scatter',
          data: chartData,
          animation: false,
          selectedMode: false,
          select: {
            disabled: true
          },
          itemStyle: {
            opacity: 0.8,
            borderWidth: 0,
            animation: false
          },
          emphasis: {
            disabled: true,
            animation: false,
            itemStyle: {
              animation: false,
              borderColor: '#000',
              borderWidth: 1,
              opacity: 1.0
            }
          },
          large: true,
          largeThreshold: 20000,
          progressive: 20000,
          progressiveThreshold: 20000,
          symbolSize: 4,
          dimensions: [selectedXAxis, selectedYAxis, selectedValueColumn],
        },
        // Add OLS regression line series conditionally
        ...(showRegressionLine && regressionLineData ? [{
          name: 'OLS Regression',
          type: 'line',
          data: regressionLineData,
          animation: false,
          symbol: 'none',
          lineStyle: {
            color: '#ef4444',
            width: 3,
            type: 'solid'
          },
          tooltip: {
            show: false
          },
          z: 100 // Ensure line is drawn on top
        }] : []),
        // Add RMA regression line series conditionally
        ...(showRMALine && rmaLineData ? [{
          name: 'RMA Regression',
          type: 'line',
          data: rmaLineData,
          animation: false,
          symbol: 'none',
          lineStyle: {
            color: '#8b5cf6',
            width: 3,
            type: 'dashed'
          },
          tooltip: {
            show: false
          },
          z: 100 // Ensure line is drawn on top
        }] : [])
      ],
      // Add regression equations as graphic elements
      graphic: showEquations ? [
        // Build equations text
        ...(olsRegression ? [{
          type: 'text',
          left: 20,
          top: 50,
          style: {
            text: `OLS: y = ${olsRegression.slope.toFixed(4)}x + ${olsRegression.intercept.toFixed(4)}`,
            fontSize: 14,
            fontWeight: 'bold',
            fill: '#ef4444',
          },
          z: 1000
        }] : []),
        ...(rmaRegression && showRMALine ? [{
          type: 'text',
          left: 20,
          top: 70,
          style: {
            text: `RMA: y = ${rmaRegression.slope.toFixed(4)}x + ${rmaRegression.intercept.toFixed(4)}`,
            fontSize: 14,
            fontWeight: 'bold',
            fill: '#8b5cf6',
          },
          z: 1000
        }] : [])
      ] : []
    };
  }, [chartData, selectedXAxis, selectedYAxis, selectedValueColumn, dataset, datasetInfo, showRegressionLine, regressionLineData, showRMALine, rmaLineData, showEquations, olsRegression, rmaRegression]);

  // Memoized chart component that only re-renders when chart props actually change
  const MemoizedChart = useMemo(() => {
    return (
      <ReactECharts
        ref={chartRef}
        option={chartOptions}
        style={{ height: '100%', width: '100%', minHeight: '400px' }}
        showLoading={refetching}
        loadingOption={{ text: 'Cargando datos...' }}
        opts={{ renderer: 'canvas'}}
        onEvents={{
          'brushSelected': (params: {batch?: {areas?: {coordRange?: number[][]}[], selected?: {dataIndex: number[]}[]}[]}) => {
            // Ignore brush events triggered by programmatic actions
            if (isApplyingBrushProgrammatically.current) {
              console.log('🔍 Ignoring brush event - programmatic application in progress');
              return;
            }

            // Debounce brush updates to prevent rapid-fire events
            const now = Date.now();
            if (now - lastBrushUpdateTime.current < BRUSH_UPDATE_DEBOUNCE) {
              console.log('🔍 Ignoring brush event - debounced');
              return;
            }

            console.log('🔍 Processing brush event', params);

            if (params.batch && params.batch.length > 0) {
              const batch = params.batch[0];

              // Extract coordinate bounds and selected data
              if (batch.areas && batch.areas.length > 0) {
                const area = batch.areas[0];

                // Extract rectangle coordinates (available even in large mode)
                if (area.coordRange && area.coordRange.length >= 2) {
                  const xRange = area.coordRange[0]; // [x1, x2] in data coordinates
                  const yRange = area.coordRange[1]; // [y1, y2] in data coordinates

                  const rectangle = {
                    x1: xRange[0],
                    x2: xRange[1],
                    y1: yRange[0],
                    y2: yRange[1]
                  };

                  console.log('✅ Brush rectangle captured:', rectangle);

                  // Store rectangle - user will click "Apply Selection" button
                  currentBrushRectRef.current = rectangle;

                  // Update last brush time
                  lastBrushUpdateTime.current = now;

                  // Trigger re-render to show "Apply Selection" button
                  setBrushAppliedTimestamp(Date.now());
                }
              }
              // Note: We intentionally don't clear the brush from the store when
              // batch.areas is empty, because zoom/pan operations trigger this.
            }
          }
        }}
        onChartReady={handleChartReady}
      />
    );
  }, [chartOptions, refetching]); // Only re-create when chartOptions or refetching changes

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
      {/* Header with back button (only in standalone mode) */}
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

      {/* Chart */}
      <div className="flex-1 relative" style={{ minHeight: '300px' }}>
        {chartData && chartData.length > 0 && chartOptions ? (
          <>
            {MemoizedChart}

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

              {/* Save as Image Button */}
              <Button
                variant="outline"
                size="sm"
                onClick={handleSaveAsImage}
                title="Guardar como imagen"
                className="shadow-lg h-8"
              >
                <Camera className="h-3 w-3" />
              </Button>

              {/* OLS Regression Line Toggle */}
              <Button
                variant={showRegressionLine ? "default" : "outline"}
                size="sm"
                onClick={toggleRegressionLine}
                title={showRegressionLine ? "Ocultar regresión OLS" : "Mostrar regresión OLS"}
                className="shadow-lg h-8"
              >
                <TrendingUp className="h-3 w-3" />
              </Button>

              {/* RMA Regression Line Toggle */}
              <Button
                variant={showRMALine ? "default" : "outline"}
                size="sm"
                onClick={toggleRMALine}
                title={showRMALine ? "Ocultar regresión RMA" : "Mostrar regresión RMA"}
                className="shadow-lg h-8"
              >
                <Split className="h-3 w-3" />
              </Button>

              {/* Show Equations Toggle */}
              <Button
                variant={showEquations ? "default" : "outline"}
                size="sm"
                onClick={toggleEquations}
                title={showEquations ? "Ocultar ecuaciones" : "Mostrar ecuaciones"}
                className="shadow-lg h-8"
              >
                <Type className="h-3 w-3" />
              </Button>

              {currentBrushRectRef.current && (
                <>
                  <Button
                    variant="default"
                    size="sm"
                    onClick={applyBrushSelection}
                    disabled={isApplyingSelection}
                    className="shadow-lg bg-blue-600 hover:bg-blue-700 h-8 text-xs"
                  >
                    {isApplyingSelection ? '⏳' : '✓'}
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

export default DatasetViewer;