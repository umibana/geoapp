import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactECharts from 'echarts-for-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BarChart3, Activity } from 'lucide-react';
import { GetDatasetDataResponse, DatasetInfo } from '@/generated/projects';

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
  const [selectedValueColumn, setSelectedValueColumn] = useState<string>('z');
  const [selectedXAxis, setSelectedXAxis] = useState<string>('x');
  const [selectedYAxis, setSelectedYAxis] = useState<string>('y');
  const [chartData, setChartData] = useState<Float32Array | null>(null);
  const chartRef = useRef<ReactECharts>(null);

  // Initialize selected columns when coordinate columns change
  useEffect(() => {
    if (coordinateColumns.x && selectedXAxis === 'x') setSelectedXAxis(coordinateColumns.x);
    if (coordinateColumns.y && selectedYAxis === 'y') setSelectedYAxis(coordinateColumns.y);
    if (coordinateColumns.z && selectedValueColumn === 'z') setSelectedValueColumn(coordinateColumns.z);
  }, [coordinateColumns, selectedXAxis, selectedYAxis, selectedValueColumn]);

  useEffect(() => {
    loadDataset();
  }, [datasetInfo.id, selectedXAxis, selectedYAxis, selectedValueColumn]);

  useEffect(() => {
    if (dataset && selectedValueColumn && selectedXAxis && selectedYAxis) {
      prepareChartData();
    }
  }, [dataset, selectedValueColumn, selectedXAxis, selectedYAxis]);

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
      }, 150); // 150ms debounce delay
    };

    window.addEventListener('resize', debouncedResize);
    return () => {
      window.removeEventListener('resize', debouncedResize);
      clearTimeout(resizeTimeout);
    };
  }, []);

  // Trigger resize after chart data changes
  useEffect(() => {
    if (chartData && chartRef.current) {
      const chartInstance = chartRef.current.getEchartsInstance();
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
      brush: {
        toolbox: ['rect', 'clear'],
        xAxisIndex: 0,
        yAxisIndex: 0,
        throttleType: 'debounce'
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
        <Badge variant="outline" className="px-3 py-1">
          <Activity className="mr-2 h-4 w-4" />
          Visualización de Dataset
        </Badge>
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
          
          <div className="text-sm text-muted-foreground">
            <p>Selecciona qué columnas usar para el eje X, eje Y y valores de los puntos. Puedes usar cualquier columna para cualquier eje.</p>
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
                <ReactECharts
                  ref={chartRef}
                  option={chartOptions}
                  style={{ height: '100%', width: '100%', minHeight: '400px' }}
                  showLoading={refetching}
                  loadingOption={{ text: 'Cargando datos...' }}
                  opts={{ renderer: 'canvas' }}
                  onEvents={{
                    'brushSelected': (params: {batch?: {areas?: {coordRange?: number[][]}[], selected?: {dataIndex: number[]}[]}[]}) => {
                      console.log('Brush selection:', params);
                      if (params.batch && params.batch.length > 0) {
                        const batch = params.batch[0];
                        
                        // Log coordinate bounds
                        if (batch.areas) {
                          batch.areas.forEach((area, index) => {
                            if (area.coordRange && area.coordRange.length >= 2) {
                              const xRange = area.coordRange[0]; // [x1, x2] in data coordinates
                              const yRange = area.coordRange[1]; // [y1, y2] in data coordinates
                              
                              const rectangle = {
                                x1: xRange[0],
                                x2: xRange[1], 
                                y1: yRange[0],
                                y2: yRange[1]
                              };
                              
                              console.log(`Rectangle ${index + 1} vertices (data coordinates):`, rectangle);
                              console.log(`Query bounds: X between ${rectangle.x1} and ${rectangle.x2}, Y between ${rectangle.y1} and ${rectangle.y2}`);
                            }
                          });
                        }
                        
                        // Log selected data points
                        if (batch.selected && batch.selected.length > 0) {
                          const selectedData = batch.selected[0].dataIndex;
                          console.log('Selected data indices:', selectedData);
                          console.log('Selected points:', selectedData.map((index: number) => ({
                            index,
                            x: chartData![index * 3],
                            y: chartData![index * 3 + 1], 
                            value: chartData![index * 3 + 2]
                          })));
                          console.log(`Total selected points: ${selectedData.length}`);
                        }
                      }
                    }
                  }}
                />
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