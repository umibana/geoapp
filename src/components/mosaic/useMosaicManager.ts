import { useState, useCallback, useMemo } from 'react';
import { MosaicNode, MosaicParent, createBalancedTreeFromLeaves } from 'react-mosaic-component';
import { v4 as uuidv4 } from 'uuid';
import { MosaicComponentConfig } from './MosaicLayout';

/**
 * Configuration for a chart type (without instance-specific data)
 */
export interface ChartTypeDefinition<TProps = Record<string, unknown>> {
  type: string;
  title: string;
  component: React.ComponentType<TProps>;
  icon?: React.ReactNode;
}

/**
 * Instance of a chart with unique ID
 */
export interface ChartInstance {
  id: string;
  type: string;
  instanceNumber: number;
  title: string;
}

/**
 * Hook return value with all mosaic management functions and state
 */
export interface UseMosaicManagerReturn {
  // State
  components: Record<string, MosaicComponentConfig>;
  currentLayout: MosaicNode<string> | null;
  visibleCharts: ChartInstance[];
  closedCharts: Record<string, ChartInstance[]>;
  lastOpenedChart: ChartInstance | null;

  // Actions
  addChart: (chartType: string) => void;
  reopenChart: (chartId: string) => void;
  resetLayout: () => void;
  updateLayout: (newLayout: MosaicNode<string> | null) => void;
}

/**
 * Helper to extract all visible window IDs from the mosaic tree
 */
const getVisibleWindowIds = (node: MosaicNode<string> | null): string[] => {
  if (!node) return [];
  if (typeof node === 'string') return [node];

  const parent = node as MosaicParent<string>;
  return [...getVisibleWindowIds(parent.first), ...getVisibleWindowIds(parent.second)];
};

/**
 * Helper to get the chart type from a window ID (format: "chartType-uuid")
 */
const getChartTypeFromId = (windowId: string, chartTypes: Record<string, ChartTypeDefinition>): string | null => {
  // Try to match the beginning of the windowId with known chart types
  for (const type of Object.keys(chartTypes)) {
    if (windowId.startsWith(`${type}-`)) {
      return type;
    }
  }
  return null;
};

/**
 * Custom hook for managing mosaic layout with multiple chart instances
 *
 * This hook abstracts away all the complexity of:
 * - UUID generation for unique chart instances
 * - State management for components and layout
 * - Tracking visible/closed charts
 * - Instance numbering
 *
 * @param chartTypeDefinitions - Record of chart type definitions
 * @param options - Configuration options
 * @returns Object with state and management functions
 *
 * @example
 * ```tsx
 * const CHART_TYPES = {
 *   'bar-chart': {
 *     type: 'bar-chart',
 *     title: 'Bar Chart',
 *     component: BarChart,
 *     icon: <BarChartIcon />
 *   }
 * };
 *
 * const { components, currentLayout, addChart, resetLayout, updateLayout } =
 *   useMosaicManager(CHART_TYPES);
 * ```
 */
export function useMosaicManager<T extends Record<string, ChartTypeDefinition>>(
  chartTypeDefinitions: T,
  options: {
    /** Initialize with one instance of each chart type (default: true) */
    initializeWithAll?: boolean;
  } = {}
): UseMosaicManagerReturn {
  const { initializeWithAll = true } = options;

  // Dynamic component registry - maps window IDs to their configurations
  const [components, setComponents] = useState<Record<string, MosaicComponentConfig>>(() => {
    if (!initializeWithAll) return {};

    const initialComponents: Record<string, MosaicComponentConfig> = {};
    Object.values(chartTypeDefinitions).forEach((config) => {
      const instanceId = `${config.type}-${uuidv4()}`;
      initialComponents[instanceId] = {
        id: instanceId,
        title: `${config.title} #1`,
        component: config.component,
      };
    });
    return initialComponents;
  });

  // Store the current mosaic layout - initialize with balanced layout
  const [currentLayout, setCurrentLayout] = useState<MosaicNode<string> | null>(() => {
    if (!initializeWithAll) return null;

    const componentIds = Object.keys(components);
    if (componentIds.length === 0) return null;
    if (componentIds.length === 1) return componentIds[0];
    return createBalancedTreeFromLeaves(componentIds);
  });

  // Track instance counters for each chart type
  const [instanceCounters, setInstanceCounters] = useState<Record<string, number>>(() => {
    const counters: Record<string, number> = {};
    Object.keys(chartTypeDefinitions).forEach((type) => {
      counters[type] = initializeWithAll ? 1 : 0;
    });
    return counters;
  });

  // Track last opened chart
  const [lastOpenedChart, setLastOpenedChart] = useState<ChartInstance | null>(null);

  // Get visible window IDs from current layout
  const visibleWindowIds = useMemo(() => {
    return new Set(getVisibleWindowIds(currentLayout));
  }, [currentLayout]);

  // Get visible charts with metadata
  const visibleCharts = useMemo<ChartInstance[]>(() => {
    const visible: ChartInstance[] = [];

    visibleWindowIds.forEach((windowId) => {
      const component = components[windowId];
      const chartType = getChartTypeFromId(windowId, chartTypeDefinitions);

      if (component && chartType) {
        // Extract instance number from title (e.g., "Bar Chart #2" -> 2)
        const match = component.title.match(/#(\d+)/);
        const instanceNumber = match ? parseInt(match[1], 10) : 1;

        visible.push({
          id: windowId,
          type: chartType,
          instanceNumber,
          title: component.title,
        });
      }
    });

    return visible;
  }, [visibleWindowIds, components, chartTypeDefinitions]);

  // Get closed charts grouped by chart type
  const closedCharts = useMemo<Record<string, ChartInstance[]>>(() => {
    const closed: Record<string, ChartInstance[]> = {};

    // Initialize with empty arrays for each chart type
    Object.keys(chartTypeDefinitions).forEach((type) => {
      closed[type] = [];
    });

    // Find all closed charts
    Object.keys(components).forEach((windowId) => {
      if (!visibleWindowIds.has(windowId)) {
        const chartType = getChartTypeFromId(windowId, chartTypeDefinitions);
        const component = components[windowId];

        if (chartType && chartType in closed && component) {
          // Extract instance number from title
          const match = component.title.match(/#(\d+)/);
          const instanceNumber = match ? parseInt(match[1], 10) : 1;

          closed[chartType].push({
            id: windowId,
            type: chartType,
            instanceNumber,
            title: component.title,
          });
        }
      }
    });

    return closed;
  }, [components, visibleWindowIds, chartTypeDefinitions]);

  /**
   * Add a new instance of a chart type
   */
  const addChart = useCallback((chartType: string) => {
    const config = chartTypeDefinitions[chartType];
    if (!config) {
      console.warn(`Chart type "${chartType}" not found in definitions`);
      return;
    }

    // Create new instance with UUID
    const newCounter = (instanceCounters[chartType] || 0) + 1;
    const instanceId = `${chartType}-${uuidv4()}`;

    const newInstance: ChartInstance = {
      id: instanceId,
      type: chartType,
      instanceNumber: newCounter,
      title: `${config.title} #${newCounter}`,
    };

    // Add to components registry
    setComponents((prev) => ({
      ...prev,
      [instanceId]: {
        id: instanceId,
        title: newInstance.title,
        component: config.component,
      },
    }));

    // Update counter
    setInstanceCounters((prev) => ({
      ...prev,
      [chartType]: newCounter,
    }));

    // Add to layout
    setCurrentLayout((prevLayout) => {
      if (!prevLayout) {
        return instanceId;
      }

      // Add to the right side of current layout
      return {
        direction: 'row',
        first: prevLayout,
        second: instanceId,
        splitPercentage: 70,
      };
    });

    // Track as last opened
    setLastOpenedChart(newInstance);
  }, [chartTypeDefinitions, instanceCounters]);

  /**
   * Re-open a previously closed window
   */
  const reopenChart = useCallback((windowId: string) => {
    const component = components[windowId];
    const chartType = getChartTypeFromId(windowId, chartTypeDefinitions);

    if (!component || !chartType) {
      console.warn(`Chart "${windowId}" not found in components registry`);
      return;
    }

    // Extract instance number from title
    const match = component.title.match(/#(\d+)/);
    const instanceNumber = match ? parseInt(match[1], 10) : 1;

    setCurrentLayout((prevLayout) => {
      if (!prevLayout) {
        return windowId;
      }

      // Add to the right side of current layout
      return {
        direction: 'row',
        first: prevLayout,
        second: windowId,
        splitPercentage: 70,
      };
    });

    // Track as last opened
    setLastOpenedChart({
      id: windowId,
      type: chartType,
      instanceNumber,
      title: component.title,
    });
  }, [components, chartTypeDefinitions]);

  /**
   * Reset to initial layout with one of each chart
   */
  const resetLayout = useCallback(() => {
    // Re-initialize with one instance of each
    const initialComponents: Record<string, MosaicComponentConfig> = {};
    Object.values(chartTypeDefinitions).forEach((config) => {
      const instanceId = `${config.type}-${uuidv4()}`;
      initialComponents[instanceId] = {
        id: instanceId,
        title: `${config.title} #1`,
        component: config.component,
      };
    });

    setComponents(initialComponents);

    // Reset counters to 1
    const resetCounters: Record<string, number> = {};
    Object.keys(chartTypeDefinitions).forEach((type) => {
      resetCounters[type] = 1;
    });
    setInstanceCounters(resetCounters);

    // Reset layout with balanced tree of new component IDs
    const componentIds = Object.keys(initialComponents);
    if (componentIds.length === 0) {
      setCurrentLayout(null);
    } else if (componentIds.length === 1) {
      setCurrentLayout(componentIds[0]);
    } else {
      setCurrentLayout(createBalancedTreeFromLeaves(componentIds));
    }

    // Clear last opened
    setLastOpenedChart(null);
  }, [chartTypeDefinitions]);

  /**
   * Update the layout (called by MosaicLayout onChange)
   */
  const updateLayout = useCallback((newLayout: MosaicNode<string> | null) => {
    setCurrentLayout(newLayout);
  }, []);

  return {
    // State
    components,
    currentLayout,
    visibleCharts,
    closedCharts,
    lastOpenedChart,

    // Actions
    addChart,
    reopenChart,
    resetLayout,
    updateLayout,
  };
}
