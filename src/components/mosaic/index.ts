// export types and components for mosaic

// Main components
export { MosaicLayout } from './MosaicLayout';
export type { MosaicLayoutProps, MosaicComponentConfig } from './MosaicLayout';
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
