import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brush, AlertCircle } from 'lucide-react';
import { useBrushSelection } from '@/hooks/useBrushSelection';

/**
 * BrushedLineChart Component
 * Displays the currently selected brush data as a line chart
 * Points are sorted by X-axis for proper line visualization
 */
const BrushedLineChart: React.FC = () => {
  const activeBrushSelection = useBrushSelection();

  // Generate line chart options from brush data
  const chartOptions = useMemo(() => {
    if (!activeBrushSelection || !activeBrushSelection.selectedPoints) return null;

    const data = activeBrushSelection.selectedPoints;
    const { xAxis, yAxis, value } = activeBrushSelection.columns;

    // Convert Float32Array to array of [x, y] and [x, value] pairs for efficient rendering
    // Sort by X-axis by creating indexed array and sorting indices
    const numPoints = data.length / 3;
    const indices = Array.from({ length: numPoints }, (_, i) => i);

    // Sort indices by X values
    indices.sort((a, b) => data[a * 3] - data[b * 3]);

    // Create sorted data arrays in [x, y] format for ECharts
    const ySeriesData: [number, number][] = [];
    const valueSeriesData: [number, number][] = [];

    for (let i = 0; i < indices.length; i++) {
      const idx = indices[i] * 3;
      const x = data[idx];
      const y = data[idx + 1];
      const v = data[idx + 2];

      ySeriesData.push([x, y]);
      valueSeriesData.push([x, v]);
    }

    return {
      animation: false,
      title: {
        text: 'Gráfico de Líneas - Datos Seleccionados',
        left: 'center',
        textStyle: {
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'axis',
        formatter: function(params: {value: [number, number], dataIndex: number}[]) {
          if (!params || params.length === 0) return '';
          const xValue = params[0].value[0];
          const yValue = params[0].value[1];
          const valueValue = params[1] ? params[1].value[1] : 'N/A';
          return `
            <strong>Punto</strong><br/>
            ${xAxis}: ${typeof xValue === 'number' ? xValue.toFixed(4) : xValue}<br/>
            ${yAxis}: ${typeof yValue === 'number' ? yValue.toFixed(4) : yValue}<br/>
            ${value}: ${typeof valueValue === 'number' ? valueValue.toFixed(4) : valueValue}
          `;
        }
      },
      legend: {
        data: [yAxis, value],
        top: 30,
        textStyle: {
          fontSize: 11
        }
      },
      grid: {
        left: '10%',
        right: '10%',
        top: '20%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        name: xAxis,
        type: 'value',
        nameLocation: 'middle',
        nameGap: 30,
        boundaryGap: false,
        scale: true

      },
      yAxis: [
        {
          name: yAxis,
          type: 'value',
          nameLocation: 'middle',
          nameGap: 50,
          position: 'left',
          scale: true
        },
        {
          name: value,
          type: 'value',
          nameLocation: 'middle',
          nameGap: 50,
          position: 'right'
        }
      ],
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'filter'
        },
        {
          type: 'slider',
          xAxisIndex: 0,
          filterMode: 'filter',
          bottom: '5%',
          start: 0,
          end: 100
        }
      ],
      series: [
        {
          name: yAxis,
          type: 'line',
          data: ySeriesData,
          yAxisIndex: 0,
          smooth: true,
          showSymbol: false,
          symbol: 'none',
          lineStyle: {
            width: 2,
            color: '#3b82f6'
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(59, 130, 246, 0.3)' },
                { offset: 1, color: 'rgba(59, 130, 246, 0.05)' }
              ]
            }
          },
          large: numPoints > 2000,
          largeThreshold: 2000
        },
        {
          name: value,
          type: 'line',
          data: valueSeriesData,
          yAxisIndex: 1,
          smooth: true,
          showSymbol: false,
          symbol: 'none',
          lineStyle: {
            width: 2,
            color: '#8b5cf6'
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [
                { offset: 0, color: 'rgba(139, 92, 246, 0.3)' },
                { offset: 1, color: 'rgba(139, 92, 246, 0.05)' }
              ]
            }
          },
          large: numPoints > 2000,
          largeThreshold: 2000
        }
      ]
    };
  }, [activeBrushSelection]);

  // No brush selection
  if (!activeBrushSelection) {
    return (
      <Card className="w-full h-full flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Brush className="mr-2 h-5 w-5" />
            Gráfico de Líneas de Datos Seleccionados
          </CardTitle>
          <CardDescription>
            Muestra la evolución de los datos ordenados por el eje X
          </CardDescription>
        </CardHeader>
        <CardContent className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <AlertCircle className="mx-auto h-12 w-12 mb-4 opacity-50" />
            <p className="text-lg font-medium">No hay selección activa</p>
            <p className="text-sm mt-2">
              Usa la herramienta brush en un dataset para seleccionar puntos
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="w-full h-full flex flex-col p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-shrink-0">
        <div>
          <h2 className="text-xl font-bold tracking-tight flex items-center">
            <Brush className="mr-2 h-5 w-5" />
            Gráfico de Líneas
          </h2>
          <p className="text-sm text-muted-foreground">
            Dataset: {activeBrushSelection.datasetId}
          </p>
        </div>
        <Badge variant="default" className="px-3 py-1">
          {activeBrushSelection.selectedIndices.length.toLocaleString()} puntos
        </Badge>
      </div>


      {/* Chart */}
          {chartOptions && (
            <ReactECharts
              option={chartOptions}
              style={{ height: '100%', width: '100%', minHeight: '300px' }}
              opts={{ renderer: 'canvas' }}
            />
          )}
    </div>
  );
};

export default BrushedLineChart;
