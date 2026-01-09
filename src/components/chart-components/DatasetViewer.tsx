import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import Plot from 'react-plotly.js';
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
 * Migrated from ECharts to Plotly.js
 */
const DatasetViewer: React.FC<DatasetViewerProps> = ({ DatasetInfo, onBack }) => {

  // Get dataset info from props or Zustand store
  const datasetInfoFromStore = useBrushStore((state) => state.selectedDataset);
  const datasetDataFromStore = useBrushStore((state) => state.datasetData);
  const globalColumnsFromStore = useBrushStore((state) => state.globalColumns);
  const setGlobalColumnsInStore = useBrushStore((state) => state.setGlobalColumns);

  const datasetInfo = DatasetInfo || datasetInfoFromStore; // Use prop if provided, otherwise use store

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
  const [brushAppliedTimestamp, setBrushAppliedTimestamp] = useState(0);
  const [isApplyingSelection, setIsApplyingSelection] = useState(false);
  const [isBrushMode, setIsBrushMode] = useState(false);
  const [showRegressionLine, setShowRegressionLine] = useState(false);
  const [showRMALine, setShowRMALine] = useState(false);
  const [showEquations, setShowEquations] = useState(false);
  const plotRef = useRef<any>(null);

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
  const brushInfoRef = useRef<{ count: number; selection: BrushSelection } | null>(null);

  // Update ref when columns or dataset change
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

  // Listen for brush selection being cleared from external source
  useEffect(() => {
    if (!datasetInfo) return;

    const { getBrushSelection } = useBrushStore.getState();
    const selection = getBrushSelection(datasetInfo.id);

    if (!selection) {
      currentBrushRectRef.current = null;
      setIsBrushMode(false);
      setBrushAppliedTimestamp(Date.now());
    }
  }, [datasetInfo]);

  // Poll for brush selection changes
  useEffect(() => {
    if (!datasetInfo) return;

    const interval = setInterval(() => {
      const { getBrushSelection } = useBrushStore.getState();
      const selection = getBrushSelection(datasetInfo.id);

      const currentTimestamp = brushInfoRef.current?.selection.timestamp;
      const newTimestamp = selection?.timestamp;

      if (currentTimestamp !== newTimestamp) {
        updateBrushInfoRef();
        setBrushAppliedTimestamp(Date.now());

        if (!selection && currentBrushRectRef.current) {
          currentBrushRectRef.current = null;
          setIsBrushMode(false);
        }
      }
    }, 500);

    return () => clearInterval(interval);
  }, [datasetInfo, updateBrushInfoRef]);

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

  // Calculate regressions
  const olsRegression = useMemo(() => {
    if (!chartData) return null;
    return calculateLinearRegression(chartData);
  }, [chartData, calculateLinearRegression]);

  const rmaRegression = useMemo(() => {
    if (!chartData) return null;
    return calculateRMARegression(chartData);
  }, [chartData, calculateRMARegression]);

  // Update global columns in store when local columns change
  useEffect(() => {
    if (!DatasetInfo && datasetInfo) {
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

  const loadLiveColumns = async () => {
    if (!datasetInfo) return;

    try {
      setLoadingColumns(true);

      const response = await window.grpc.getFileStatistics({
        file_id: datasetInfo.file_id,
        columns: []
      });

      const columns = response.statistics?.map((stat: {column_name: string}) => stat.column_name) || [];
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
      setTimetook((performance.now() - startTime));

      if (response.binary_data && response.data_length > 0) {
        setDataset(response);

        if (!DatasetInfo && response.binary_data && response.data_length > 0) {
          const { getBrushSelection } = useBrushStore.getState();
          const existingBrush = getBrushSelection(datasetInfo.id);

          const shouldPreserveBrush = existingBrush &&
            existingBrush.selectedIndices.length < datasetInfo.total_rows;

          if (!shouldPreserveBrush) {
            const fullData = new Float32Array(
              response.binary_data.buffer,
              response.binary_data.byteOffset,
              response.data_length
            );

            const xBoundary = response.data_boundaries?.find(b => b.column_name === selectedXAxis);
            const yBoundary = response.data_boundaries?.find(b => b.column_name === selectedYAxis);

            const boundariesMap: Record<string, DataBoundaries> = {};
            if (response.data_boundaries) {
              response.data_boundaries.forEach(boundary => {
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

  // Toggle brush drawing mode
  const toggleBrushMode = () => {
    setIsBrushMode(!isBrushMode);
  };

  // Clear the drawn rectangle
  const clearDrawnRectangle = () => {
    currentBrushRectRef.current = null;
    setIsBrushMode(false);
    setBrushAppliedTimestamp(Date.now());
  };

  // Apply brush selection
  const applyBrushSelection = async () => {
    if (!currentBrushRectRef.current || !datasetInfo) {
      console.warn('No brush rectangle or dataset info to apply');
      return;
    }

    try {
      setIsApplyingSelection(true);
      const rect = currentBrushRectRef.current;

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
          response.data_boundaries.forEach(boundary => {
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

        lastAppliedBrushTimestamp.current = brushSelection.timestamp;

        brushInfoRef.current = {
          count: response.total_count,
          selection: brushSelection
        };

        currentBrushRectRef.current = null;
        setBrushAppliedTimestamp(Date.now());
      }
    } catch (err) {
      console.error('Error applying brush selection:', err);
      setError('Error al aplicar la selección');
    } finally {
      setIsApplyingSelection(false);
    }
  };

  // Handle Plotly selection event
  const handlePlotlySelection = useCallback((event: any) => {
    if (!event || !event.range) return;

    const { x, y } = event.range;

    if (x && y) {
      const rectangle = {
        x1: Math.min(x[0], x[1]),
        x2: Math.max(x[0], x[1]),
        y1: Math.min(y[0], y[1]),
        y2: Math.max(y[0], y[1])
      };

      currentBrushRectRef.current = rectangle;
      setBrushAppliedTimestamp(Date.now());
    }
  }, []);

  // Toggle regression line visibility
  const toggleRegressionLine = () => setShowRegressionLine(prev => !prev);
  const toggleRMALine = () => setShowRMALine(prev => !prev);
  const toggleEquations = () => setShowEquations(prev => !prev);

  // Generate Plotly data and layout
  const plotConfig = useMemo(() => {
    if (!chartData || chartData.length === 0 || !datasetInfo) return null;

    // Parse Float32Array into separate arrays
    const xData: number[] = [];
    const yData: number[] = [];
    const valueData: number[] = [];

    for (let i = 0; i < chartData.length; i += 3) {
      xData.push(chartData[i]);
      yData.push(chartData[i + 1]);
      valueData.push(chartData[i + 2]);
    }

    // Get boundaries for color scaling
    const getBoundaryForColumn = (columnName: string) => {
      if (!dataset?.data_boundaries) return null;
      return dataset.data_boundaries.find(b => b.column_name === columnName);
    };

    const valueBoundary = getBoundaryForColumn(selectedValueColumn);
    const xBoundary = getBoundaryForColumn(selectedXAxis);

    const minVal = valueBoundary?.min_value ?? Math.min(...valueData);
    const maxVal = valueBoundary?.max_value ?? Math.max(...valueData);

    // Main scatter trace - use scattergl for large datasets
    const traces: Plotly.Data[] = [{
      type: isLargeDataset ? 'scattergl' : 'scatter',
      mode: 'markers',
      x: xData,
      y: yData,
      marker: {
        color: valueData,
        colorscale: [
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
        cmin: minVal,
        cmax: maxVal,
        size: isLargeDataset ? 2 : 4,
        opacity: isLargeDataset ? 0.7 : 0.8,
        colorbar: {
          title: {
            text: selectedValueColumn,
            side: 'right'
          },
          thickness: 15,
          len: 0.8
        }
      },
      hovertemplate: `<b>Punto</b><br>${selectedXAxis}: %{x:.4f}<br>${selectedYAxis}: %{y:.4f}<br>${selectedValueColumn}: %{marker.color:.4f}<extra></extra>`,
      name: `${selectedValueColumn} values`
    }];

    // Add OLS regression line if enabled
    if (showRegressionLine && olsRegression && xBoundary) {
      const x1 = xBoundary.min_value;
      const x2 = xBoundary.max_value;
      const y1 = olsRegression.slope * x1 + olsRegression.intercept;
      const y2 = olsRegression.slope * x2 + olsRegression.intercept;

      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: [x1, x2],
        y: [y1, y2],
        line: {
          color: '#ef4444',
          width: 3
        },
        name: 'OLS Regression',
        hoverinfo: 'skip'
      });
    }

    // Add RMA regression line if enabled
    if (showRMALine && rmaRegression && xBoundary) {
      const x1 = xBoundary.min_value;
      const x2 = xBoundary.max_value;
      const y1 = rmaRegression.slope * x1 + rmaRegression.intercept;
      const y2 = rmaRegression.slope * x2 + rmaRegression.intercept;

      traces.push({
        type: 'scatter',
        mode: 'lines',
        x: [x1, x2],
        y: [y1, y2],
        line: {
          color: '#8b5cf6',
          width: 3,
          dash: 'dash'
        },
        name: 'RMA Regression',
        hoverinfo: 'skip'
      });
    }

    // Build annotations for equations
    const annotations: Partial<Plotly.Annotations>[] = [];
    if (showEquations && olsRegression) {
      annotations.push({
        x: 0.02,
        y: 0.98,
        xref: 'paper',
        yref: 'paper',
        text: `OLS: y = ${olsRegression.slope.toFixed(4)}x + ${olsRegression.intercept.toFixed(4)}`,
        showarrow: false,
        font: {
          size: 12,
          color: '#ef4444'
        },
        bgcolor: 'rgba(255,255,255,0.8)',
        borderpad: 4
      });
    }
    if (showEquations && rmaRegression && showRMALine) {
      annotations.push({
        x: 0.02,
        y: 0.93,
        xref: 'paper',
        yref: 'paper',
        text: `RMA: y = ${rmaRegression.slope.toFixed(4)}x + ${rmaRegression.intercept.toFixed(4)}`,
        showarrow: false,
        font: {
          size: 12,
          color: '#8b5cf6'
        },
        bgcolor: 'rgba(255,255,255,0.8)',
        borderpad: 4
      });
    }

    const layout: Partial<Plotly.Layout> = {
      title: {
        text: `${datasetInfo.file_name} - Visualización 2D`,
        font: {
          size: 16,
          weight: 700
        },
        x: 0.5
      },
      xaxis: {
        title: {
          text: selectedXAxis
        },
        zeroline: false
      },
      yaxis: {
        title: {
          text: selectedYAxis
        },
        zeroline: false
      },
      margin: {
        l: 60,
        r: 80,
        t: 50,
        b: 50
      },
      autosize: true,
      hovermode: 'closest',
      hoverlabel: {
        bgcolor: 'white',
        font: { size: 11 }
      },
      dragmode: isBrushMode ? 'select' : 'zoom',
      selectdirection: 'any',
      showlegend: false,
      annotations: annotations
    };

    const config: Partial<Plotly.Config> = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d'],
      toImageButtonOptions: {
        format: 'png',
        filename: `${datasetInfo?.file_name || 'chart'}_${selectedXAxis}_${selectedYAxis}_${selectedValueColumn}`,
        scale: 2
      },
      scrollZoom: true
    };

    return { data: traces, layout, config };
  }, [chartData, selectedXAxis, selectedYAxis, selectedValueColumn, dataset, datasetInfo, showRegressionLine, olsRegression, showRMALine, rmaRegression, showEquations, isLargeDataset, isBrushMode]);

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
        {plotConfig ? (
          <>
            <Plot
              ref={plotRef}
              data={plotConfig.data}
              layout={plotConfig.layout}
              config={plotConfig.config}
              style={{ width: '100%', height: '100%', minHeight: '400px' }}
              useResizeHandler={true}
              onSelected={handlePlotlySelection}
              onSelecting={handlePlotlySelection}
            />

            {/* Chart Controls */}
            <div className="absolute top-2 right-2 z-10 flex flex-col gap-2">
              {/* Brush Mode Toggle */}
              <Button
                variant={isBrushMode ? "default" : "outline"}
                size="sm"
                onClick={toggleBrushMode}
                title={isBrushMode ? "Modo zoom" : "Modo selección"}
                className="shadow-lg h-8"
              >
                {isBrushMode ? <Brush className="h-3 w-3" /> : <Activity className="h-3 w-3" />}
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
                    title="Limpiar selección"
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
