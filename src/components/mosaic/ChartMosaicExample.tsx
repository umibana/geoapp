import React from 'react';
import { MosaicLayout, MosaicComponentConfig } from './MosaicLayout';
import BrushedBarChart from '@/components/chart-components/BrushedBarChart';
import BrushedLineChart from '@/components/chart-components/BrushedLineChart';
import BrushedHeatmap from '@/components/chart-components/BrushedHeatmap';
import BrushedBoxPlot from '@/components/chart-components/BrushedBoxPlot';
import BrushedDataViewer from '@/components/chart-components/BrushedDataViewer';

/**
 * ChartMosaicExample - Example usage of MosaicLayout with chart components
 *
 * This demonstrates how easy it is to create a flexible dashboard layout
 * with your existing chart components. Simply register your components
 * and the MosaicLayout handles all the window management!
 *
 * Features demonstrated:
 * - Easy component registration with icons and titles
 * - Auto-balanced initial layout
 * - Drag-and-drop window repositioning
 * - Resizable panes
 * - Window controls (maximize, close)
 * - All charts share the same Zustand brush selection state
 */
const ChartMosaicExample: React.FC = () => {
  // Define your component registry
  // This is all you need to do - no complex setup!
  const components: Record<string, MosaicComponentConfig> = {
    'bar-chart': {
      id: 'bar-chart',
      title: 'Histogram',
      component: BrushedBarChart,
    },
    'line-chart': {
      id: 'line-chart',
      title: 'Line Chart',
      component: BrushedLineChart,
    },
    'heatmap': {
      id: 'heatmap',
      title: 'Heatmap',
      component: BrushedHeatmap,
    },
    'box-plot': {
      id: 'box-plot',
      title: 'Box Plot',
      component: BrushedBoxPlot,
    },
    'data-viewer': {
      id: 'data-viewer',
      title: 'Data Viewer',
      component: BrushedDataViewer,
    },
  };

  // Optional: Define a custom initial layout
  // If not provided, MosaicLayout will auto-balance all components
  const customLayout = {
    direction: 'row' as const,
    first: {
      direction: 'column' as const,
      first: 'line-chart',
      second: 'bar-chart',
      splitPercentage: 60,
    },
    second: {
      direction: 'column' as const,
      first: 'heatmap',
      second: {
        direction: 'row' as const,
        first: 'box-plot',
        second: 'data-viewer',
        splitPercentage: 50,
      },
      splitPercentage: 50,
    },
    splitPercentage: 50,
  };

  return (
    <div className="w-full h-screen">
      <MosaicLayout
        components={components}
        initialLayout={customLayout}
        onChange={(newLayout) => {
          // Optional: persist layout to localStorage or backend
          console.log('Layout changed:', newLayout);
        }}
      />
    </div>
  );
};

export default ChartMosaicExample;
