import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brush, AlertCircle } from 'lucide-react';
import { useBrushSelection } from '@/hooks/useBrushSelection';

/**
 * BrushedHeatmap Component
 * Displays the currently selected brush data as a 2D heatmap
 * Uses binning/aggregation to create a grid visualization
 */
const BrushedHeatmap: React.FC = () => {
  const activeBrushSelection = useBrushSelection();

  // Generate heatmap chart options from brush data
  const chartOptions = useMemo(() => {
    if (!activeBrushSelection || !activeBrushSelection.selectedPoints) return null;

    const data = activeBrushSelection.selectedPoints;
    const { xAxis, yAxis, value } = activeBrushSelection.columns;

    // Calculate bounds
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

    // Create grid bins (e.g., 50x50 grid)
    const gridSize = 50;
    const xBinSize = (maxX - minX) / gridSize;
    const yBinSize = (maxY - minY) / gridSize;

    // Initialize grid with sum and count for averaging
    const grid: { sum: number; count: number }[][] = Array.from({ length: gridSize }, () =>
      Array.from({ length: gridSize }, () => ({ sum: 0, count: 0 }))
    );

    // Bin the data
    for (let i = 0; i < data.length; i += 3) {
      const x = data[i];
      const y = data[i + 1];
      const v = data[i + 2];

      const xBin = Math.min(Math.floor((x - minX) / xBinSize), gridSize - 1);
      const yBin = Math.min(Math.floor((y - minY) / yBinSize), gridSize - 1);

      grid[yBin][xBin].sum += v;
      grid[yBin][xBin].count += 1;
    }

    // Convert grid to heatmap data format: [x, y, value]
    const heatmapData: [number, number, number][] = [];
    for (let yi = 0; yi < gridSize; yi++) {
      for (let xi = 0; xi < gridSize; xi++) {
        if (grid[yi][xi].count > 0) {
          const avgValue = grid[yi][xi].sum / grid[yi][xi].count;
          heatmapData.push([xi, yi, avgValue]);
        }
      }
    }

    return {
      animation: false,
      title: {
        text: 'Heatmap - Datos Seleccionados',
        left: 'center',
        textStyle: {
          fontSize: 14,
          fontWeight: 'bold'
        }
      },
      tooltip: {
        position: 'top',
        formatter: function(params: { data: [number, number, number] }) {
          const [xBin, yBin, val] = params.data;
          const xCenter = minX + (xBin + 0.5) * xBinSize;
          const yCenter = minY + (yBin + 0.5) * yBinSize;
          return `
            <strong>Celda [${xBin}, ${yBin}]</strong><br/>
            ${xAxis}: ${xCenter.toFixed(4)}<br/>
            ${yAxis}: ${yCenter.toFixed(4)}<br/>
            ${value} (avg): ${val.toFixed(4)}
          `;
        }
      },
      grid: {
        left: '10%',
        right: '15%',
        top: '15%',
        bottom: '15%'
      },
      xAxis: {
        name: xAxis,
        type: 'category',
        data: Array.from({ length: gridSize }, (_, i) => i),
        nameLocation: 'middle',
        nameGap: 25,
        splitArea: {
          show: true
        }
      },
      yAxis: {
        name: yAxis,
        type: 'category',
        data: Array.from({ length: gridSize }, (_, i) => i),
        nameLocation: 'middle',
        nameGap: 40,
        splitArea: {
          show: true
        }
      },
      visualMap: {
        min: minValue,
        max: maxValue,
        calculable: true,
        orient: 'vertical',
        right: 10,
        top: 'center',
        inRange: {
          color: ['#313695', '#4575b4', '#74add1', '#abd9e9', '#e0f3f8', '#ffffbf', '#fee090', '#fdae61', '#f46d43', '#d73027', '#a50026']
        },
        textStyle: {
          color: '#374151',
          fontSize: 10
        }
      },
      series: [{
        name: value,
        type: 'heatmap',
        data: heatmapData,
        emphasis: {
          itemStyle: {
            shadowBlur: 10,
            shadowColor: 'rgba(0, 0, 0, 0.5)'
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
            Heatmap de Datos Seleccionados
          </CardTitle>
          <CardDescription>
            Muestra un mapa de calor de los puntos seleccionados
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
            Heatmap
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

export default BrushedHeatmap;
