import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BarChart3, Activity, Brush, X, Filter, RefreshCw } from 'lucide-react';
import { GetDatasetDataResponse, DatasetInfo } from '@/generated/projects';
import { useBrushStore } from '@/stores/brushStore';

/**
 * Propiedades del componente DatasetViewer
 * Define los parámetros necesarios para visualizar un dataset
 */
interface DatasetViewerProps {
  DatasetInfo: DatasetInfo;    // Información completa del dataset
  onBack: () => void;     // Función callback para regresar a la vista anterior
}
/**
 * Componente principal para visualizar datasets geoespaciales
 * Permite seleccionar ejes X/Y/Valor y muestra gráfico de dispersión 2D
 * con escalado automático basado en límites calculados en el backend
 */
const DatasetViewer: React.FC<DatasetViewerProps> = ({ DatasetInfo, onBack }) => {

  const datasetInfo = DatasetInfo; // For consistency with the rest of the code

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
    return datasetInfo.column_mappings
      ?.filter(mapping => mapping.column_type !== 3) // Not UNUSED
      ?.map(mapping => mapping.column_name) || [];
  }, [liveColumns, datasetInfo.column_mappings]);

  // Find coordinate columns from mappings
  const coordinateColumns = useMemo(() => {
    return {
      x: datasetInfo.column_mappings?.find(m => m.mapped_field === 'x')?.column_name || 'x',
      y: datasetInfo.column_mappings?.find(m => m.mapped_field === 'y')?.column_name || 'y',
      z: datasetInfo.column_mappings?.find(m => m.mapped_field === 'z')?.column_name || 'z'
    };
  }, [datasetInfo.column_mappings]);

  const [dataset, setDataset] = useState<GetDatasetDataResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [timetook, setTimetook] = useState(0);
  const [refetching, setRefetching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Initialize selected columns with coordinate mappings
  const [selectedValueColumn, setSelectedValueColumn] = useState<string>(() =>
    coordinateColumns.z || 'z'
  );
  const [selectedXAxis, setSelectedXAxis] = useState<string>(() =>
    coordinateColumns.x || 'x'
  );
  const [selectedYAxis, setSelectedYAxis] = useState<string>(() =>
    coordinateColumns.y || 'y'
  );
  const [showOnlyBrushed, setShowOnlyBrushed] = useState(false);
  const [, forceUpdate] = useState({}); // Minimal state for forcing UI updates without affecting chart
  const [isApplyingSelection, setIsApplyingSelection] = useState(false); // Separate state for backend filtering
  const [isBrushMode, setIsBrushMode] = useState(false); // Track if brush mode is active
  const chartRef = useRef<ReactECharts>(null);

  // Flag to prevent infinite loop when applying brush programmatically
  const isApplyingBrushProgrammatically = useRef(false);

  // Track last brush update to prevent rapid-fire updates
  const lastBrushUpdateTime = useRef(0);
  const BRUSH_UPDATE_DEBOUNCE = 500; // milliseconds

  // Large dataset mode threshold
  const LARGE_THRESHOLD = 20000;

  // Check if we're in large dataset mode
  const isLargeDataset = useMemo(() => {
    return (dataset?.total_count || 0) > LARGE_THRESHOLD;
  }, [dataset?.total_count]);

  // Track current brush rectangle for large dataset mode
  const currentBrushRectRef = useRef<{x1: number; x2: number; y1: number; y2: number} | null>(null);

  // Use a ref to store brush info so it doesn't trigger re-renders
  // Only read from store when explicitly needed (filter toggle, render badge)
  const brushInfoRef = useRef<{ count: number; selection: any } | null>(null);

  // Update ref when columns or dataset change, or manually on filter toggle
  const updateBrushInfoRef = useCallback(() => {
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
  }, [datasetInfo.id, selectedXAxis, selectedYAxis, selectedValueColumn]);

  // Update brush info ref on mount and when columns change
  useEffect(() => {
    updateBrushInfoRef();
  }, [updateBrushInfoRef]);

  // Full dataset - never changes based on brush
  const fullData = useMemo(() => {
    if (!dataset || !selectedValueColumn || !selectedXAxis || !selectedYAxis || !dataset.binary_data) {
      return null;
    }
    return new Float32Array(dataset.binary_data.buffer, dataset.binary_data.byteOffset, dataset.data_length);
  }, [dataset, selectedValueColumn, selectedXAxis, selectedYAxis]);

  // Chart data - switches between full and filtered based on toggle
  const chartData = useMemo(() => {
    if (!fullData) return null;

    // If filter is enabled and we have a brush selection, show only brushed points
    if (showOnlyBrushed && brushInfoRef.current) {
      return brushInfoRef.current.selection.selectedPoints;
    }

    return fullData;
  }, [fullData, showOnlyBrushed]); // No dependency on brush timestamp to prevent re-render

  // Load live column list from file statistics on mount
  useEffect(() => {
    loadLiveColumns();
  }, [datasetInfo.file_id]);

  useEffect(() => {
    loadDataset();
  }, [datasetInfo.id, selectedXAxis, selectedYAxis, selectedValueColumn]);


  // Apply brush selection from store ONLY on initial mount when full data is ready
  // Don't apply brush when showing filtered data
  useEffect(() => {
    if (!chartRef.current || !fullData || showOnlyBrushed) return;

    // Get the current brush selection from store imperatively
    const { getBrushSelection } = useBrushStore.getState();
    const selection = getBrushSelection(datasetInfo.id);
    if (!selection) return;

    // Only apply if columns match
    if (
      selection.columns.xAxis !== selectedXAxis ||
      selection.columns.yAxis !== selectedYAxis ||
      selection.columns.value !== selectedValueColumn
    ) {
      return;
    }

    const chartInstance = chartRef.current.getEchartsInstance();

    // Small delay to ensure chart is fully rendered
    const timer = setTimeout(() => {
      try {

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
        console.error('Error applying initial brush:', err);
        isApplyingBrushProgrammatically.current = false;
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [fullData, showOnlyBrushed]); // Don't apply brush when filter is active

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
    try {
      // Use different loading state for refetches vs initial load
      if (dataset) {
        setRefetching(true);
      } else {
        setLoading(true);
      }
      setError(null);

      // Get dataset data with binary format - request currently selected columns

      const timetook = performance.now();
      const response = await window.autoGrpc.getDatasetData({
        dataset_id: datasetInfo.id,
        columns: [selectedXAxis, selectedYAxis, selectedValueColumn]
      }) as GetDatasetDataResponse;
      setTimetook((performance.now() - timetook));

      if (response.binary_data && response.data_length > 0) {
        setDataset(response);
      } else {
        console.error('❌ Error loading dataset:', err);
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

  // Clear brush selection
  const clearBrushSelection = () => {
    // Set flag and clear from store first
    isApplyingBrushProgrammatically.current = true;
    const { clearBrushSelection: clearFromStore } = useBrushStore.getState();
    clearFromStore(datasetInfo.id);
    brushInfoRef.current = null;
    currentBrushRectRef.current = null; // Also clear rectangle
    setShowOnlyBrushed(false);
    setIsBrushMode(false);
    updateBrushInfoRef();

    // Also clear the brush visually on the chart
    if (chartRef.current) {
      chartRef.current.getEchartsInstance().dispatchAction({
        type: 'brush',
        command: 'clear',
        areas: []
      });
    }

    // Reset flag after a delay
    setTimeout(() => {
      isApplyingBrushProgrammatically.current = false;
    }, 100);

  };

  // Apply brush selection (works for both small and large datasets)
  const applyBrushSelection = async () => {
    if (!currentBrushRectRef.current) {
      console.warn('⚠️ No brush rectangle to apply');
      return;
    }

    try {
      setIsApplyingSelection(true);
      const rect = currentBrushRectRef.current;


      const timetook = performance.now();
      const response = await window.autoGrpc.getDatasetData({
        dataset_id: datasetInfo.id,
        columns: [selectedXAxis, selectedYAxis, selectedValueColumn],
        bounding_box: [rect.x1, rect.x2, rect.y1, rect.y2]
      }) as GetDatasetDataResponse;


      if (response.binary_data && response.data_length > 0) {
        // Convert binary data to Float32Array
        const filteredData = new Float32Array(
          response.binary_data.buffer,
          response.binary_data.byteOffset,
          response.data_length
        );

        // Convert data_boundaries array to Record<string, DataBoundaries>
        const boundariesMap: Record<string, any> = {};
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

        // Update brush info ref
        brushInfoRef.current = {
          count: response.total_count,
          selection: brushSelection
        };

        console.log('✅ Brush selection saved to store');
        forceUpdate({}); // Update UI to show badge
      }
    } catch (err) {
      console.error('❌ Error applying brush selection:', err);
      setError('Error al aplicar la selección');
    } finally {
      setIsApplyingSelection(false);
    }
  };

  // Generate chart options - memoized for performance
  const chartOptions = useMemo(() => {
    if (!chartData || chartData.length === 0) return null;

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
          filterMode: 'empty',
          throttle: 30,
        },
        {
          type: 'inside',
          yAxisIndex: 0,
          filterMode: 'empty',
          throttle: 30,
        }
      ],
      // Toolbox disabled - using custom controls instead
      toolbox: {
        show: false
      },
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
      series: [{
        name: `${selectedValueColumn} values`,
        type: 'scatter',
        data: chartData,
        animation: false,
        selectedMode: false,      // CRITICAL: Disable selection interaction in large mode
        select: {                 // Disable visual selection changes
          disabled: true
        },
        itemStyle: {
          opacity: 0.8,
          borderWidth: 0,
          animation: false
        },
        emphasis: {
          disabled: true,         // Disable hover/emphasis in large mode (performance)
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
      }]
    };
  }, [chartData, selectedXAxis, selectedYAxis, selectedValueColumn, dataset, datasetInfo.file_name]);

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
              return;
            }

            // Debounce brush updates to prevent rapid-fire events
            const now = Date.now();
            if (now - lastBrushUpdateTime.current < BRUSH_UPDATE_DEBOUNCE) {
              return;
            }

            if (params.batch && params.batch.length > 0) {
              const batch = params.batch[0];

              // Extract coordinate bounds and selected data
              if (batch.areas && batch.areas.length > 0) {
                const area = batch.areas[0];
                const selectedData = batch.selected && batch.selected.length > 0 ? batch.selected[0].dataIndex : [];

                console.log('🔍 Brush event data:', {
                  hasAreas: !!batch.areas,
                  areasLength: batch.areas?.length,
                  hasSelected: !!batch.selected,
                  selectedLength: batch.selected?.length,
                  selectedDataLength: selectedData.length,
                  isLargeDataset,
                  totalPoints: dataset?.total_count,
                  threshold: LARGE_THRESHOLD
                });

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

                  // Store rectangle - user will click "Apply Selection" button
                  currentBrushRectRef.current = rectangle;

                  // Force re-render to show "Apply Selection" button
                  forceUpdate({});
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
            <Button variant="outline" onClick={onBack}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Volver a Proyectos
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{datasetInfo.file_name}</h2>
            <h2> Tiempo de carga: {timetook.toFixed(2)} ms</h2>
            <p className="text-muted-foreground">
              {dataset?.total_count?.toLocaleString() || datasetInfo.total_rows.toLocaleString()} puntos de datos
            </p>
          </div>
        </div>
        <div className="flex items-center space-x-2">
          {/* Large Dataset Mode Indicator */}
          {isLargeDataset && (
            <Badge variant="secondary" className="px-3 py-1">
              📦 Modo Dataset Grande ({dataset?.total_count?.toLocaleString()} puntos)
            </Badge>
          )}

          {/* Brush Active Badge */}
          {brushInfoRef.current && brushInfoRef.current.count > 0 && (
            <>
              <Badge variant="default" className="px-3 py-1 bg-blue-600 text-white">
                <Brush className="mr-2 h-4 w-4" />
                Selección Activa ({brushInfoRef.current.count.toLocaleString()} puntos)
              </Badge>
              <Button
                variant={showOnlyBrushed ? "default" : "outline"}
                size="sm"
                onClick={() => {
                  // Update brush info ref before toggling to ensure we have latest data
                  updateBrushInfoRef();
                  setShowOnlyBrushed(!showOnlyBrushed);
                }}
                title="Mostrar solo puntos seleccionados"
              >
                <Filter className="h-4 w-4" />
              </Button>
            </>
          )}

          <Badge variant="outline" className="px-3 py-1">
            <Activity className="mr-2 h-4 w-4" />
            Visualización de Dataset
          </Badge>
        </div>
      </div>

      {/* Controls */}
      <Card className="flex-shrink-0">
        <CardHeader>
          <CardTitle className="flex items-center">
            <BarChart3 className="mr-2 h-5 w-5" />
            Controles de Visualización
          </CardTitle>
          <CardDescription>
            Configura qué datos mostrar en el gráfico
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* X Axis Selection */}
            <div>
              <Label className="text-sm font-medium">Eje X</Label>
              <Select
                value={selectedXAxis}
                onValueChange={setSelectedXAxis}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar eje X" />
                </SelectTrigger>
                <SelectContent>
                  {availableColumns.map((column) => {
                    const mapping = datasetInfo.column_mappings?.find(m => m.column_name === column);
                    return (
                      <SelectItem key={column} value={column}>
                        {column}
                        {mapping?.is_coordinate && ` (${mapping.mapped_field?.toUpperCase()})`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            
            {/* Y Axis Selection */}
            <div>
              <Label className="text-sm font-medium">Eje Y</Label>
              <Select
                value={selectedYAxis}
                onValueChange={setSelectedYAxis}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar eje Y" />
                </SelectTrigger>
                <SelectContent>
                  {availableColumns.map((column) => {
                    const mapping = datasetInfo.column_mappings?.find(m => m.column_name === column);
                    return (
                      <SelectItem key={column} value={column}>
                        {column}
                        {mapping?.is_coordinate && ` (${mapping.mapped_field?.toUpperCase()})`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            
            {/* Value Column Selection */}
            <div>
              <Label className="text-sm font-medium">Columna de Valores</Label>
              <Select
                value={selectedValueColumn}
                onValueChange={setSelectedValueColumn}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar columna de valores" />
                </SelectTrigger>
                <SelectContent>
                  {availableColumns.map((column) => {
                    const mapping = datasetInfo.column_mappings?.find(m => m.column_name === column);
                    return (
                      <SelectItem key={column} value={column}>
                        {column}
                        {mapping?.is_coordinate && ` (${mapping.mapped_field?.toUpperCase()})`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="flex items-start justify-between gap-4">
            <div className="text-sm text-muted-foreground space-y-1 flex-1">
              <p>Selecciona qué columnas usar para el eje X, eje Y y valores de los puntos. Puedes usar cualquier columna para cualquier eje.</p>
              <p className="text-blue-600 font-medium flex items-center">
                <Brush className="mr-1 h-3 w-3" />
                Activa el modo dibujo, dibuja un rectángulo y haz clic en &ldquo;Aplicar Selección&rdquo; para filtrar los puntos.
              </p>
              { brushInfoRef.current && (
                <p className="text-green-600 font-medium flex items-center">
                  ✓ La selección se comparte entre todas las vistas del mismo dataset con las mismas columnas.
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={loadLiveColumns}
              disabled={loadingColumns}
              title="Refrescar lista de columnas"
            >
              <RefreshCw className={`h-4 w-4 ${loadingColumns ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Chart Visualization */}
      <Card className="flex-1 flex flex-col min-h-0 overflow-hidden">
        <CardHeader className="flex-shrink-0">
          <CardTitle className="flex flex-row items-center">
          {refetching ? (<Activity className="mr-2 h-4 w-4 animate-spin" />) : ''} Gráfico de Dispersión 2D</CardTitle>
          <CardDescription>
            {selectedXAxis} vs {selectedYAxis} • Valores: {selectedValueColumn}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex flex-col min-h-0 p-0">
          {(() => {
            const canRenderChart = chartData && chartData.length > 0 && selectedXAxis && selectedYAxis && selectedValueColumn;

            return canRenderChart && chartOptions ? (
              <div className="flex-1 w-full p-6 relative" style={{ minHeight: '400px', height: '100%' }}>
                {MemoizedChart}

                {/* Custom Chart Controls - Positioned over chart */}
                <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                  {/* Toggle Brush/Pointer Mode Button */}
                  <Button
                    variant={isBrushMode ? "default" : "outline"}
                    size="sm"
                    onClick={toggleBrushMode}
                    title={isBrushMode ? "Cambiar a modo puntero (pan/zoom)" : "Cambiar a modo dibujar rectángulo"}
                    className="shadow-lg"
                  >
                    {isBrushMode ? (
                      <>
                        <Brush className="h-4 w-4 mr-2" />
                        Modo Dibujo
                      </>
                    ) : (
                      <>
                        <Activity className="h-4 w-4 mr-2" />
                        Modo Puntero
                      </>
                    )}
                  </Button>

                  {/* Apply Selection Button - Shows when rectangle is drawn (all dataset sizes) */}
                  {currentBrushRectRef.current && (
                    <Button
                      variant="default"
                      size="sm"
                      onClick={applyBrushSelection}
                      disabled={isApplyingSelection}
                      title="Aplicar selección con filtrado en backend"
                      className="shadow-lg bg-blue-600 hover:bg-blue-700"
                    >
                      {isApplyingSelection ? '⏳ Aplicando...' : '✓ Aplicar Selección'}
                    </Button>
                  )}

                  {/* Clear Button - Show if brush active or rectangle drawn */}
                  {(brushInfoRef.current || currentBrushRectRef.current) && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={clearBrushSelection}
                      title="Limpiar selección"
                      className="shadow-lg"
                    >
                      <X className="h-4 w-4 mr-2" />
                      Limpiar
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex-1 bg-gray-50 rounded-lg flex items-center justify-center m-6">
                <div className="text-center">
                  <Activity className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-600">No hay datos del gráfico disponibles</p>
                  <p className="text-sm text-gray-500">
                    Debug: chartData.length={chartData?.length || 0}, ejeX={selectedXAxis}, ejeY={selectedYAxis}, valor={selectedValueColumn}
                  </p>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

    </div>
  );
};

export default DatasetViewer;