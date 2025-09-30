import React, { useState, useEffect, useMemo, useRef, useCallback, memo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BarChart3, Activity, Brush, X, Filter } from 'lucide-react';
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
  console.log('🔄 DatasetViewer RENDER - NO ZUSTAND SUBSCRIPTIONS');

  const datasetInfo = DatasetInfo; // For consistency with the rest of the code

  // CRITICAL: Don't use any Zustand hooks - access store imperatively to prevent re-renders
  // We use useBrushStore.getState() directly instead to avoid subscribing to store updates

  // Memoize column calculations
  const availableColumns = useMemo(() => {
    return datasetInfo.column_mappings
      ?.filter(mapping => mapping.column_type !== 3) // Not UNUSED
      ?.map(mapping => mapping.column_name) || [];
  }, [datasetInfo.column_mappings]);

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
  const chartRef = useRef<ReactECharts>(null);

  // Flag to prevent infinite loop when applying brush programmatically
  const isApplyingBrushProgrammatically = useRef(false);

  // Track last brush update to prevent rapid-fire updates
  const lastBrushUpdateTime = useRef(0);
  const BRUSH_UPDATE_DEBOUNCE = 500; // milliseconds

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

  // For rendering, just check if we have a brush (no dependency on timestamp)
  const hasBrush = brushInfoRef.current !== null;
  const brushCount = brushInfoRef.current?.count || 0;

  console.log('📊 brushInfo from ref:', hasBrush ? `${brushCount} points` : 'none');

  // Full dataset - never changes based on brush
  const fullData = useMemo(() => {
    console.log('🔢 fullData useMemo recalculating - deps:', {
      hasDataset: !!dataset,
      selectedValueColumn,
      selectedXAxis,
      selectedYAxis
    });
    if (!dataset || !selectedValueColumn || !selectedXAxis || !selectedYAxis || !dataset.binary_data) {
      return null;
    }
    return new Float32Array(dataset.binary_data.buffer, dataset.binary_data.byteOffset, dataset.data_length);
  }, [dataset, selectedValueColumn, selectedXAxis, selectedYAxis]);

  // Chart data - switches between full and filtered based on toggle
  const chartData = useMemo(() => {
    console.log('📈 chartData useMemo recalculating - showOnlyBrushed:', showOnlyBrushed);
    if (!fullData) return null;

    // If filter is enabled and we have a brush selection, show only brushed points
    if (showOnlyBrushed && brushInfoRef.current) {
      return brushInfoRef.current.selection.selectedPoints;
    }

    return fullData;
  }, [fullData, showOnlyBrushed]); // No dependency on brush timestamp to prevent re-render

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
        console.log('Applying initial brush selection from store:', selection);

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

        console.log('Initial brush applied successfully');

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

  // Note: Real-time synchronization disabled to prevent infinite loop
  // Brush selections are still shared via the store and applied on component mount
  // If you need real-time sync, you would need to implement a more sophisticated
  // debouncing/throttling mechanism or use a different approach

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
      console.log('response', response);
      setTimetook((performance.now() - timetook));

      if (response.binary_data && response.data_length > 0) {
        setDataset(response);
      }
    } catch (err) {
      console.error('Error loading dataset:', err);
      setError('Error al cargar el dataset');
    } finally {
      setLoading(false);
      setRefetching(false);
    }
  };



  const prepareChartData = () => {
    if (!dataset || !selectedValueColumn || !selectedXAxis || !selectedYAxis) {
      return;
    }
    // Creamos el Float32Array desde el binary_data_f32 si existe (deberia!), sino desde el binary_data
    const float32Data = dataset.binary_data_f32 ?? new Float32Array(dataset.binary_data.buffer, dataset.binary_data.byteOffset, dataset.data_length);
    
    setChartData(float32Data);
  };

  // Generate chart options - memoized for performance
  const chartOptions = useMemo(() => {
    if (!chartData || chartData.length === 0) return null;

    // Get boundaries for automatic scaling
    const getBoundaryForColumn = (columnName: string) => {
      if (!dataset?.data_boundaries) return null;
      return dataset.data_boundaries.find(b => b.column_name === columnName);
    };

    const xBoundary = getBoundaryForColumn(selectedXAxis);
    const yBoundary = getBoundaryForColumn(selectedYAxis);
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
        inRange: {
          color: ['#1e40af', '#3b82f6', '#60a5fa', '#93c5fd', '#dbeafe', '#fef3c7', '#fcd34d', '#f59e0b', '#d97706', '#b45309']
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
        // ...(xBoundary && {
        //   min: xBoundary.min_value,
        //   max: xBoundary.max_value
        // })
      },
      yAxis: {
        name: selectedYAxis,
        type: 'value',
        nameLocation: 'middle',
        scale:true,
        nameGap: 50,
        // ...(yBoundary && {
        //   min: yBoundary.min_value,
        //   max: yBoundary.max_value
        // })
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'filter',
          throttle: 30,
        },
        {
          type: 'inside',
          yAxisIndex: 0,
          filterMode: 'filter',
          throttle: 30,
        }
      ],
      toolbox: {
        feature: {
          brush: {
            type: ['rect', 'clear'],
            title: {
              rect: 'Selección rectangular',
              clear: 'Limpiar selección'
            }
          },
          saveAsImage: {
            title: 'Guardar como imagen'
          }
        },
        right: 20,
        top: 20
      },
      brush: {
        toolbox: ['rect', 'clear'],
        xAxisIndex: 0,
        yAxisIndex: 0,
        throttleType: 'debounce',
        throttleDelay: 300,
        brushStyle: {
          borderWidth: 2,
          borderColor: 'rgba(59, 130, 246, 0.8)',
          color: 'rgba(59, 130, 246, 0.2)'
        },
        transformable: true,
        removeOnClick: false
      },
      series: [{
        name: `${selectedValueColumn} values`,
        type: 'scatter',
        data: chartData,
        animation: false,
        itemStyle: {
          opacity: 0.8,
          borderWidth: 0,
          animation: false
        },
        emphasis: {
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
        progressive: 30000,
        progressiveThreshold: 20000,
        symbolSize: 4,
        dimensions: [selectedXAxis, selectedYAxis, selectedValueColumn],
      }]
    };
  }, [chartData, selectedXAxis, selectedYAxis, selectedValueColumn, dataset, datasetInfo.file_name]);

  // Memoized chart component that only re-renders when chart props actually change
  const MemoizedChart = useMemo(() => {
    console.log('🎨 Creating memoized chart component');
    return (
      <ReactECharts
        ref={chartRef}
        option={chartOptions}
        style={{ height: '100%', width: '100%', minHeight: '400px' }}
        showLoading={refetching}
        loadingOption={{ text: 'Cargando datos...' }}
        opts={{ renderer: 'canvas' }}
        onEvents={{
          'brushSelected': (params: {batch?: {areas?: {coordRange?: number[][]}[], selected?: {dataIndex: number[]}[]}[]}) => {
            // Ignore brush events triggered by programmatic actions
            if (isApplyingBrushProgrammatically.current) {
              console.log('❌ Ignoring programmatic brush event');
              return;
            }

            // Debounce brush updates to prevent rapid-fire events
            const now = Date.now();
            if (now - lastBrushUpdateTime.current < BRUSH_UPDATE_DEBOUNCE) {
              console.log('⏱️ Debouncing brush event');
              return;
            }

            console.log('🖱️ Brush selection event received:', params);

            if (params.batch && params.batch.length > 0) {
              const batch = params.batch[0];

              // Extract coordinate bounds and selected data
              if (batch.areas && batch.areas.length > 0 && batch.selected && batch.selected.length > 0) {
                const area = batch.areas[0];
                const selectedData = batch.selected[0].dataIndex;

                if (area.coordRange && area.coordRange.length >= 2 && selectedData.length > 0) {
                  const xRange = area.coordRange[0]; // [x1, x2] in data coordinates
                  const yRange = area.coordRange[1]; // [y1, y2] in data coordinates

                  const rectangle = {
                    x1: xRange[0],
                    x2: xRange[1],
                    y1: yRange[0],
                    y2: yRange[1]
                  };

                  console.log(`📐 Brush rectangle:`, rectangle);
                  console.log(`📊 Total selected points: ${selectedData.length}`);

                  // Extract the actual point data from chartData Float32Array
                  const selectedPointsData = new Float32Array(selectedData.length * 3);
                  selectedData.forEach((idx: number, i: number) => {
                    selectedPointsData[i * 3] = chartData![idx * 3];         // x
                    selectedPointsData[i * 3 + 1] = chartData![idx * 3 + 1]; // y
                    selectedPointsData[i * 3 + 2] = chartData![idx * 3 + 2]; // z/value
                  });

                  // Update timestamp and save to brush store
                  lastBrushUpdateTime.current = now;
                  console.log('💾 Creating brush selection object...');

                  const brushSelection = {
                    datasetId: datasetInfo.id,
                    coordRange: rectangle,
                    selectedIndices: selectedData,
                    selectedPoints: selectedPointsData,
                    columns: {
                      xAxis: selectedXAxis,
                      yAxis: selectedYAxis,
                      value: selectedValueColumn
                    },
                    timestamp: now
                  };

                  console.log('🗄️ Saving to Zustand store...');
                  // Use getState() to avoid subscribing to the store
                  const { setBrushSelection } = useBrushStore.getState();
                  setBrushSelection(datasetInfo.id, brushSelection);
                  console.log('✅ Saved to Zustand store');

                  console.log('📝 Updating brushInfoRef...');
                  // Update ref immediately without triggering re-render
                  brushInfoRef.current = {
                    count: selectedData.length,
                    selection: brushSelection
                  };
                  console.log('✅ brushInfoRef updated');

                  // Force minimal re-render to show badge (doesn't change chartData/chartOptions)
                  console.log('🔄 Forcing minimal re-render to update badge UI...');
                  forceUpdate({});

                  console.log('🏁 Brush selection saved and UI updated');
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
          {/* Brush Enable Button */}
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              if (chartRef.current) {
                const chartInstance = chartRef.current.getEchartsInstance();
                // Toggle brush selection mode
                chartInstance.dispatchAction({
                  type: 'takeGlobalCursor',
                  key: 'brush',
                  brushOption: {
                    brushType: 'rect',
                    brushMode: 'single'
                  }
                });
              }
            }}
            title="Activar modo selección"
          >
            <Brush className="h-4 w-4 mr-2" />
            Seleccionar
          </Button>

          {brushInfoRef.current && brushInfoRef.current.count > 0 && (
            <>
              <Badge variant="default" className="px-3 py-1 bg-blue-600 text-white">
                <Brush className="mr-2 h-4 w-4" />
                Brush Activo ({brushInfoRef.current.count.toLocaleString()} puntos)
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
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // Set flag and clear from store first
                  isApplyingBrushProgrammatically.current = true;
                  const { clearBrushSelection } = useBrushStore.getState();
                  clearBrushSelection(datasetInfo.id);
                  brushInfoRef.current = null; // Clear ref immediately
                  setShowOnlyBrushed(false);
                  // Force re-render to hide badge by toggling a column
                  // This is intentional and only happens on clear (user action)
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
                }}
              >
                <X className="h-4 w-4" />
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
          
          <div className="text-sm text-muted-foreground space-y-1">
            <p>Selecciona qué columnas usar para el eje X, eje Y y valores de los puntos. Puedes usar cualquier columna para cualquier eje.</p>
            { brushInfoRef.current && (
              <p className="text-blue-600 font-medium flex items-center">
                <Brush className="mr-1 h-3 w-3" />
                La selección de brush se comparte entre todas las vistas del mismo dataset con las mismas columnas.
              </p>
            )}
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
              <div className="flex-1 w-full p-6" style={{ minHeight: '400px', height: '100%' }}>
                {MemoizedChart}
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