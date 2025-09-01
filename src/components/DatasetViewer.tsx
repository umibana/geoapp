import React, { useState, useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import 'echarts-gl';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, BarChart3, Activity } from 'lucide-react';

/**
 * Propiedades del componente DatasetViewer
 * Define los parámetros necesarios para visualizar un dataset
 */
interface DatasetViewerProps {
  datasetId: string;      // ID único del dataset a visualizar
  datasetName: string;    // Nombre del dataset para mostrar en la UI
  onBack: () => void;     // Función callback para regresar a la vista anterior
}

/**
 * Límites de datos para escalado automático de gráficos
 * Contiene valores mínimos y máximos calculados en el backend
 */
interface DataBoundaries {
  column_name: string;    // Nombre de la columna
  min_value: number;      // Valor mínimo encontrado
  max_value: number;      // Valor máximo encontrado
  valid_count: number;    // Cantidad de valores válidos
}

/**
 * Estructura de datos del dataset completo
 * Incluye filas, mappings de columnas y límites calculados
 */
interface DatasetData {
  id: string;                           // ID único del dataset
  totalRows: number;                    // Total de filas en el dataset
  columnMappings: ColumnMapping[];      // Configuración de columnas
  rows: DataRow[];                      // Datos de las filas
  dataBoundaries: DataBoundaries[];     // Límites calculados para gráficos
}

/**
 * Mapeo de columnas CSV a campos geoespaciales
 * Define cómo interpretar cada columna del CSV
 */
interface ColumnMapping {
  column_name: string;     // Nombre original de la columna
  column_type: number;     // Tipo de dato (numérico, categórico, etc.)
  mapped_field: string;    // Campo mapeado (x, y, z, etc.)
  is_coordinate: boolean;  // Indica si es una coordenada espacial
}

/**
 * Estructura de una fila de datos
 * Permite valores dinámicos por nombre de columna
 */
interface DataRow {
  [key: string]: string | number;
}

/**
 * Componente principal para visualizar datasets geoespaciales
 * Permite seleccionar ejes X/Y/Valor y muestra gráfico de dispersión 2D
 * con escalado automático basado en límites calculados en el backend
 */
const DatasetViewer: React.FC<DatasetViewerProps> = ({ datasetId, datasetName, onBack }) => {
  const [dataset, setDataset] = useState<DatasetData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedValueColumn, setSelectedValueColumn] = useState<string>('');
  const [selectedXAxis, setSelectedXAxis] = useState<string>('');
  const [selectedYAxis, setSelectedYAxis] = useState<string>('');
  const [chartData, setChartData] = useState<any[]>([]);

  // Available columns for axis and value selection
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [coordinateColumns, setCoordinateColumns] = useState<{x?: string, y?: string, z?: string}>({});

  // Chart refs
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstanceRef = useRef<echarts.EChartsType | null>(null);

  useEffect(() => {
    loadDataset();
  }, [datasetId]);

  useEffect(() => {
    if (dataset && selectedValueColumn && selectedXAxis && selectedYAxis) {
      prepareChartData();
    }
  }, [dataset, selectedValueColumn, selectedXAxis, selectedYAxis]);

  // Initialize chart when div is available and data is ready
  useEffect(() => {
    const canRenderChart = chartData.length > 0 && selectedXAxis && selectedYAxis && selectedValueColumn;
    
    
    if (!canRenderChart) {
      // Dispose existing chart if conditions are no longer met
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
      return;
    }
    
    if (!chartRef.current) {
      return;
    }
    
    // Don't reinitialize if chart already exists
    if (chartInstanceRef.current) {
      updateChart();
      return;
    }
    
    const chart = echarts.init(chartRef.current, undefined, {
      renderer: 'canvas',
      useDirtyRect: true,
    });
    chartInstanceRef.current = chart;

    // Handle window resize
    const handleResize = () => {
      chart.resize();
    };
    window.addEventListener('resize', handleResize);

    // Update chart with data
    updateChart();

    // Cleanup function
    return () => {
      if (chartInstanceRef.current) {
        chartInstanceRef.current.dispose();
        chartInstanceRef.current = null;
      }
    };
  }, [chartData, selectedXAxis, selectedYAxis, selectedValueColumn]);

  const loadDataset = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get dataset information and data - request all points for visualization
      const response = await window.autoGrpc.getDatasetData({
        dataset_id: datasetId,
        page: 1,
        page_size: 100000 // Pido cierta cantidad de puntos
        // Es temporal, tengo que ver como pasar del STACK SIZE EXCEEDED
      });

      
      if (response.rows && response.column_mappings) {
        // Parse the dataset structure
        const columnMappings = response.column_mappings;
        
        // Find coordinate columns (X, Y, Z)
        const coords: {x?: string, y?: string, z?: string} = {};
        const allAvailableColumns: string[] = [];

        columnMappings.forEach((mapping: ColumnMapping) => {
          if (mapping.column_type !== 3) { // Not UNUSED
            allAvailableColumns.push(mapping.column_name);
            
            if (mapping.is_coordinate) {
              if (mapping.mapped_field === 'x') coords.x = mapping.column_name;
              if (mapping.mapped_field === 'y') coords.y = mapping.column_name;
              if (mapping.mapped_field === 'z') coords.z = mapping.column_name;
            }
          }
        });
        


        setCoordinateColumns(coords);
        setAllColumns(allAvailableColumns);
        
        // Auto-select default axes and value column
        if (allAvailableColumns.length > 0) {
          // Auto-select X axis (prefer coordinate X, or first column)
          if (!selectedXAxis) {
            setSelectedXAxis(coords.x || allAvailableColumns[0]);
          }
          
          // Auto-select Y axis (prefer coordinate Y, or second column)
          if (!selectedYAxis) {
            setSelectedYAxis(coords.y || allAvailableColumns[1] || allAvailableColumns[0]);
          }
          
          // Auto-select value column (prefer coordinate Z, or third column, or first non-axis column)
          if (!selectedValueColumn) {
            const defaultValue = coords.z || 
              allAvailableColumns.find(col => col !== selectedXAxis && col !== selectedYAxis) ||
              allAvailableColumns[0];
            setSelectedValueColumn(defaultValue);
          }
        }

        // Capture data boundaries for chart scaling
        const dataBoundaries = response.data_boundaries || [];

        setDataset({
          id: datasetId,
          totalRows: response.total_rows,
          columnMappings: columnMappings,
          rows: response.rows,
          dataBoundaries: dataBoundaries
        });
      }
    } catch (err) {
      console.error('Error loading dataset:', err);
      setError('Error al cargar el dataset');
    } finally {
      setLoading(false);
    }
  };



  const prepareChartData = () => {
    if (!dataset || !selectedValueColumn || !selectedXAxis || !selectedYAxis) {
      return;
    }
    
    // Convert dataset rows to chart format - handle protocol buffer structure
    const chartPoints = dataset.rows.map((row, index) => {
      // Protocol buffer data comes with fields structure
      const data = row.fields || row;
      const xVal = Number(data[selectedXAxis]) || 0;
      const yVal = Number(data[selectedYAxis]) || 0;
      const valueVal = Number(data[selectedValueColumn]) || 0;
      
      // Debug first few rows to understand data structure
      if (index < 3) {
        console.log(`Row ${index}:`, {
          rawRow: row,
          hasFields: 'fields' in row,
          data,
          selectedColumns: { selectedXAxis, selectedYAxis, selectedValueColumn },
          extractedValues: { x: xVal, y: yVal, value: valueVal }
        });
      }
      
      return {
        id: `point_${index}`,
        x: xVal,
        y: yVal,
        value: valueVal,
        originalData: data,
        isValid: !isNaN(xVal) && !isNaN(yVal) && !isNaN(valueVal) &&
                 isFinite(xVal) && isFinite(yVal) && isFinite(valueVal)
      };
    }).filter(point => point.isValid);

    console.log('Chart data processing results:', {
      totalRows: dataset.rows.length,
      validPoints: chartPoints.length,
      samplePoint: chartPoints[0]
    });
    
    setChartData(chartPoints);
  };

  const updateChart = () => {
    if (!chartInstanceRef.current || chartData.length === 0) {
      return;
    }

    // Get boundaries for automatic scaling
    const getBoundaryForColumn = (columnName: string) => {
      if (!dataset?.dataBoundaries) return null;
      return dataset.dataBoundaries.find(b => b.column_name === columnName);
    };

    const xBoundary = getBoundaryForColumn(selectedXAxis);
    const yBoundary = getBoundaryForColumn(selectedYAxis);

    // Calculate value range for visualMap
    const valueRange = chartData.length > 0 ? {
      min: Math.min(...chartData.map(p => p.value)),
      max: Math.max(...chartData.map(p => p.value))
    } : { min: 0, max: 100 };

    // 2D Scatter plot with user-selected axes and automatic scaling
    const option = {
      animation: false,
      title: {
        text: `${datasetName} - Visualización 2D`,
        subtext: `${chartData.length.toLocaleString()} puntos • ${new Set(chartData.map(p => `${p.x},${p.y}`)).size} coordenadas únicas`,
        left: 'center',
        textStyle: {
          fontSize: 16,
          fontWeight: 'bold'
        }
      },
      visualMap: {
        min: valueRange.min,
        max: valueRange.max,
        dimension: 2, // Use the third dimension (value) for color mapping
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
        ...(xBoundary && {
          min: xBoundary.min_value,
          max: xBoundary.max_value
        })
      },
      yAxis: {
        name: selectedYAxis,
        type: 'value',
        nameLocation: 'middle',
        nameGap: 50,
        ...(yBoundary && {
          min: yBoundary.min_value,
          max: yBoundary.max_value
        })
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0
        },
        {
          type: 'inside',
          yAxisIndex: 0
        }
      ],
      series: [{
        name: `${selectedValueColumn} values`,
        type: 'scatter',
        data: chartData.map(point => [point.x, point.y, point.value]),
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
        progressive: 100000,
        progressiveThreshold: 20000,
        progressiveChunkMode: 'sequential',
        symbolSize: 4,
        blendMode: 'screen',
        dimensions: [selectedXAxis, selectedYAxis, selectedValueColumn],
      }]
    };
    
    chartInstanceRef.current.setOption(option);
  };

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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Volver
          </Button>
          <div>
            <h2 className="text-2xl font-bold tracking-tight">{datasetName}</h2>
            <p className="text-muted-foreground">
              {dataset?.totalRows.toLocaleString()} puntos de datos
            </p>
          </div>
        </div>
        <Badge variant="outline" className="px-3 py-1">
          <Activity className="mr-2 h-4 w-4" />
          Visualización de Dataset
        </Badge>
      </div>

      {/* Controls */}
      <Card>
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
                  {allColumns.map((column) => (
                    <SelectItem key={column} value={column}>
                      {column}
                      {coordinateColumns.x === column && ' (Coordenada X)'}
                      {coordinateColumns.y === column && ' (Coordenada Y)'}
                      {coordinateColumns.z === column && ' (Coordenada Z)'}
                    </SelectItem>
                  ))}
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
                  {allColumns.map((column) => (
                    <SelectItem key={column} value={column}>
                      {column}
                      {coordinateColumns.x === column && ' (Coordenada X)'}
                      {coordinateColumns.y === column && ' (Coordenada Y)'}
                      {coordinateColumns.z === column && ' (Coordenada Z)'}
                    </SelectItem>
                  ))}
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
                  {allColumns.map((column) => (
                    <SelectItem key={column} value={column}>
                      {column}
                      {coordinateColumns.x === column && ' (Coordenada X)'}
                      {coordinateColumns.y === column && ' (Coordenada Y)'}
                      {coordinateColumns.z === column && ' (Coordenada Z)'}
                    </SelectItem>
                  ))}
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
      <Card>
        <CardHeader>
          <CardTitle>Gráfico de Dispersión 2D</CardTitle>
          <CardDescription>
            {selectedXAxis} vs {selectedYAxis} • Valores: {selectedValueColumn}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {(() => {
            const canRenderChart = chartData.length > 0 && selectedXAxis && selectedYAxis && selectedValueColumn;
            
            return canRenderChart ? (
              <div 
                ref={chartRef}
                className="h-96 w-full"
                style={{ minHeight: '400px' }}
              />
            ) : (
              <div className="h-96 bg-gray-50 rounded-lg flex items-center justify-center">
                <div className="text-center">
                  <Activity className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                  <p className="text-gray-600">No hay datos del gráfico disponibles</p>
                  <p className="text-sm text-gray-500">
                    Debug: chartData.length={chartData.length}, ejeX={selectedXAxis}, ejeY={selectedYAxis}, valor={selectedValueColumn}
                  </p>
                </div>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      {/* {dataset && (
        <Card>
          <CardHeader>
            <CardTitle>Resumen de Datos</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <Label className="text-sm font-medium">Total de Filas</Label>
                <p className="text-2xl font-bold">{dataset.totalRows.toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Columnas Disponibles</Label>
                <p className="text-2xl font-bold">{allColumns.length}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Puntos en Gráfico</Label>
                <p className="text-2xl font-bold">{chartData.length.toLocaleString()}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Coordenadas Mapeadas</Label>
                <p className="text-2xl font-bold">
                  {Object.values(coordinateColumns).filter(Boolean).length}
                </p>
              </div>
            </div>
          </CardContent>
        </Card> 
      )} */}
    </div>
  );
};

export default DatasetViewer;