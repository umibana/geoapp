import React, { useMemo } from 'react';
import { Plot } from './PlotlyChart';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brush, AlertCircle } from 'lucide-react';
import { useBrushSelection } from '@/hooks/useBrushSelection';

/**
 * BrushedHeatmap Component
 * Displays the currently selected brush data as a 2D heatmap
 * Uses BACKEND-COMPUTED aggregation (no frontend binning!)
 *
 * Migrated from ECharts to Plotly.js
 */
const BrushedHeatmap: React.FC = () => {
  const activeBrushSelection = useBrushSelection();

  // Generate heatmap chart data from BACKEND-COMPUTED heatmap data
  const plotData = useMemo(() => {
    // Check if we have backend statistics
    if (!activeBrushSelection?.statistics?.heatmap) {
      return null;
    }

    const heatmap = activeBrushSelection.statistics.heatmap;

    // Need cells to render
    if (!heatmap.cells || heatmap.cells.length === 0) {
      return null;
    }

    // Create a 2D array for the heatmap z values
    // Initialize with null values
    const zData: (number | null)[][] = Array.from(
      { length: heatmap.grid_size_y },
      () => Array(heatmap.grid_size_x).fill(null)
    );

    // Fill in the values from cells
    heatmap.cells.forEach((cell: { x_index: number; y_index: number; avg_value: number }) => {
      if (cell.y_index < heatmap.grid_size_y && cell.x_index < heatmap.grid_size_x) {
        zData[cell.y_index][cell.x_index] = cell.avg_value;
      }
    });

    // Create x and y axis labels (bin centers)
    const xLabels = Array.from({ length: heatmap.grid_size_x }, (_, i) => {
      const center = heatmap.min_x + (i + 0.5) * heatmap.x_bin_size;
      return center.toFixed(4);
    });

    const yLabels = Array.from({ length: heatmap.grid_size_y }, (_, i) => {
      const center = heatmap.min_y + (i + 0.5) * heatmap.y_bin_size;
      return center.toFixed(4);
    });

    // Create custom hover text
    const hoverText: string[][] = zData.map((row, yIdx) =>
      row.map((val, xIdx) => {
        const xCenter = heatmap.min_x + (xIdx + 0.5) * heatmap.x_bin_size;
        const yCenter = heatmap.min_y + (yIdx + 0.5) * heatmap.y_bin_size;
        return `<b>Celda [${xIdx}, ${yIdx}]</b><br>${heatmap.x_column}: ${xCenter.toFixed(4)}<br>${heatmap.y_column}: ${yCenter.toFixed(4)}<br>${heatmap.value_column} (avg): ${val !== null ? val.toFixed(4) : 'N/A'}`;
      })
    );

    // Plotly heatmap trace
    const trace: Plotly.Data = {
      type: 'heatmap',
      z: zData,
      x: xLabels,
      y: yLabels,
      colorscale: [
        [0, '#313695'],
        [0.1, '#4575b4'],
        [0.2, '#74add1'],
        [0.3, '#abd9e9'],
        [0.4, '#e0f3f8'],
        [0.5, '#ffffbf'],
        [0.6, '#fee090'],
        [0.7, '#fdae61'],
        [0.8, '#f46d43'],
        [0.9, '#d73027'],
        [1, '#a50026']
      ],
      zmin: heatmap.min_value,
      zmax: heatmap.max_value,
      colorbar: {
        title: {
          text: heatmap.value_column,
          side: 'right'
        },
        thickness: 20,
        len: 0.8
      },
      hovertemplate: '%{customdata}<extra></extra>',
      customdata: hoverText as unknown as Plotly.Datum[][],
      showscale: true
    };

    const layout: Partial<Plotly.Layout> = {
      title: {
        text: 'Heatmap - Datos Seleccionados',
        font: {
          size: 14,
          weight: 700
        },
        x: 0.5
      },
      xaxis: {
        title: {
          text: heatmap.x_column
        },
        tickangle: -45,
        tickfont: {
          size: 10
        },
        showgrid: false
      },
      yaxis: {
        title: {
          text: heatmap.y_column
        },
        tickfont: {
          size: 10
        },
        showgrid: false
      },
      margin: {
        l: 80,
        r: 80,
        t: 50,
        b: 80
      },
      autosize: true,
      hoverlabel: {
        bgcolor: 'white',
        font: { size: 11 }
      }
    };

    const config: Partial<Plotly.Config> = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: {
        format: 'png',
        filename: 'heatmap',
        scale: 2
      }
    };

    return { data: [trace], layout, config };
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
      <div className="flex-1" style={{ minHeight: '300px' }}>
        {plotData ? (
          <Plot
            data={plotData.data}
            layout={plotData.layout}
            config={plotData.config}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
          />
        ) : (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">
              No hay datos disponibles para mostrar
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export default BrushedHeatmap;
