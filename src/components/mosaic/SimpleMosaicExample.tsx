import React from 'react';
import { MosaicLayout } from './MosaicLayout';
import BrushedBarChart from '@/components/chart-components/BrushedBarChart';
import BrushedLineChart from '@/components/chart-components/BrushedLineChart';

/**
 * SimpleMosaicExample - Minimal example showing how easy it is to use MosaicLayout
 *
 * This is the simplest possible usage - just define your components
 * and MosaicLayout does the rest!
 */
const SimpleMosaicExample: React.FC = () => {
  return (
    <div className="w-full h-screen">
      <MosaicLayout
        components={{
          'chart-1': {
            id: 'chart-1',
            title: 'Bar Chart',
            component: BrushedBarChart,
          },
          'chart-2': {
            id: 'chart-2',
            title: 'Line Chart',
            component: BrushedLineChart,
          },
        }}
      />
    </div>
  );
};

export default SimpleMosaicExample;
