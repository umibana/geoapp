import React, { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Brush, AlertCircle } from 'lucide-react';
import { useBrushSelection } from '@/hooks/useBrushSelection';

/**
 * Brushed BoxPlot Component
 * Displays the currently selected brush data as a box plot
 * Uses BACKEND-COMPUTED statistics (no frontend calculation!)
 */
const BrushedBoxPlot: React.FC = () => {
  const activeBrushSelection = useBrushSelection();

  // Generate box plot options from BACKEND-COMPUTED box plot data
  const chartOptions = useMemo(() => {
    console.log('🔍 BrushedBoxPlot: Checking for statistics');
    console.log('📊 activeBrushSelection:', activeBrushSelection);
    console.log('📊 Has statistics?', !!activeBrushSelection?.statistics);
    console.log('📊 Has boxPlots?', !!activeBrushSelection?.statistics?.boxPlots);

    // Check if we have backend statistics
    if (!activeBrushSelection?.statistics?.boxPlots) {
      console.log('❌ No boxPlots in statistics');
      return null;
    }

    const boxPlots = activeBrushSelection.statistics.boxPlots;
    console.log('📊 Box plots array:', boxPlots);
    console.log('📊 Box plots length:', boxPlots.length);

    // Need at least one box plot
    if (!boxPlots || boxPlots.length === 0) {
      console.log('❌ Box plots array is empty');
      return null;
    }

    console.log('✅ Box plots found:', boxPlots.length, 'columns');

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
        bottom: '10%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        data: boxPlots.map(bp => bp.column_name),
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

  console.log('📈 BrushedBoxPlot render - chartOptions:', !!chartOptions);

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
          {chartOptions ? (
            <ReactECharts
              option={chartOptions}
              style={{ height: '100%', width: '100%', minHeight: '300px' }}
              opts={{ renderer: 'canvas' }}
            />
          ) : (
            <div className="flex items-center justify-center h-full">
              <p className="text-muted-foreground">
                ⚠️ No chart data available. Check console for details.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default BrushedBoxPlot;
