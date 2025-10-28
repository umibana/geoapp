import React from 'react';
import { MosaicLayout, MosaicComponentConfig } from './MosaicLayout';
import BrushedBarChart from '@/components/chart-components/BrushedBarChart';
import BrushedLineChart from '@/components/chart-components/BrushedLineChart';
import BrushedHeatmap from '@/components/chart-components/BrushedHeatmap';
import BrushedBoxPlot from '@/components/chart-components/BrushedBoxPlot';
import BrushedDataViewer from '@/components/chart-components/BrushedDataViewer';

const ChartMosaicExample: React.FC = () => {
  // component registry
  // We could also define directly in the component like this:
  // But we use the current method to keep the components separate and easy to manage.
  // const SimpleMosaicExample: React.FC = () => {
  //   return (
  //     <div className="w-full h-screen">
  //       <MosaicLayout
  //         components={{
  //           'chart-1': {
  //             id: 'chart-1',
  //             title: 'Bar Chart',
  //             component: BrushedBarChart,
  //           },
  //           'chart-2': {
  //             id: 'chart-2',
  //             title: 'Line Chart',
  //             component: BrushedLineChart,
  //           },
  //         }}
  //       />
  //     </div>
  //   );
  // };
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

  // Optional custom initial layout
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
          // TODO: do something with layout change
          // Maybe we can cleanup old data?
          console.log('Layout changed:', newLayout);
        }}
      />
    </div>
  );
};

export default ChartMosaicExample;
