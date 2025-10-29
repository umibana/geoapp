import React from 'react';
import { MosaicLayout } from './MosaicLayout';
import { useMosaicManager, ChartTypeDefinition } from './useMosaicManager';
import BrushedBarChart from '@/components/chart-components/BrushedBarChart';
import BrushedLineChart from '@/components/chart-components/BrushedLineChart';
import BrushedHeatmap from '@/components/chart-components/BrushedHeatmap';
import BrushedBoxPlot from '@/components/chart-components/BrushedBoxPlot';
import BrushedDataViewer from '@/components/chart-components/BrushedDataViewer';
import { Button } from '@/components/ui/button';
import { BarChart3, LineChart, Grid3x3, Box, Database, Plus, RefreshCw } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

/**
 * Chart type definitions - this is all you need to define!
 * The useMosaicManager hook handles all the UUID generation and state management.
 */
const CHART_TYPES = {
  'bar-chart': {
    type: 'bar-chart',
    title: 'Histograma',
    component: BrushedBarChart,
    icon: <BarChart3 className="h-4 w-4" />,
  },
  'line-chart': {
    type: 'line-chart',
    title: 'Linea',
    component: BrushedLineChart,
    icon: <LineChart className="h-4 w-4" />,
  },
  'heatmap': {
    type: 'heatmap',
    title: 'Mapa de Calor',
    component: BrushedHeatmap,
    icon: <Grid3x3 className="h-4 w-4" />,
  },
  'box-plot': {
    type: 'box-plot',
    title: 'Box Plot',
    component: BrushedBoxPlot,
    icon: <Box className="h-4 w-4" />,
  },
  'data-viewer': {
    type: 'data-viewer',
    title: 'Scatter',
    component: BrushedDataViewer,
    icon: <Database className="h-4 w-4" />,
  },
} satisfies Record<string, ChartTypeDefinition>;

/**
 * ChartMosaicExample - Main component with sidebar for managing chart instances
 *
 * This component now uses the useMosaicManager hook which abstracts away all the
 * complexity of UUID generation, state management, and instance tracking.
 */
const ChartMosaicExample: React.FC = () => {
  // We use the mosaic hook to handle re-open of closed panes
  const {
    components,
    currentLayout,
    closedCharts,
    addChart,
    reopenChart,
    resetLayout,
    updateLayout,
  } = useMosaicManager(CHART_TYPES);

  return (
    <div className="w-full h-screen flex">
      {/* Sidebar for managing charts */}
      <div className="w-64 border-r bg-background flex flex-col">
        <div className="p-4 border-b">
          <h2 className="font-semibold text-lg mb-2">Graficos</h2>
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={resetLayout}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Reiniciar Layout
          </Button>
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">
                Agregar Grafico
              </h3>
              <div className="space-y-2">
                {Object.entries(CHART_TYPES).map(([key, config]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    className="w-full justify-start"
                    onClick={() => addChart(config.type)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {config.icon}
                    <span className="ml-2">{config.title}</span>
                  </Button>
                ))}
              </div>
            </div>

            <Separator />

            {/* Re-open closed windows */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground">
               Ultimos cerrados
              </h3>
              {Object.entries(closedCharts).map(([chartType, instances]) => {
                if (instances.length === 0) return null;

                const config = CHART_TYPES[chartType as keyof typeof CHART_TYPES];

                return (
                  <div key={chartType} className="mb-4">
                    <p className="text-xs text-muted-foreground mb-2 flex items-center">
                      {config.icon}
                      <span className="ml-1">{config.title}</span>
                      <span className="ml-auto">({instances.length})</span>
                    </p>
                    <div className="space-y-1">
                      {instances.map((instance) => (
                        <Button
                          key={instance.id}
                          variant="ghost"
                          size="sm"
                          className="w-full justify-start text-xs"
                          onClick={() => reopenChart(instance.id)}
                        >
                          {instance.title}
                        </Button>
                      ))}
                    </div>
                  </div>
                );
              })}
              {Object.values(closedCharts).every((arr) => arr.length === 0) && (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay graficos cerrados
                </p>
              )}
            </div>
          </div>
        </ScrollArea>
      </div>

      {/* Main mosaic layout */}
      <div className="flex-1">
        <MosaicLayout
          components={components}
          value={currentLayout}
          onChange={(newLayout) => {
            updateLayout(newLayout);
            console.log('Layout changed:', newLayout);
          }}
        />
      </div>
    </div>
  );
};

export default ChartMosaicExample;
