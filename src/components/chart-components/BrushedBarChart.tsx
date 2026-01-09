import React, { useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Brush, AlertCircle } from 'lucide-react';
import { useBrushSelection } from '@/hooks/useBrushSelection';

/**
 * BrushedBarChart Component
 * Displays the currently selected brush data as a bar chart (histogram)
 * Shows distribution of values across bins
 * Allows selecting which column's histogram to display
 *
 * Migrated from ECharts to Plotly.js
 */
const BrushedBarChart: React.FC = () => {
  const activeBrushSelection = useBrushSelection();

  // State for selected column (defaults to value column)
  const [selectedColumn, setSelectedColumn] = useState<string>('');

  // Get available columns from histograms
  const availableColumns = useMemo(() => {
    if (!activeBrushSelection?.statistics?.histograms) return [];
    return Object.keys(activeBrushSelection.statistics.histograms);
  }, [activeBrushSelection?.statistics?.histograms]);

  // Initialize selected column when brush selection changes
  useEffect(() => {
    if (availableColumns.length > 0 && !selectedColumn) {
      // Default to value column if available, otherwise first column
      const defaultCol = activeBrushSelection?.columns?.value || availableColumns[0];
      if (availableColumns.includes(defaultCol)) {
        setSelectedColumn(defaultCol);
      } else {
        setSelectedColumn(availableColumns[0]);
      }
    }
  }, [availableColumns, selectedColumn, activeBrushSelection?.columns?.value]);

  // Generate Plotly data and layout from BACKEND-COMPUTED histogram data
  const plotData = useMemo(() => {
    // Check if we have backend statistics
    if (!activeBrushSelection?.statistics?.histograms) {
      return null;
    }

    // Use selected column, fallback to value column
    const columnToDisplay = selectedColumn || activeBrushSelection.columns.value;
    const histogram = activeBrushSelection.statistics.histograms[columnToDisplay];

    // If histogram for this column doesn't exist, return null
    if (!histogram || !histogram.bin_ranges || histogram.bin_ranges.length === 0) {
      return null;
    }

    // Create Plotly bar trace
    const trace: Plotly.Data = {
      type: 'bar',
      x: histogram.bin_ranges,
      y: histogram.bin_counts,
      name: 'Frecuencia',
      marker: {
        color: '#3b82f6',
        line: {
          color: '#1d4ed8',
          width: 1
        }
      },
      hovertemplate: histogram.bin_ranges.map((range: string, i: number) => {
        const count = histogram.bin_counts[i];
        const percentage = ((count / histogram.total_count) * 100).toFixed(2);
        return `<b>Rango: ${range}</b><br>Frecuencia: ${count} puntos<br>Porcentaje: ${percentage}%<extra></extra>`;
      }),
      text: histogram.bin_counts.map((count: number) => {
        const percentage = ((count / histogram.total_count) * 100).toFixed(1);
        return `${percentage}%`;
      }),
      textposition: 'outside',
      textfont: {
        size: 10
      }
    };

    const layout: Partial<Plotly.Layout> = {
      title: {
        text: `Histograma - ${columnToDisplay}`,
        font: {
          size: 14,
          weight: 700
        },
        x: 0.5
      },
      xaxis: {
        title: {
          text: columnToDisplay
        },
        tickangle: -45,
        tickfont: {
          size: 10
        }
      },
      yaxis: {
        title: {
          text: 'Frecuencia'
        }
      },
      margin: {
        l: 60,
        r: 30,
        t: 50,
        b: 80
      },
      bargap: 0.1,
      hoverlabel: {
        bgcolor: 'white',
        font: { size: 12 }
      },
      autosize: true
    };

    const config: Partial<Plotly.Config> = {
      responsive: true,
      displayModeBar: true,
      displaylogo: false,
      modeBarButtonsToRemove: ['lasso2d', 'select2d'],
      toImageButtonOptions: {
        format: 'png',
        filename: `histogram_${columnToDisplay}`,
        scale: 2
      }
    };

    return { data: [trace], layout, config };
  }, [activeBrushSelection, selectedColumn]);

  // No brush selection (no data!)
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
          {(activeBrushSelection.statistics?.totalCount || activeBrushSelection.selectedIndices.length).toLocaleString()} puntos
        </Badge>
      </div>

      {/* Info Card with Column Selector */}
      <div>
        <Label htmlFor="column-select" className="text-sm font-medium">
          Columna a visualizar
        </Label>
        <Select value={selectedColumn} onValueChange={setSelectedColumn}>
          <SelectTrigger id="column-select" className="mt-1">
            <SelectValue placeholder="Seleccionar columna" />
          </SelectTrigger>
          <SelectContent>
            {availableColumns.map((col) => (
              <SelectItem key={col} value={col}>
                {col}
                {col === activeBrushSelection.columns.xAxis && ' (X)'}
                {col === activeBrushSelection.columns.yAxis && ' (Y)'}
                {col === activeBrushSelection.columns.value && ' (Valor)'}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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

export default BrushedBarChart;
