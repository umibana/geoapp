/**
 * Mosaic Layout System
 *
 * A generic, developer-friendly window management system built on react-mosaic.
 * Makes it easy to create flexible, resizable dashboard layouts.
 *
 * @example Simple usage
 * ```tsx
 * import { MosaicLayout } from '@/components/mosaic';
 *
 * const components = {
 *   'my-chart': {
 *     id: 'my-chart',
 *     title: 'My Chart',
 *     component: MyChartComponent,
 *   },
 * };
 *
 * <MosaicLayout components={components} />
 * ```
 *
 * @example Advanced usage with persistence
 * ```tsx
 * import { AdvancedMosaicLayout } from '@/components/mosaic';
 *
 * <AdvancedMosaicLayout
 *   components={components}
 *   persistLayout={true}
 *   persistKey="my-dashboard"
 * />
 * ```
 */

// Main components
export { MosaicLayout } from './MosaicLayout';
export type { MosaicLayoutProps, MosaicComponentConfig } from './MosaicLayout';

export { AdvancedMosaicLayout } from './AdvancedMosaicLayout';
export type {
  AdvancedMosaicLayoutProps,
  AdvancedMosaicComponentConfig,
} from './AdvancedMosaicLayout';

// Toolbar controls
export {
  CloseButton,
  ExpandButton,
  SplitButton,
  AdditionalControlsButton,
  DEFAULT_TOOLBAR_CONTROLS,
} from './MosaicToolbarControls';

// Examples
export { default as ChartMosaicExample } from './ChartMosaicExample';

// Re-export useful types from react-mosaic for convenience
export type {
  MosaicNode,
  MosaicBranch,
  MosaicDirection,
  MosaicParent,
} from 'react-mosaic-component';
