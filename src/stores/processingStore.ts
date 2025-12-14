import { create } from 'zustand';

/**
 * IDW Result data structure
 */
export interface IDWResultData {
  success: boolean;
  outputVariable: string;
  blockModelName: string;
  drillHolesName: string;
  variable: string;
  blocksEstimated: number;
  samplesUsed: number;
  minValue: number;
  maxValue: number;
  meanValue: number;
  stdValue: number;
  power: number;
  numSamples: number;
  timestamp: number;
}

/**
 * Processing operation types
 */
export type ProcessingOperationType = 'idw' | 'grid' | 'merge';

/**
 * Processing result union type
 */
export type ProcessingResult = 
  | { type: 'idw'; data: IDWResultData }
  | { type: 'grid'; data: unknown }
  | { type: 'merge'; data: unknown };

/**
 * Processing store state
 */
interface ProcessingStore {
  // Latest processing result
  latestResult: ProcessingResult | null;
  
  // History of results (optional, for showing multiple)
  resultHistory: ProcessingResult[];
  
  // Actions
  setLatestResult: (result: ProcessingResult) => void;
  clearLatestResult: () => void;
  clearHistory: () => void;
}

/**
 * Zustand store for processing operations results
 */
export const useProcessingStore = create<ProcessingStore>((set) => ({
  latestResult: null,
  resultHistory: [],

  setLatestResult: (result: ProcessingResult) => {
    set((state) => ({
      latestResult: result,
      resultHistory: [result, ...state.resultHistory].slice(0, 10), // Keep last 10
    }));
  },

  clearLatestResult: () => {
    set({ latestResult: null });
  },

  clearHistory: () => {
    set({ resultHistory: [], latestResult: null });
  },
}));

