import React, { useMemo } from 'react';
import { MosaicLayout } from './MosaicLayout';
import { useMosaicManager, ChartTypeDefinition } from './useMosaicManager';
import BrushedBarChart from '@/components/chart-components/BrushedBarChart';
import BrushedLineChart from '@/components/chart-components/BrushedLineChart';
import BrushedHeatmap from '@/components/chart-components/BrushedHeatmap';
import BrushedBoxPlot from '@/components/chart-components/BrushedBoxPlot';
import DatasetViewer from '@/components/DatasetViewer';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { BarChart3, LineChart, Grid3x3, Box, Database, Plus, RefreshCw, Settings2, X } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { useBrushStore } from '@/stores/brushStore';

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
    title: 'Dataset Viewer (con Brush)',
    component: DatasetViewer,
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

  // Get dataset and column selection from Zustand store
  const selectedDataset = useBrushStore((state) => state.selectedDataset);
  const globalColumns = useBrushStore((state) => state.globalColumns);
  const setGlobalColumns = useBrushStore((state) => state.setGlobalColumns);
  const brushSelection = useBrushStore((state) => 
    selectedDataset ? state.getBrushSelection(selectedDataset.id) : null
  );
  const clearBrushSelection = useBrushStore((state) => state.clearBrushSelection);
  const setSelectedDataset = useBrushStore((state) => state.setSelectedDataset);

  // Get available columns from dataset
  const availableColumns = useMemo(() => {
    if (!selectedDataset || !selectedDataset.column_mappings) return [];
    return selectedDataset.column_mappings
      .filter(m => m.column_type !== 3) // Exclude UNUSED columns
      .map(m => m.column_name);
  }, [selectedDataset]);

  // Handle column change
  const handleColumnChange = (axis: 'xAxis' | 'yAxis' | 'value', columnName: string) => {
    if (!globalColumns) return;
    setGlobalColumns({
      ...globalColumns,
      [axis]: columnName
    });
  };

  return (
    <div className="w-full h-screen flex">
      {/* Sidebar for managing charts */}
      <div className="w-64 border-r bg-background flex flex-col">
        <div className="p-4 border-b space-y-2">
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
          {brushSelection && (
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={async () => {
                if (!selectedDataset || !globalColumns) return;
                
                // Refetch full dataset with statistics (same as initial load in ProjectManager)
                try {
                  const response = await window.autoGrpc.getDatasetData({
                    dataset_id: selectedDataset.id,
                    columns: [globalColumns.xAxis, globalColumns.yAxis, globalColumns.value]
                  });
                  
                  // Update the dataset data in store first
                  setSelectedDataset(selectedDataset, response, globalColumns);
                  
                  // Recreate initial "full dataset" brush selection with statistics
                  if (response.binary_data && response.data_length > 0) {
                    const fullData = new Float32Array(
                      response.binary_data.buffer,
                      response.binary_data.byteOffset,
                      response.data_length
                    );

                    const xBoundary = response.data_boundaries?.find(b => b.column_name === globalColumns.xAxis);
                    const yBoundary = response.data_boundaries?.find(b => b.column_name === globalColumns.yAxis);

                    // Convert data_boundaries array to Record
                    const boundariesMap: Record<string, any> = {};
                    if (response.data_boundaries) {
                      response.data_boundaries.forEach(boundary => {
                        boundariesMap[boundary.column_name] = boundary;
                      });
                    }

                    const initialBrushSelection = {
                      datasetId: selectedDataset.id,
                      coordRange: {
                        x1: xBoundary?.min_value ?? 0,
                        x2: xBoundary?.max_value ?? 100,
                        y1: yBoundary?.min_value ?? 0,
                        y2: yBoundary?.max_value ?? 100
                      },
                      selectedIndices: Array.from({ length: response.total_count }, (_, i) => i),
                      selectedPoints: fullData,
                      columns: globalColumns,
                      timestamp: Date.now(),
                      statistics: {
                        histograms: response.histograms || {},
                        boxPlots: response.box_plots || [],
                        heatmap: response.heatmap,
                        totalCount: response.total_count,
                        boundaries: boundariesMap
                      },
                      datasetInfo: {
                        id: selectedDataset.id,
                        name: selectedDataset.file_name,
                        totalRows: selectedDataset.total_rows,
                        fileId: selectedDataset.file_id
                      }
                    };

                    // Replace the brush selection with the full dataset
                    const { setBrushSelection } = useBrushStore.getState();
                    setBrushSelection(selectedDataset.id, initialBrushSelection);
                    
                    console.log('✅ Reset to full dataset with statistics');
                  }
                } catch (error) {
                  console.error('Error refetching full dataset:', error);
                }
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Limpiar Selección
            </Button>
          )}
        </div>

        <ScrollArea className="flex-1">
          <div className="p-4 space-y-6">
            {/* Global Column Selection */}
            <div>
              <h3 className="text-sm font-medium mb-3 text-muted-foreground flex items-center">
                <Settings2 className="h-4 w-4 mr-2" />
                Configuración Global
              </h3>
              {!selectedDataset ? (
                <div className="text-xs text-muted-foreground p-3 bg-muted rounded-md">
                  No hay dataset seleccionado. Selecciona un dataset desde el administrador de proyectos.
                </div>
              ) : (
                <div className="space-y-3">
                  <div>
                    <Label htmlFor="global-x" className="text-xs">Eje X</Label>
                    <Select
                      value={globalColumns?.xAxis || ''}
                      onValueChange={(value) => handleColumnChange('xAxis', value)}
                    >
                      <SelectTrigger id="global-x" className="h-8 text-xs">
                        <SelectValue placeholder="Seleccionar X" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableColumns.map((col) => (
                          <SelectItem key={col} value={col} className="text-xs">
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="global-y" className="text-xs">Eje Y</Label>
                    <Select
                      value={globalColumns?.yAxis || ''}
                      onValueChange={(value) => handleColumnChange('yAxis', value)}
                    >
                      <SelectTrigger id="global-y" className="h-8 text-xs">
                        <SelectValue placeholder="Seleccionar Y" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableColumns.map((col) => (
                          <SelectItem key={col} value={col} className="text-xs">
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="global-value" className="text-xs">Valor (Z)</Label>
                    <Select
                      value={globalColumns?.value || ''}
                      onValueChange={(value) => handleColumnChange('value', value)}
                    >
                      <SelectTrigger id="global-value" className="h-8 text-xs">
                        <SelectValue placeholder="Seleccionar Z" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableColumns.map((col) => (
                          <SelectItem key={col} value={col} className="text-xs">
                            {col}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}
            </div>

            <Separator />

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
