import React, { useMemo, useState, useEffect } from 'react';
import Plot from 'react-plotly.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Brush, AlertCircle, ListFilter } from 'lucide-react';
import { useBrushSelection } from '@/hooks/useBrushSelection';

/**
 * Brushed BoxPlot Component
 * Displays the currently selected brush data as a box plot
 * Uses BACKEND-COMPUTED statistics (no frontend calculation!)
 *
 * Migrated from ECharts to Plotly.js
 */
const BrushedBoxPlot: React.FC = () => {
  const activeBrushSelection = useBrushSelection();
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [showColumnSelector, setShowColumnSelector] = useState(false);

  // Initialize selected columns when brush selection changes
  useEffect(() => {
    if (activeBrushSelection?.statistics?.boxPlots) {
      const allColumns = activeBrushSelection.statistics.boxPlots.map(bp => bp.column_name);
      setSelectedColumns(allColumns);
    } else {
      setSelectedColumns([]);
    }
  }, [activeBrushSelection?.datasetId]); // Reset when dataset changes

  // Generate box plot data from BACKEND-COMPUTED box plot data
  const plotData = useMemo(() => {
    if (!activeBrushSelection?.statistics?.boxPlots) {
      return null;
    }

    // Filter box plots based on selected columns
    const allBoxPlots = activeBrushSelection.statistics.boxPlots;

    // If no columns selected yet, show all
    const boxPlots = selectedColumns.length > 0
      ? allBoxPlots.filter(bp => selectedColumns.includes(bp.column_name))
      : allBoxPlots;

    // Need at least one box plot
    if (!boxPlots || boxPlots.length === 0) {
      return null;
    }

    // Create Plotly box traces - one trace per column
    const traces: Plotly.Data[] = boxPlots.map((bp, index) => {
      // Plotly box plot with precomputed statistics
      return {
        type: 'box',
        name: bp.column_name,
        // Use lowerfence/upperfence for whiskers, q1/median/q3 for box
        lowerfence: [bp.min],
        q1: [bp.q1],
        median: [bp.median],
        q3: [bp.q3],
        upperfence: [bp.max],
        mean: [bp.mean],
        // Add outliers as separate points if any exist
        ...(bp.outliers.length > 0 && {
          // We need to create a separate scatter for outliers
        }),
        boxpoints: false, // Don't show underlying points
        boxmean: 'sd', // Show mean and standard deviation
        marker: {
          color: `hsl(${(index * 137.5) % 360}, 70%, 50%)`,
          outliercolor: '#ef4444',
          size: 6
        },
        line: {
          color: '#1e40af',
          width: 2
        },
        fillcolor: `hsla(${(index * 137.5) % 360}, 70%, 50%, 0.3)`,
        hoverinfo: 'all',
        hovertemplate: `
<b>${bp.column_name}</b><br>
Máximo: ${bp.max.toFixed(4)}<br>
Q3 (75%): ${bp.q3.toFixed(4)}<br>
Mediana: ${bp.median.toFixed(4)}<br>
Media: ${bp.mean.toFixed(4)}<br>
Q1 (25%): ${bp.q1.toFixed(4)}<br>
Mínimo: ${bp.min.toFixed(4)}<br>
IQR: ${bp.iqr.toFixed(4)}<br>
Outliers: ${bp.outliers.length}
<extra></extra>`
      } as Plotly.Data;
    });

    // Add outlier scatter traces for each box plot that has outliers
    boxPlots.forEach((bp, index) => {
      if (bp.outliers.length > 0) {
        traces.push({
          type: 'scatter',
          mode: 'markers',
          name: `${bp.column_name} outliers`,
          x: bp.outliers.map(() => bp.column_name),
          y: bp.outliers,
          marker: {
            color: '#ef4444',
            size: 6,
            symbol: 'diamond',
            opacity: 0.7
          },
          hovertemplate: `<b>Outlier</b><br>${bp.column_name}: %{y:.4f}<extra></extra>`,
          showlegend: false
        } as Plotly.Data);
      }
    });

    const layout: Partial<Plotly.Layout> = {
      title: {
        text: 'Box Plot - Distribución Estadística',
        font: {
          size: 14,
          weight: 700
        },
        x: 0.5
      },
      xaxis: {
        title: {
          text: ''
        },
        tickangle: boxPlots.length > 10 ? -90 : (boxPlots.length > 5 ? -45 : 0),
        tickfont: {
          size: boxPlots.length > 20 ? 9 : (boxPlots.length > 10 ? 10 : 12)
        }
      },
      yaxis: {
        title: {
          text: 'Valores'
        },
        zeroline: false
      },
      margin: {
        l: 60,
        r: 30,
        t: 50,
        b: boxPlots.length > 10 ? 120 : (boxPlots.length > 5 ? 80 : 50)
      },
      showlegend: false,
      boxmode: 'group',
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
        filename: 'boxplot',
        scale: 2
      }
    };

    return { data: traces, layout, config };
  }, [activeBrushSelection, selectedColumns]);

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
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowColumnSelector(!showColumnSelector)}
            className="flex items-center gap-2"
          >
            <ListFilter className="h-4 w-4" />
            Filtrar Columnas ({selectedColumns.length})
          </Button>
          <Badge variant="default" className="px-3 py-1">
            {activeBrushSelection.selectedIndices.length.toLocaleString()} puntos
          </Badge>
        </div>
      </div>

      {/* Column Selector */}
      {showColumnSelector && activeBrushSelection?.statistics?.boxPlots && (
        <Card className="flex-shrink-0">
          <CardHeader>
            <CardTitle className="text-sm">Seleccionar Columnas</CardTitle>
            <CardDescription className="text-xs">
              Selecciona qué columnas mostrar en el box plot (útil para agrupar escalas similares)
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center gap-2 mb-3">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const allColumns = activeBrushSelection?.statistics?.boxPlots?.map(bp => bp.column_name) || [];
                  setSelectedColumns(allColumns);
                }}
              >
                Seleccionar Todas
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedColumns([])}
              >
                Deseleccionar Todas
              </Button>
            </div>
            <ScrollArea className="h-[200px] pr-4">
              <div className="space-y-2">
                {activeBrushSelection.statistics.boxPlots.map((bp) => (
                  <div key={bp.column_name} className="flex items-center space-x-2">
                    <Checkbox
                      id={`col-${bp.column_name}`}
                      checked={selectedColumns.includes(bp.column_name)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setSelectedColumns([...selectedColumns, bp.column_name]);
                        } else {
                          setSelectedColumns(selectedColumns.filter(c => c !== bp.column_name));
                        }
                      }}
                    />
                    <label
                      htmlFor={`col-${bp.column_name}`}
                      className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer flex-1"
                    >
                      {bp.column_name}
                      <span className="text-xs text-muted-foreground ml-2">
                        (median: {bp.median.toFixed(2)})
                      </span>
                    </label>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      <div className="flex-1" style={{ minHeight: '500px' }}>
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

export default BrushedBoxPlot;
