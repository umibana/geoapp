import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brush, AlertCircle } from 'lucide-react';
import { useBrushSelection } from '@/hooks/useBrushSelection';

/**
 * BrushedBarChart Component
 * Displays the currently selected brush data as a bar chart (histogram)
 * Shows distribution of values across bins
 */
const BrushedBarChart: React.FC = () => {
  const activeBrushSelection = useBrushSelection();

  // Generate bar chart options from brush data
  const chartOptions = useMemo(() => {
    if (!activeBrushSelection || !activeBrushSelection.selectedPoints) return null;

    const data = activeBrushSelection.selectedPoints;
    const { value } = activeBrushSelection.columns;

    // Extract values (every 3rd element starting at index 2)
    const values: number[] = [];
    for (let i = 2; i < data.length; i += 3) {
      values.push(data[i]);
    }

    // Calculate histogram bins
    const numBins = 30;
    const minValue = Math.min(...values);
    const maxValue = Math.max(...values);
    const binSize = (maxValue - minValue) / numBins;

    // Create bins
    const bins: { range: string; count: number; min: number; max: number }[] = [];
    for (let i = 0; i < numBins; i++) {
      const binMin = minValue + i * binSize;
      const binMax = minValue + (i + 1) * binSize;
      bins.push({
        range: `${binMin.toFixed(2)} - ${binMax.toFixed(2)}`,
        count: 0,
        min: binMin,
        max: binMax
      });
    }

    // Count values in each bin
    for (const val of values) {
      const binIndex = Math.min(Math.floor((val - minValue) / binSize), numBins - 1);
      bins[binIndex].count++;
    }

    return {
      animation: false,
      title: {
        text: 'Histograma - Distribución de Valores',
        left: 'center',
        textStyle: {
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'axis',
        axisPointer: {
          type: 'shadow'
        },
        formatter: function(params: any) {
          const dataIndex = params[0].dataIndex;
          const bin = bins[dataIndex];
          return `
            <strong>Rango: ${bin.range}</strong><br/>
            Frecuencia: ${bin.count} puntos<br/>
            Porcentaje: ${((bin.count / values.length) * 100).toFixed(2)}%
          `;
        }
      },
      grid: {
        left: '10%',
        right: '5%',
        top: '15%',
        bottom: '15%',
        containLabel: true
      },
      xAxis: {
        name: value,
        type: 'category',
        data: bins.map(b => b.range),
        nameLocation: 'middle',
        nameGap: 40,
        axisLabel: {
          rotate: 45,
          fontSize: 10
        }
      },
      yAxis: {
        name: 'Frecuencia',
        type: 'value',
        nameLocation: 'middle',
        nameGap: 50
      },
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
          bottom: '5%'
        }
      ],
      series: [{
        name: 'Frecuencia',
        type: 'bar',
        data: bins.map(b => b.count),
        itemStyle: {
          color: '#3b82f6',
          borderRadius: [4, 4, 0, 0]
        },
        emphasis: {
          itemStyle: {
            color: '#1d4ed8'
          }
        }
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
            Histograma de Datos Seleccionados
          </CardTitle>
          <CardDescription>
            Muestra la distribución de valores en forma de histograma
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
            Histograma
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

export default BrushedBarChart;
