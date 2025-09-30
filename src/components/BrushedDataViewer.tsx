import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brush, AlertCircle } from 'lucide-react';
import { useBrushStore } from '@/stores/brushStore';

/**
 * BrushedDataViewer Component
 * Displays the currently selected brush data from Zustand store
 * Updates automatically when brush selection changes
 */
const BrushedDataViewer: React.FC = () => {
  // Get all brush selections from store
  const allSelections = useBrushStore((state) => state.selections);
  const activeDatasetId = useBrushStore((state) => state.activeDatasetId);

  // Get the active brush selection
  const activeBrushSelection = useMemo(() => {
    if (!activeDatasetId) return null;
    return allSelections.get(activeDatasetId) || null;
  }, [allSelections, activeDatasetId]);

  // Generate chart options from brush data
  const chartOptions = useMemo(() => {
    if (!activeBrushSelection || !activeBrushSelection.selectedPoints) return null;

    const data = activeBrushSelection.selectedPoints;
    const { xAxis, yAxis, value } = activeBrushSelection.columns;

    // Calculate bounds for visualization
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minValue = Infinity, maxValue = -Infinity;

    for (let i = 0; i < data.length; i += 3) {
      const x = data[i];
      const y = data[i + 1];
      const v = data[i + 2];

      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
      minValue = Math.min(minValue, v);
      maxValue = Math.max(maxValue, v);
    }

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
        min: minValue,
        max: maxValue,
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
        min: minX,
        max: maxX
      },
      yAxis: {
        name: yAxis,
        type: 'value',
        nameLocation: 'middle',
        nameGap: 40,
        scale: true,
        min: minY,
        max: maxY
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

  // No brush selection
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

      {/* Info Card */}
      <Card className="flex-shrink-0">
        <CardContent className="pt-4">
          <div className="grid grid-cols-3 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Eje X</p>
              <p className="font-medium">{activeBrushSelection.columns.xAxis}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Eje Y</p>
              <p className="font-medium">{activeBrushSelection.columns.yAxis}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Valor</p>
              <p className="font-medium">{activeBrushSelection.columns.value}</p>
            </div>
          </div>
          <div className="mt-3 text-xs text-muted-foreground">
            <p>Bounds: X [{activeBrushSelection.coordRange.x1.toFixed(2)}, {activeBrushSelection.coordRange.x2.toFixed(2)}] • Y [{activeBrushSelection.coordRange.y1.toFixed(2)}, {activeBrushSelection.coordRange.y2.toFixed(2)}]</p>
          </div>
        </CardContent>
      </Card>

      {/* Chart */}
      <Card className="flex-1 flex flex-col min-h-0">
        <CardContent className="flex-1 p-4">
          {chartOptions && (
            <ReactECharts
              option={chartOptions}
              style={{ height: '100%', width: '100%', minHeight: '300px' }}
              opts={{ renderer: 'canvas' }}
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BrushedDataViewer;