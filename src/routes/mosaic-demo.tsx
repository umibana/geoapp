import { createFileRoute } from '@tanstack/react-router';
import ChartMosaicExample from '@/components/mosaic/ChartMosaicExample';

/**
 * Mosaic Demo Page
 *
 * This page demonstrates the Mosaic Layout system with your existing chart components.
 * Navigate to /mosaic-demo to see it in action!
 */
export const Route = createFileRoute('/mosaic-demo')({
  component: MosaicDemoPage,
});

function MosaicDemoPage() {
  return (
    <div className="w-full h-screen flex flex-col">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-border bg-card px-6 py-4">
        <h1 className="text-2xl font-bold">Mosaic Layout Demo</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Drag, resize, and rearrange chart windows. All charts share the same Zustand brush selection state.
        </p>
      </div>

      {/* Mosaic Layout */}
      <div className="flex-1 overflow-hidden">
        <ChartMosaicExample />
      </div>
    </div>
  );
}

export default MosaicDemoPage;
