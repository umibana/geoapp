import React, { useMemo, useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
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

  // Generate bar chart options from BACKEND-COMPUTED histogram data
  const chartOptions = useMemo(() => {
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


    // All computation is done in backend - just use the data!
    return {
      animation: false,
      title: {
        text: `Histograma - ${columnToDisplay}`,
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
          const binRange = histogram.bin_ranges[dataIndex];
          const count = histogram.bin_counts[dataIndex];
          const percentage = ((count / histogram.total_count) * 100).toFixed(2);
          return `
            <strong>Rango: ${binRange}</strong><br/>
            Frecuencia: ${count} puntos<br/>
            Porcentaje: ${percentage}%
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
        name: columnToDisplay,
        type: 'category',
        data: histogram.bin_ranges,
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
        data: histogram.bin_counts,
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
          {/* Column Selector */}
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

export default BrushedBarChart;
