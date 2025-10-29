import React, { useMemo, useState, useEffect } from 'react';
import ReactECharts from 'echarts-for-react';
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

  // Generate box plot options from BACKEND-COMPUTED box plot data
  const chartData = useMemo(() => {
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


    // All computation is done in backend - just use the data!
    // Box plot data format: [min, Q1, median, Q3, max]
    const boxplotData = boxPlots.map(bp => [
      bp.min,
      bp.q1,
      bp.median,
      bp.q3,
      bp.max
    ]);

    // Outliers data: [columnIndex, outlierValue]
    const outlierData = boxPlots.flatMap((bp, i) =>
      bp.outliers.map(v => [i, v])
    );

    // Calculate smart zoom range based on IQR (excluding extreme outliers)
    // This helps visualize the main distribution when outliers are far away
    const allQ1 = boxPlots.map(bp => bp.q1);
    const allQ3 = boxPlots.map(bp => bp.q3);

    const minQ1 = Math.min(...allQ1);
    const maxQ3 = Math.max(...allQ3);
    const iqrRange = maxQ3 - minQ1;

    // Extend the view by 50% of IQR on each side to show whiskers and some outliers
    const viewMin = minQ1 - iqrRange * 0.5;
    const viewMax = maxQ3 + iqrRange * 0.5;

    // Get actual data range including outliers
    const allMin = Math.min(...boxPlots.map(bp => bp.min), ...outlierData.map(d => d[1]));
    const allMax = Math.max(...boxPlots.map(bp => bp.max), ...outlierData.map(d => d[1]));
    const totalRange = allMax - allMin;

    // Calculate start/end percentages for dataZoom
    const startPercent = Math.max(0, ((viewMin - allMin) / totalRange) * 100);
    const endPercent = Math.min(100, ((viewMax - allMin) / totalRange) * 100);


    const chartOptions = {
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
            const bp = boxPlots[params.dataIndex];
            return `
              <strong>${bp.column_name}</strong><br/>
              Máximo: ${bp.max.toFixed(4)}<br/>
              Q3 (75%): ${bp.q3.toFixed(4)}<br/>
              Mediana: ${bp.median.toFixed(4)}<br/>
              Media: ${bp.mean.toFixed(4)}<br/>
              Q1 (25%): ${bp.q1.toFixed(4)}<br/>
              Mínimo: ${bp.min.toFixed(4)}<br/>
              IQR: ${bp.iqr.toFixed(4)}<br/>
              Outliers: ${bp.outliers.length}
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
        bottom: boxPlots.length > 10 ? '25%' : (boxPlots.length > 5 ? '20%' : '10%'), // More space for rotated labels
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: boxPlots.map(bp => bp.column_name),
        boundaryGap: true,
        nameGap: 30,
        scale: true,
        axisLabel: {
          rotate: boxPlots.length > 10 ? 90 : (boxPlots.length > 5 ? 45 : 0), // 90° for >10 columns, 45° for >5, straight for ≤5
          interval: 0, // Show ALL labels - never skip any
          fontSize: boxPlots.length > 20 ? 9 : (boxPlots.length > 10 ? 10 : 12), // Smaller font for many columns
          overflow: 'truncate', // Truncate long labels
          width: boxPlots.length > 10 ? 100 : 120, // Width for truncation
          ellipsis: '...', // Show ellipsis for truncated labels
          align: boxPlots.length > 10 ? 'right' : 'center', // Right-align when rotated 90°
          verticalAlign: boxPlots.length > 10 ? 'middle' : 'top' // Middle vertical align for 90° rotation
        },
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
      dataZoom: [
        {
          type: 'slider',
          yAxisIndex: 0,
          show: true,
          filterMode: 'none', // Show all data, just zoom the view
          start: startPercent, // Smart zoom to IQR range
          end: endPercent,
          width: 20,
          right: 10,
          showDetail: true,
          showDataShadow: true,
          brushSelect: false,
          backgroundColor: 'rgba(47, 69, 84, 0.1)',
          dataBackground: {
            lineStyle: {
              color: '#3b82f6',
              width: 1
            },
            areaStyle: {
              color: 'rgba(59, 130, 246, 0.2)'
            }
          },
          selectedDataBackground: {
            lineStyle: {
              color: '#1e40af'
            },
            areaStyle: {
              color: 'rgba(59, 130, 246, 0.4)'
            }
          },
          fillerColor: 'rgba(59, 130, 246, 0.15)',
          borderColor: '#ccc',
          handleSize: '80%',
          handleStyle: {
            color: '#3b82f6',
            borderColor: '#1e40af'
          },
          textStyle: {
            color: '#666'
          }
        },
        {
          type: 'inside',
          yAxisIndex: 0,
          filterMode: 'none',
          start: startPercent, // Match slider zoom
          end: endPercent,
          zoomOnMouseWheel: 'shift', // Hold shift to zoom with mouse wheel
          moveOnMouseMove: true,
          moveOnMouseWheel: true
        }
      ],
      toolbox: {
        show: true,
        feature: {
          dataZoom: {
            yAxisIndex: 'none',
            title: {
              zoom: 'Zoom',
              back: 'Reset Zoom'
            }
          },
          restore: {
            title: 'Restaurar'
          },
          saveAsImage: {
            title: 'Guardar como imagen',
            pixelRatio: 2
          }
        },
        right: 50,
        top: 10
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

    return chartOptions;
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
          {chartData ? (
            <ReactECharts
              option={chartData}
              style={{ height: '100%', width: '100%', minHeight: '500px' }}
              opts={{ renderer: 'canvas' }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">
                ⚠️ No chart data available. Check console for details.
              </p>
            </div>
          )}
    </div>
  );
};

export default BrushedBoxPlot;
