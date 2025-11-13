import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brush, AlertCircle } from 'lucide-react';
import { useBrushSelection } from '@/hooks/useBrushSelection';

/**
 * BrushedHeatmap Component
 * Displays the currently selected brush data as a 2D heatmap
 * Uses BACKEND-COMPUTED aggregation (no frontend binning!)
 */
const BrushedHeatmap: React.FC = () => {
  const activeBrushSelection = useBrushSelection();

  // Generate heatmap chart options from BACKEND-COMPUTED heatmap data
  const chartOptions = useMemo(() => {

    // Check if we have backend statistics
    if (!activeBrushSelection?.statistics?.heatmap) {
      return null;
    }

    const heatmap = activeBrushSelection.statistics.heatmap;

    // Need cells to render
    if (!heatmap.cells || heatmap.cells.length === 0) {
      return null;
    }


    // All computation is done in backend - just use the data!
    // Convert cells to ECharts format: [x_index, y_index, avg_value]
    const heatmapData: [number, number, number][] = heatmap.cells.map(cell => [
      cell.x_index,
      cell.y_index,
      cell.avg_value
    ]);

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
          const xCenter = heatmap.min_x + (xBin + 0.5) * heatmap.x_bin_size;
          const yCenter = heatmap.min_y + (yBin + 0.5) * heatmap.y_bin_size;
          return `
            <strong>Celda [${xBin}, ${yBin}]</strong><br/>
            ${heatmap.x_column}: ${xCenter.toFixed(4)}<br/>
            ${heatmap.y_column}: ${yCenter.toFixed(4)}<br/>
            ${heatmap.value_column} (avg): ${val.toFixed(4)}
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
        name: heatmap.x_column,
        type: 'category',
        data: Array.from({ length: heatmap.grid_size_x }, (_, i) => i),
        nameLocation: 'middle',
        nameGap: 25,
        splitArea: {
          show: true
        }
      },
      yAxis: {
        name: heatmap.y_column,
        type: 'category',
        data: Array.from({ length: heatmap.grid_size_y }, (_, i) => i),
        nameLocation: 'middle',
        nameGap: 40,
        splitArea: {
          show: true
        }
      },
      visualMap: {
        min: heatmap.min_value,
        max: heatmap.max_value,
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
        name: heatmap.value_column,
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


      {/* Chart */}
          {chartOptions ? (
            <ReactECharts
              option={chartOptions}
              style={{ height: '100%', width: '100%', minHeight: '300px' }}
              opts={{ renderer: 'canvas' }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">
                No hay datos disponibles para mostrar
              </p>
            </div>
          )}
    </div>
  );
};

export default BrushedHeatmap;
