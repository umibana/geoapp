import React, { useState, useCallback, useMemo } from 'react';
import {
  Mosaic,
  MosaicWindow,
  MosaicNode,
  MosaicBranch,
  createBalancedTreeFromLeaves,
} from 'react-mosaic-component';
import { LayoutGrid } from 'lucide-react';
import 'react-mosaic-component/react-mosaic-component.css';
import './mosaic-theme.css';

/**
 * Component configuration for mosaic windows
 */
export interface MosaicComponentConfig<TProps = Record<string, unknown>> {
  /** Unique identifier for this component type */
  id: string;
  /** Display title for the window */
  title: string;
  /** React component to render */
  component: React.ComponentType<TProps>;
  /** Optional props to pass to the component */
  props?: TProps;
  /** Optional icon for the window */
  icon?: React.ReactNode;
  /** Whether this window can be closed (default: true) */
  closable?: boolean;
}

/**
 * Props for the MosaicLayout component
 */
export interface MosaicLayoutProps {
  /** Component registry - maps window IDs to their configurations */
  components: Record<string, MosaicComponentConfig>;
  /** Initial layout configuration (optional - will auto-balance if not provided) */
  initialLayout?: MosaicNode<string> | null;
  /** Custom empty state when no windows are open */
  emptyState?: React.ReactNode;
  /** Mosaic ID for drag-drop context (default: 'mosaic-layout') */
  mosaicId?: string;
  /** Custom class name for the mosaic container */
  className?: string;
  /** Callback when layout changes */
  onChange?: (currentNode: MosaicNode<string> | null) => void;
}

/**
 * MosaicLayout - Generic mosaic window manager for React components
 *
 * @example
 * ```tsx
 * const components = {
 *   'chart-bar': {
 *     id: 'chart-bar',
 *     title: 'Bar Chart',
 *     component: BrushedBarChart,
 *   },
 *   'chart-line': {
 *     id: 'chart-line',
 *     title: 'Line Chart',
 *     component: BrushedLineChart,
 *   },
 * };
 *
 * <MosaicLayout components={components} />
 * ```
 */
export const MosaicLayout: React.FC<MosaicLayoutProps> = ({
  components,
  initialLayout,
  emptyState,
  mosaicId = 'mosaic-layout',
  className = '',
  onChange,
}) => {
  // Auto-create balanced layout from all components if no initial layout provided
  const autoLayout = useMemo(() => {
    if (initialLayout !== undefined) return initialLayout;

    const componentIds = Object.keys(components);
    if (componentIds.length === 0) return null;
    if (componentIds.length === 1) return componentIds[0];

    return createBalancedTreeFromLeaves(componentIds);
  }, [components, initialLayout]);

  const [currentNode, setCurrentNode] = useState<MosaicNode<string> | null>(autoLayout);

  const handleChange = useCallback(
    (newNode: MosaicNode<string> | null) => {
      setCurrentNode(newNode);
      onChange?.(newNode);
    },
    [onChange]
  );

  /**
   * Render function for each tile in the mosaic
   */
  const renderTile = useCallback(
    (id: string, path: MosaicBranch[]) => {
      const config = components[id];

      if (!config) {
        return (
          <MosaicWindow
            path={path}
            title={`Unknown: ${id}`}
            toolbarControls={[]}
          >
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Component &quot;{id}&quot; not found
            </div>
          </MosaicWindow>
        );
      }

      const Component = config.component;
      const closable = config.closable !== false;

      return (
        <MosaicWindow
          path={path}
          title={config.title}
          toolbarControls={closable ? undefined : []}
          createNode={() => id}
          draggable={true}
        >
          <div className="mosaic-window-content">
            <Component {...(config.props || {})} />
          </div>
        </MosaicWindow>
      );
    },
    [components]
  );

  /**
   * Default empty state when no windows are shown
   */
  const defaultEmptyState = (
    <div className="mosaic-empty-state">
      <div className="text-center">
        <LayoutGrid className="mx-auto h-16 w-16 text-muted-foreground opacity-50 mb-4" />
        <h3 className="text-xl font-semibold mb-2">No Windows Open</h3>
        <p className="text-sm text-muted-foreground">
          All windows have been closed. Refresh to restore default layout.
        </p>
      </div>
    </div>
  );

  return (
    <div className={`mosaic-layout-container ${className}`}>
      <Mosaic<string>
        renderTile={renderTile}
        value={currentNode}
        onChange={handleChange}
        className="mosaic-custom-theme"
        mosaicId={mosaicId}
        zeroStateView={emptyState !== undefined ? emptyState : defaultEmptyState}
      />
    </div>
  );
};

export default MosaicLayout;
