import React, { useState, useCallback, useMemo } from 'react';
import {
  Mosaic,
  MosaicWindow,
  MosaicNode,
  MosaicBranch,
  createBalancedTreeFromLeaves,
} from 'react-mosaic-component';
import { LayoutGrid } from 'lucide-react';
import { DEFAULT_TOOLBAR_CONTROLS } from './MosaicToolbarControls';
import 'react-mosaic-component/react-mosaic-component.css';
import './mosaic-theme.css';

/**
 * Component configuration for advanced mosaic windows
 */
export interface AdvancedMosaicComponentConfig<TProps = Record<string, unknown>> {
  id: string;
  title: string | ((props?: TProps) => React.ReactNode);
  component: React.ComponentType<TProps>;
  props?: TProps;
  icon?: React.ReactNode;
  closable?: boolean;
  /** Custom toolbar controls for this specific window */
  toolbarControls?: React.ReactNode[];
  /** Additional controls shown in a drawer */
  additionalControls?: React.ReactNode[];
  /** Custom render function for the window body */
  renderBody?: (Component: React.ComponentType<TProps>, props?: TProps) => React.ReactNode;
}

/**
 * Props for the AdvancedMosaicLayout component
 */
export interface AdvancedMosaicLayoutProps {
  components: Record<string, AdvancedMosaicComponentConfig>;
  initialLayout?: MosaicNode<string> | null;
  emptyState?: React.ReactNode;
  mosaicId?: string;
  className?: string;
  onChange?: (currentNode: MosaicNode<string> | null) => void;
  /** Enable layout persistence to localStorage */
  persistLayout?: boolean;
  /** Key for localStorage (if persistLayout is true) */
  persistKey?: string;
  /** Enable/disable drag and drop */
  enableDragAndDrop?: boolean;
  /** Default toolbar controls for all windows */
  defaultToolbarControls?: React.ReactNode[];
}

/**
 * AdvancedMosaicLayout - Extended version with additional features
 *
 * Features:
 * - Layout persistence to localStorage
 * - Custom toolbar controls per window
 * - Additional controls drawer
 * - Custom render functions
 * - Enable/disable drag and drop
 *
 * @example
 * ```tsx
 * const components = {
 *   'chart-1': {
 *     id: 'chart-1',
 *     title: 'My Chart',
 *     component: MyChart,
 *     toolbarControls: [<CustomButton key="custom" />],
 *     additionalControls: [<SettingsPanel key="settings" />],
 *   },
 * };
 *
 * <AdvancedMosaicLayout
 *   components={components}
 *   persistLayout={true}
 *   persistKey="my-dashboard-layout"
 * />
 * ```
 */
export const AdvancedMosaicLayout: React.FC<AdvancedMosaicLayoutProps> = ({
  components,
  initialLayout,
  emptyState,
  mosaicId = 'advanced-mosaic-layout',
  className = '',
  onChange,
  persistLayout = false,
  persistKey = 'mosaic-layout',
  enableDragAndDrop = true,
  defaultToolbarControls = DEFAULT_TOOLBAR_CONTROLS,
}) => {
  // Load persisted layout if enabled
  const loadPersistedLayout = useCallback(() => {
    if (!persistLayout) return null;

    try {
      const saved = localStorage.getItem(persistKey);
      if (saved) {
        return JSON.parse(saved) as MosaicNode<string>;
      }
    } catch (error) {
      console.error('Failed to load persisted layout:', error);
    }
    return null;
  }, [persistLayout, persistKey]);

  // Auto-create balanced layout
  const autoLayout = useMemo(() => {
    // Try persisted layout first
    const persisted = loadPersistedLayout();
    if (persisted) return persisted;

    // Use provided initial layout
    if (initialLayout !== undefined) return initialLayout;

    // Auto-balance from components
    const componentIds = Object.keys(components);
    if (componentIds.length === 0) return null;
    if (componentIds.length === 1) return componentIds[0];

    return createBalancedTreeFromLeaves(componentIds);
  }, [components, initialLayout, loadPersistedLayout]);

  const [currentNode, setCurrentNode] = useState<MosaicNode<string> | null>(autoLayout);

  // Persist layout changes
  const handleChange = useCallback(
    (newNode: MosaicNode<string> | null) => {
      setCurrentNode(newNode);

      // Persist to localStorage if enabled
      if (persistLayout && newNode) {
        try {
          localStorage.setItem(persistKey, JSON.stringify(newNode));
        } catch (error) {
          console.error('Failed to persist layout:', error);
        }
      }

      onChange?.(newNode);
    },
    [onChange, persistLayout, persistKey]
  );

  /**
   * Render function for each tile
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
            draggable={enableDragAndDrop}
          >
            <div className="flex items-center justify-center h-full text-muted-foreground">
              Component &quot;{id}&quot; not found
            </div>
          </MosaicWindow>
        );
      }

      const Component = config.component;
      const closable = config.closable !== false;

      // Determine toolbar controls
      const toolbarControls = config.toolbarControls !== undefined
        ? config.toolbarControls
        : closable
          ? defaultToolbarControls
          : [];

      // Resolve title (can be string or function, but MosaicWindow only accepts string)
      const title = typeof config.title === 'function'
        ? String(config.title(config.props))
        : config.title;

      // Render body (custom or default)
      const bodyContent = config.renderBody
        ? config.renderBody(Component, config.props)
        : <Component {...(config.props || {})} />;

      return (
        <MosaicWindow
          path={path}
          title={title}
          toolbarControls={toolbarControls}
          additionalControls={config.additionalControls}
          createNode={() => id}
          draggable={enableDragAndDrop}
        >
          <div className="mosaic-window-content">
            {bodyContent}
          </div>
        </MosaicWindow>
      );
    },
    [components, enableDragAndDrop, defaultToolbarControls]
  );

  /**
   * Default empty state
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

export default AdvancedMosaicLayout;
