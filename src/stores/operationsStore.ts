import { create } from 'zustand';
import type { OperationProgress } from '@/generated/projects';
import { OperationStatus } from '@/generated/projects';

/**
 * Simple operation progress interface for UI
 */
export interface ActiveOperation {
  operationId: string;
  operationType: string;
  progress: number;
  status: OperationStatus;
  message: string;
  startedAt: number;
  updatedAt: number;
  error?: string;
}

/**
 * Operations store state
 */
interface OperationsStore {
  // Active operations being tracked
  operations: Map<string, ActiveOperation>;
  
  // Whether polling is active
  isPolling: boolean;
  
  // Polling interval ID
  pollingIntervalId: NodeJS.Timeout | null;
  
  // Actions
  startPolling: () => void;
  stopPolling: () => void;
  syncOperations: (ops: OperationProgress[]) => void;
  cancelOperation: (operationId: string) => Promise<boolean>;
  
  // Computed
  getActiveOperations: () => ActiveOperation[];
  hasActiveOperations: () => boolean;
}

/**
 * Convert proto OperationProgress to ActiveOperation
 */
function toActiveOperation(op: OperationProgress): ActiveOperation {
  return {
    operationId: op.operationId,
    operationType: op.operationType,
    progress: op.progress,
    status: op.status,
    message: op.message,
    startedAt: Number(op.startedAt),
    updatedAt: Number(op.updatedAt),
    error: op.error || undefined,
  };
}

/**
 * Zustand store for tracking operation progress
 */
export const useOperationsStore = create<OperationsStore>((set, get) => ({
  operations: new Map(),
  isPolling: false,
  pollingIntervalId: null,

  startPolling: () => {
    const state = get();
    if (state.isPolling) {
      console.log('[OperationsStore] Already polling, skipping');
      return;
    }

    console.log('[OperationsStore] Starting polling...');

    const poll = async () => {
      try {
        const response = await window.grpc.getActiveOperations({});
        if (response.operations.length > 0) {
          console.log('[OperationsStore] Active operations:', response.operations);
        }
        get().syncOperations(response.operations);
      } catch (error) {
        console.error('[OperationsStore] Polling error:', error);
      }
    };

    // Poll immediately
    poll();

    // Then poll every 500ms
    const intervalId = setInterval(poll, 500);
    
    set({ isPolling: true, pollingIntervalId: intervalId });
  },

  stopPolling: () => {
    const { pollingIntervalId } = get();
    if (pollingIntervalId) {
      clearInterval(pollingIntervalId);
    }
    set({ isPolling: false, pollingIntervalId: null });
  },

  syncOperations: (ops: OperationProgress[]) => {
    const newMap = new Map<string, ActiveOperation>();
    
    for (const op of ops) {
      newMap.set(op.operationId, toActiveOperation(op));
    }
    
    set({ operations: newMap });
    
    // Auto-stop polling if no active operations
    if (newMap.size === 0 && get().isPolling) {
      get().stopPolling();
    }
  },

  cancelOperation: async (operationId: string) => {
    try {
      const response = await window.grpc.cancelOperation({ operationId });
      return response.success;
    } catch (error) {
      console.error('[OperationsStore] Cancel error:', error);
      return false;
    }
  },

  getActiveOperations: () => {
    return Array.from(get().operations.values());
  },

  hasActiveOperations: () => {
    return get().operations.size > 0;
  },
}));

/**
 * Hook to start tracking a new operation
 * Call this when starting a long-running operation
 */
export function startOperationTracking(): void {
  useOperationsStore.getState().startPolling();
}

/**
 * Human-readable operation type labels
 */
export function getOperationTypeLabel(type: string): string {
  const labels: Record<string, string> = {
    create_file: 'Importing file',
    process_dataset: 'Processing dataset',
  };
  return labels[type] || type;
}

/**
 * Human-readable status labels
 */
export function getStatusLabel(status: OperationStatus): string {
  switch (status) {
    case OperationStatus.OPERATION_STATUS_PENDING:
      return 'Pending';
    case OperationStatus.OPERATION_STATUS_RUNNING:
      return 'Running';
    case OperationStatus.OPERATION_STATUS_COMPLETED:
      return 'Completed';
    case OperationStatus.OPERATION_STATUS_CANCELLED:
      return 'Cancelled';
    case OperationStatus.OPERATION_STATUS_FAILED:
      return 'Failed';
    default:
      return 'Unknown';
  }
}

