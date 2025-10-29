import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brush, AlertCircle } from 'lucide-react';
import { useBrushSelection } from '@/hooks/useBrushSelection';

/**
 * BrushedDataViewer Component
 * Displays the currently selected brush data from Zustand store
 * Updates automatically when brush selection changes
 */
const BrushedDataViewer: React.FC = () => {
  const activeBrushSelection = useBrushSelection();

  // Generate chart options from brush data
  // Check echarts documentation for more options or different charts
  const chartOptions = useMemo(() => {
    if (!activeBrushSelection || !activeBrushSelection.selectedPoints) return null;

    const data = activeBrushSelection.selectedPoints;
    const { xAxis, yAxis, value } = activeBrushSelection.columns;


    return {
      animation: false,
      title: {
        text: 'Datos Seleccionados con Brush',
        left: 'center',
        textStyle: {
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      visualMap: {
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
          color: '#374151',
          fontSize: 10
        }
      },
      tooltip: {
        trigger: 'item',
        formatter: function(params: {data: number[], dataIndex: number}) {
          const pointData = params.data;
          return `
            <strong>Punto ${params.dataIndex + 1}</strong><br/>
            ${xAxis}: ${pointData[0].toFixed(4)}<br/>
            ${yAxis}: ${pointData[1].toFixed(4)}<br/>
            ${value}: ${pointData[2].toFixed(4)}
          `;
        }
      },
      xAxis: {
        name: xAxis,
        type: 'value',
        nameLocation: 'middle',
        nameGap: 25,
        scale: true,

      },
      yAxis: {
        name: yAxis,
        type: 'value',
        nameLocation: 'middle',
        nameGap: 40,
        scale: true,
 
      },
      dataZoom: [
        {
          type: 'inside',
          xAxisIndex: 0,
          filterMode: 'filter'
        },
        {
          type: 'inside',
          yAxisIndex: 0,
          filterMode: 'filter'
        }
      ],
      series: [{
        name: `${value} values`,
        type: 'scatter',
        data: data,
        animation: false,
        itemStyle: {
          opacity: 0.8,
          borderWidth: 0
        },
        emphasis: {
          itemStyle: {
            borderColor: '#000',
            borderWidth: 1,
            opacity: 1.0
          }
        },
        large: data.length > 2000,
        largeThreshold: 2000,
        symbolSize: 5,
        dimensions: [xAxis, yAxis, value]
      }]
    };
  }, [activeBrushSelection]);

  // If no brush selection, show a message
  if (!activeBrushSelection) {
    return (
      <Card className="w-full h-full flex flex-col">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Brush className="mr-2 h-5 w-5" />
            Visualizador de Datos Seleccionados
          </CardTitle>
          <CardDescription>
            Muestra los puntos seleccionados con la herramienta brush
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
            Datos Seleccionados
          </h2>
          <p className="text-sm text-muted-foreground">
            Dataset: {activeBrushSelection.datasetId}
          </p>
        </div>
        <Badge variant="default" className="px-3 py-1">
          {activeBrushSelection.selectedIndices.length.toLocaleString()} puntos
        </Badge>
      </div>

      {/* Chart - Uses echarts-for-react for simplicity */}
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

export default BrushedDataViewer;