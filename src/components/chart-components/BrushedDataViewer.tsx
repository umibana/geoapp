import React, { useMemo } from 'react';
import Plot from 'react-plotly.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brush, AlertCircle } from 'lucide-react';
import { useBrushSelection } from '@/hooks/useBrushSelection';

/**
 * BrushedDataViewer Component
 * Displays the currently selected brush data from Zustand store
 * Updates automatically when brush selection changes
 *
 * Migrated from ECharts to Plotly.js
 */
const BrushedDataViewer: React.FC = () => {
  const activeBrushSelection = useBrushSelection();

  // Generate chart data from brush data
  const plotData = useMemo(() => {
    if (!activeBrushSelection || !activeBrushSelection.selectedPoints) return null;

    const data = activeBrushSelection.selectedPoints;
    const { xAxis, yAxis, value } = activeBrushSelection.columns;

    // Parse Float32Array data into arrays for Plotly
    // Data format: [x1, y1, v1, x2, y2, v2, ...]
    const xData: number[] = [];
    const yData: number[] = [];
    const valueData: number[] = [];

    for (let i = 0; i < data.length; i += 3) {
      xData.push(data[i]);
      yData.push(data[i + 1]);
      valueData.push(data[i + 2]);
    }

    // Calculate min/max for color scale
    const minVal = Math.min(...valueData);
    const maxVal = Math.max(...valueData);

    // Use scattergl for better performance with large datasets
    const trace: Plotly.Data = {
      type: data.length > 6000 ? 'scattergl' : 'scatter',
      mode: 'markers',
      x: xData,
      y: yData,
      marker: {
        color: valueData,
        colorscale: [
          [0, '#1e40af'],
          [0.1, '#3b82f6'],
          [0.2, '#60a5fa'],
          [0.3, '#93c5fd'],
          [0.4, '#dbeafe'],
          [0.5, '#fef3c7'],
          [0.6, '#fcd34d'],
          [0.7, '#f59e0b'],
          [0.8, '#d97706'],
          [1, '#b45309']
        ],
        cmin: minVal,
        cmax: maxVal,
        size: 5,
        opacity: 0.8,
        colorbar: {
          title: {
            text: value,
            side: 'right'
          },
          thickness: 15,
          len: 0.8
        }
      },
      hovertemplate: `<b>Punto</b><br>${xAxis}: %{x:.4f}<br>${yAxis}: %{y:.4f}<br>${value}: %{marker.color:.4f}<extra></extra>`,
      name: `${value} values`
    };

    const layout: Partial<Plotly.Layout> = {
      title: {
        text: 'Datos Seleccionados con Brush',
        font: {
          size: 14,
          weight: 700
        },
        x: 0.5
      },
      xaxis: {
        title: {
          text: xAxis
        },
        zeroline: false
      },
      yaxis: {
        title: {
          text: yAxis
        },
        zeroline: false
      },
      margin: {
        l: 60,
        r: 80,
        t: 50,
        b: 50
      },
      autosize: true,
      hovermode: 'closest',
      hoverlabel: {
        bgcolor: 'white',
        font: { size: 11 }
      },
      dragmode: 'zoom'
    };

    const config: Partial<Plotly.Config> = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: {
        format: 'png',
        filename: 'scatter_selected',
        scale: 2
      },
      scrollZoom: true
    };

    return { data: [trace], layout, config };
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

      {/* Chart - Uses Plotly for visualization */}
      <div className="flex-1" style={{ minHeight: '300px' }}>
        {plotData && (
          <Plot
            data={plotData.data}
            layout={plotData.layout}
            config={plotData.config}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler={true}
          />
        )}
      </div>
    </div>
  );
};

export default BrushedDataViewer;
