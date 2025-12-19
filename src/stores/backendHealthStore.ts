import { create } from 'zustand';

interface HealthStatus {
  healthy: boolean;
  version: string;
  status: Record<string, string>;
  timestamp?: number;
  error?: string;
}

interface BackendHealthState {
  healthStatus: HealthStatus | null;
  loading: boolean;
  checkBackendStatus: () => Promise<void>;
}

export const useBackendHealthStore = create<BackendHealthState>((set) => ({
  healthStatus: null,
  loading: true,

  checkBackendStatus: async () => {
    try {
      const healthData = await window.grpc.healthCheck({});
      set({
        healthStatus: {
          healthy: healthData.healthy,
          version: healthData.version,
          status: healthData.status,
          timestamp: Date.now()
        },
        loading: false
      });
    } catch (error) {
      set({
        healthStatus: {
          healthy: false,
          version: "1.0.0",
          status: { error: "gRPC connection failed" },
          timestamp: Date.now(),
          error: error instanceof Error ? error.message : "Connection failed"
        },
        loading: false
      });
    }
  }
}));

// Set up global polling with adaptive intervals
let pollingInterval: NodeJS.Timeout | null = null;

export function startBackendHealthPolling() {
  const { checkBackendStatus } = useBackendHealthStore.getState();

  // Initial check
  checkBackendStatus();

  // Adaptive polling function
  const poll = () => {
    const { healthStatus } = useBackendHealthStore.getState();
    const interval = healthStatus?.healthy ? 30000 : 1000;

    if (pollingInterval) {
      clearTimeout(pollingInterval);
    }

    pollingInterval = setTimeout(() => {
      checkBackendStatus().then(poll);
    }, interval);
  };

  poll();
}

export function stopBackendHealthPolling() {
  if (pollingInterval) {
    clearTimeout(pollingInterval);
    pollingInterval = null;
  }
}
