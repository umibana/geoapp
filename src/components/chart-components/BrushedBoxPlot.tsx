import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brush, AlertCircle } from 'lucide-react';
import { useBrushSelection } from '@/hooks/useBrushSelection';

/**
 * Brushed BoxPlot Component
 * Displays the currently selected brush data as a box plot
 * Shows statistics using describe from pandas
 */


//TODO: FETCH statistics from backend according to the filtered selection
// This can be done using PANDAS.describe function in python
const BrushedBoxPlot: React.FC = () => {
  const activeBrushSelection = useBrushSelection();

  // Generate box plot options from brush data
  const chartOptions = useMemo(() => {
    if (!activeBrushSelection || !activeBrushSelection.selectedPoints) return null;

    const data = activeBrushSelection.selectedPoints;
    const { xAxis, yAxis, value } = activeBrushSelection.columns;

    // Extract X, Y, and Value arrays
    const xValues: number[] = [];
    const yValues: number[] = [];
    const values: number[] = [];

    for (let i = 0; i < data.length; i += 3) {
      xValues.push(data[i]);
      yValues.push(data[i + 1]);
      values.push(data[i + 2]);
    }

    // Calculate statistics for box plot
    const calculateStats = (arr: number[]) => {
      const sorted = [...arr].sort((a, b) => a - b);
      const len = sorted.length;

      const min = sorted[0];
      const max = sorted[len - 1];
      const median = len % 2 === 0
        ? (sorted[len / 2 - 1] + sorted[len / 2]) / 2
        : sorted[Math.floor(len / 2)];
      const q1 = sorted[Math.floor(len * 0.25)];
      const q3 = sorted[Math.floor(len * 0.75)];

      // Calculate outliers (IQR method)
      const iqr = q3 - q1;
      const lowerBound = q1 - 1.5 * iqr;
      const upperBound = q3 + 1.5 * iqr;
      const outliers = sorted.filter(v => v < lowerBound || v > upperBound);

      return {
        min,
        q1,
        median,
        q3,
        max,
        mean: arr.reduce((a, b) => a + b, 0) / len,
        outliers,
        lowerBound,
        upperBound
      };
    };

    const xStats = calculateStats(xValues);
    const yStats = calculateStats(yValues);
    const valueStats = calculateStats(values);

    // Box plot data format: [min, Q1, median, Q3, max]
    const boxplotData = [
      [xStats.min, xStats.q1, xStats.median, xStats.q3, xStats.max],
      [yStats.min, yStats.q1, yStats.median, yStats.q3, yStats.max],
      [valueStats.min, valueStats.q1, valueStats.median, valueStats.q3, valueStats.max]
    ];

    // Outliers data
    const outlierData = [
      xStats.outliers.map(v => [0, v]),
      yStats.outliers.map(v => [1, v]),
      valueStats.outliers.map(v => [2, v])
    ].flat();

    return {
      animation: false,
      title: {
        text: 'Box Plot - Distribución Estadística',
        left: 'center',
        textStyle: {
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        trigger: 'item',
        axisPointer: {
          type: 'shadow'
        },
        formatter: function(params: any) {
          if (params.componentSubType === 'boxplot') {
            const [min, q1, median, q3, max] = params.data;
            const categories = [xAxis, yAxis, value];
            return `
              <strong>${categories[params.dataIndex]}</strong><br/>
              Máximo: ${max.toFixed(4)}<br/>
              Q3 (75%): ${q3.toFixed(4)}<br/>
              Mediana: ${median.toFixed(4)}<br/>
              Q1 (25%): ${q1.toFixed(4)}<br/>
              Mínimo: ${min.toFixed(4)}
            `;
          } else {
            return `Outlier: ${params.data[1].toFixed(4)}`;
          }
        }
      },
      grid: {
        left: '10%',
        right: '5%',
        top: '15%',
        bottom: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: [xAxis, yAxis, value],
        boundaryGap: true,
        nameGap: 30,
        scale: true,
        splitArea: {
          show: false
        },
        splitLine: {
          show: false
        }
      },
      yAxis: {
        type: 'value',
        name: 'Valores',
        nameLocation: 'middle',
        nameGap: 50,
        scale: true,
        splitArea: {
          show: true
        }
      },
      series: [
        {
          name: 'boxplot',
          type: 'boxplot',
          data: boxplotData,
          itemStyle: {
            color: '#3b82f6',
            borderColor: '#1e40af'
          },
          emphasis: {
            itemStyle: {
              color: '#60a5fa',
              borderColor: '#1e3a8a',
              borderWidth: 2,
              shadowBlur: 10,
              shadowOffsetX: 0,
              shadowOffsetY: 0,
              shadowColor: 'rgba(0,0,0,0.3)'
            }
          }
        },
        {
          name: 'outliers',
          type: 'scatter',
          data: outlierData,
          itemStyle: {
            color: '#ef4444',
            opacity: 0.6
          },
          symbolSize: 6
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
            Box Plot de Datos Seleccionados
          </CardTitle>
          <CardDescription>
            Muestra la distribución estadística de los datos (cuartiles, outliers)
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
            Box Plot
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

export default BrushedBoxPlot;
