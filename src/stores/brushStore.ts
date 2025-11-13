import { create } from 'zustand';
import type { HistogramData, BoxPlotData, HeatmapData, DataBoundaries, DatasetInfo, GetDatasetDataResponse } from '@/generated/projects';

/**
 * Brush selection data structure
 * Stores all information about a brush selection on a chart
 */
export interface BrushSelection {
  datasetId: string;              // Which dataset this brush applies to
  coordRange: {                   // Rectangle bounds in data coordinates
    x1: number;
    x2: number;
    y1: number;
    y2: number;
  };
  selectedIndices: number[];      // Array of selected point indices in the original data
  selectedPoints: Float32Array;   // Actual selected point data [x,y,z,x,y,z...]
  columns: {                      // Which columns were used for axes and values
    xAxis: string;
    yAxis: string;
    value: string;
  };
  timestamp: number;              // When selection was made (for debugging/history)

  // Pre-computed statistics from backend (computed once, used by all charts)
  statistics?: {
    histograms?: Record<string, HistogramData>;      // Key: column_name, Value: histogram data
    boxPlots?: BoxPlotData[];                        // Box plot data for all columns
    heatmap?: HeatmapData;                           // Heatmap aggregation
    totalCount: number;                              // Total number of selected points
    boundaries?: Record<string, DataBoundaries>;     // Data boundaries for each column
  };

  // Dataset metadata
  datasetInfo?: {
    id: string;                   // Dataset ID
    name: string;                 // Dataset/file name
    totalRows: number;            // Total rows in full dataset
    fileId: string;               // Parent file ID
  };
}

/**
 * Global column selection for all charts
 */
export interface GlobalColumns {
  xAxis: string;
  yAxis: string;
  value: string;
}

/**
 * Brush store state and actions
 * Manages brush selections across all chart instances
 */
interface BrushStore {
  // Brush selection state
  selections: Map<string, BrushSelection>;  // Key: datasetId, Value: selection data
  activeDatasetId: string | null;           // Currently active dataset for brush operations

  // Dataset state
  selectedDataset: DatasetInfo | null;      // Currently selected dataset info
  datasetData: GetDatasetDataResponse | null;  // Full dataset data
  globalColumns: GlobalColumns | null;      // Global column selection (X, Y, Z)

  // Brush actions
  setBrushSelection: (datasetId: string, selection: BrushSelection) => void;
  clearBrushSelection: (datasetId: string) => void;
  clearAllSelections: () => void;
  getBrushSelection: (datasetId: string) => BrushSelection | undefined;
  setActiveDataset: (datasetId: string | null) => void;

  // Dataset actions
  setSelectedDataset: (datasetInfo: DatasetInfo, datasetData: GetDatasetDataResponse, globalColumns: GlobalColumns) => void;
  clearSelectedDataset: () => void;
  setGlobalColumns: (columns: GlobalColumns) => void;
  getGlobalColumns: () => GlobalColumns | null;

  // Helper to check if columns match
  columnsMatch: (datasetId: string, xAxis: string, yAxis: string, value: string) => boolean;
}

/**
 * Zustand store for managing brush selections
 * Provides centralized state for brush interactions across multiple chart instances
 */
export const useBrushStore = create<BrushStore>((set, get) => ({
  // Initial brush selection state
  selections: new Map<string, BrushSelection>(),
  activeDatasetId: null,

  // Initial dataset state
  selectedDataset: null,
  datasetData: null,
  globalColumns: null,

  // Set or update brush selection for a dataset
  setBrushSelection: (datasetId: string, selection: BrushSelection) => {
    set((state) => {
      const newSelections = new Map(state.selections);
      newSelections.set(datasetId, selection);
      return {
        selections: newSelections,
        activeDatasetId: datasetId
      };
    });
  },

  // Clear brush selection for a specific dataset
  clearBrushSelection: (datasetId: string) => {
    set((state) => {
      // Only update if the dataset actually exists in selections
      if (!state.selections.has(datasetId)) {
        return state; // No change, prevent unnecessary re-render
      }

      const newSelections = new Map(state.selections);
      newSelections.delete(datasetId);
      return {
        selections: newSelections,
        activeDatasetId: state.activeDatasetId === datasetId ? null : state.activeDatasetId
      };
    });
  },

  // Clear all brush selections
  clearAllSelections: () => {
    set({
      selections: new Map<string, BrushSelection>(),
      activeDatasetId: null
    });
  },

  // Get brush selection for a specific dataset
  getBrushSelection: (datasetId: string) => {
    return get().selections.get(datasetId);
  },

  // Set the active dataset
  setActiveDataset: (datasetId: string | null) => {
    set({ activeDatasetId: datasetId });
  },

  // Check if the stored selection's columns match the current chart configuration
  columnsMatch: (datasetId: string, xAxis: string, yAxis: string, value: string) => {
    const selection = get().selections.get(datasetId);
    if (!selection) return false;

    return (
      selection.columns.xAxis === xAxis &&
      selection.columns.yAxis === yAxis &&
      selection.columns.value === value
    );
  },

  // Set selected dataset with full data and initial global columns
  setSelectedDataset: (datasetInfo: DatasetInfo, datasetData: GetDatasetDataResponse, globalColumns: GlobalColumns) => {
    set({
      selectedDataset: datasetInfo,
      datasetData: datasetData,
      globalColumns: globalColumns,
      activeDatasetId: datasetInfo.id
    });
  },

  // Clear selected dataset and related data
  clearSelectedDataset: () => {
    set({
      selectedDataset: null,
      datasetData: null,
      globalColumns: null
    });
  },

  // Update global column selection
  setGlobalColumns: (columns: GlobalColumns) => {
    set({ globalColumns: columns });
  },

  // Get current global columns
  getGlobalColumns: () => {
    return get().globalColumns;
  }
}));