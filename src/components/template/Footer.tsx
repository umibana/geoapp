import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Progress } from "@/components/ui/progress";
import { useTranslation } from "react-i18next";
import langs from "@/localization/langs";
import { setAppLanguage } from "@/helpers/language_helpers";
import { Languages, Moon, X, Loader2 } from "lucide-react";
import { toggleTheme } from "@/helpers/theme_helpers";
import { 
  useOperationsStore, 
  getOperationTypeLabel,
  type ActiveOperation
} from "@/stores/operationsStore";
import { OperationStatus } from "@/generated/projects";


interface BackendStatusProps {
  className?: string;
}

interface HealthStatus {
  healthy: boolean;
  version: string;
  status: Record<string, string>;
  timestamp?: number;
  error?: string;
}

function BackendStatusContent(){
  const [backendUrl, setBackendUrl] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const checkBackendStatus = async () => {
    try {
      const url = await window.electronBackend.getBackendUrl();
      setBackendUrl(url);
      const healthData = await window.grpc.healthCheck({});

      setHealthStatus({
        ...healthData,
        timestamp: Date.now(),
      });

      console.log("gRPC health status:", healthData);
    } catch (error) {
      console.error("Failed to check gRPC status:", error);
      setBackendUrl(null);
      setHealthStatus({
        healthy: false,
        version: "1.0.0",
        status: { error: "gRPC connection failed" },
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : "Connection failed",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRestartBackend = async () => {
    try {
      setLoading(true);
      const result = await window.electronBackend.restartBackend();
      console.log("gRPC backend restarted:", result);
      // Wait a moment for the backend to start
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await checkBackendStatus();
    } catch (error) {
      console.error("Failed to restart gRPC backend:", error);
    } finally {
      setLoading(false);
    }
  };

  const testGrpcAPI = async () => {
    try {
      // Test gRPC HelloWorld call using auto-generated API
      const result = await window.grpc.helloWorld({
        message: "Test from frontend " + new Date().toISOString(),
      });

      console.log("gRPC API response:", result);
      alert(`gRPC API Test (HelloWorld):\nMessage: ${result.message}`);
    } catch (error) {
      console.error("Failed to test gRPC API:", error);
      alert("Failed to connect to gRPC API");
    }
  };

  useEffect(() => {
    checkBackendStatus();
    // Check status every 30 seconds
    let interval: NodeJS.Timeout;
    if (healthStatus?.healthy === true) {
    interval = setInterval(checkBackendStatus, 30000);
    } else {
      interval = setInterval(checkBackendStatus, 1000);
    }
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className={`rounded-lg border p-4`}>
        <div className="flex items-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
          <span className="ml-2">Checking gRPC backend status...</span>
        </div>
      </div>
    );
  }

  const isHealthy = healthStatus?.healthy === true;

  return (
    <div>
      <h3 className="mb-3 flex items-center font-semibold">
        <div
          className={`mr-2 h-3 w-3 rounded-full ${
            isHealthy ? "bg-green-500" : "bg-red-500"
          }`}
        />
        Estado del Backend: {isHealthy ? "Conectado" : "Desconectado"}
      </h3>

      <div className="space-y-3">
        {/* Basic Info */}
        {backendUrl && (
          <div className="text-sm">
            <strong>Servidor:</strong> {backendUrl}
          </div>
        )}

        {healthStatus && (
          <>
            {/* Error Info */}
            {healthStatus.error && (
              <div className="rounded bg-red-100 p-2 text-sm text-red-600">
                <strong>Error:</strong> {healthStatus.error}
              </div>
            )}

            {/* Timestamp */}
            {healthStatus.timestamp && (
              <div className="text-xs text-gray-500">
                Last checked:{" "}
                {new Date(healthStatus.timestamp).toLocaleTimeString()}
              </div>
            )}
          </>
        )}

        {/* Action Buttons */}
        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            size="sm"
            onClick={checkBackendStatus}
            variant="outline"
            disabled={loading}
          >
            Refrescar
          </Button>

          <Button
            size="sm"
            onClick={handleRestartBackend}
            variant="outline"
            disabled={loading}
          >
            Reiniciar
          </Button>

          {isHealthy && (
            <Button
              size="sm"
              onClick={testGrpcAPI}
              variant="outline"
              disabled={loading}
            >
              Probar Conexión
            </Button>
          )}
        </div>
      </div>
    </div>
  );


}

function BackendStatus({ className = "" }: BackendStatusProps) {
  const [healthStatus, setHealthStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const checkBackendStatus = async () => {
    try {

      const healthData = await window.grpc.healthCheck({});

      setHealthStatus({
        ...healthData,
        timestamp: Date.now(),
      });

      console.log("gRPC health status:", healthData);
    } catch (error) {
      console.error("Failed to check gRPC status:", error);
      setHealthStatus({
        healthy: false,
        version: "1.0.0",
        status: { error: "gRPC connection failed" },
        timestamp: Date.now(),
        error: error instanceof Error ? error.message : "Connection failed",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkBackendStatus();
    // Check status every 30 seconds
    const interval = setInterval(checkBackendStatus, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className={`rounded-lg border p-4 ${className}`}>
        <div className="flex items-center">
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-500 border-t-transparent"></div>
          <span className="ml-2">Revisando estado del backend...</span>
        </div>
      </div>
    );
  }

  const isHealthy = healthStatus?.healthy === true;

  return (
    <div className="flex flex-row items-center">
      <Popover>
        <PopoverTrigger className="flex cursor-pointer flex-row items-center">
          <div
            className={`mr-2 h-3 w-3 rounded-full ${
              isHealthy ? "bg-green-500" : "bg-red-500"
            }`}
          />
          <h3>Backend</h3>
        </PopoverTrigger>
        <PopoverContent>
          <BackendStatusContent />
    
        </PopoverContent>
      </Popover>
    </div>
  );

}

function LangToggle() {
  const { i18n } = useTranslation();
  const currentLang = i18n.language;

  function handleClick() {
    const currentIndex = langs.findIndex((lang) => lang.key === currentLang);
    const nextIndex = (currentIndex + 1) % langs.length;
    const nextLang = langs[nextIndex];
    setAppLanguage(nextLang.key, i18n);
  }

  return (
    <Button variant="ghost" onClick={handleClick} size="icon" className="h-6 w-6">
      <Languages size={16} />
    </Button>
  );
}

function ToggleTheme() {
  return (
    <Button variant="ghost" onClick={toggleTheme} size="icon" className="h-6 w-6 ">
      <Moon size={16} />
    </Button>
  );
}

/**
 * Single operation progress display
 */
function OperationProgressItem({ operation }: { operation: ActiveOperation }) {
  const cancelOperation = useOperationsStore((state) => state.cancelOperation);
  const isRunning = operation.status === OperationStatus.OPERATION_STATUS_RUNNING;

  const handleCancel = async () => {
    await cancelOperation(operation.operationId);
  };

  return (
    <div className="flex items-center gap-2 min-w-[200px] max-w-[350px]">
      {isRunning && (
        <Loader2 size={12} className="animate-spin text-primary shrink-0" />
      )}
      <div className="flex flex-col flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2">
          <span className="text-xs truncate">
            {getOperationTypeLabel(operation.operationType)}
          </span>
          <span className="text-xs font-medium shrink-0">{operation.progress}%</span>
        </div>
        <Progress 
          value={operation.progress} 
          className="h-1.5 w-full" 
        />
        {operation.message && (
          <span className="text-[0.6rem] text-muted-foreground truncate">
            {operation.message}
          </span>
        )}
      </div>
      {isRunning && (
        <Button
          variant="ghost"
          size="icon"
          className="h-4 w-4 shrink-0 hover:bg-destructive/20"
          onClick={handleCancel}
          aria-label="Cancel operation"
          tabIndex={0}
        >
          <X size={10} className="text-destructive" />
        </Button>
      )}
    </div>
  );
}

/**
 * Operations progress display in footer
 */
function OperationsProgress() {
  // Select the Map directly to avoid creating new array references on every render
  const operationsMap = useOperationsStore((state) => state.operations);
  
  // Convert to array for rendering (this is fine since we're not in the selector)
  const operations = Array.from(operationsMap.values());
  const hasOperations = operations.length > 0;

  if (!hasOperations) {
    return null;
  }

  // Show single operation inline, or popover for multiple
  if (operations.length === 1) {
    return <OperationProgressItem operation={operations[0]} />;
  }

  return (
    <Popover>
      <PopoverTrigger className="flex items-center gap-2 cursor-pointer">
        <Loader2 size={12} className="animate-spin text-primary" />
        <span className="text-xs">{operations.length} operations</span>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <h4 className="text-sm font-medium">Active Operations</h4>
          {operations.map((op) => (
            <OperationProgressItem key={op.operationId} operation={op} />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function Footer() {
  return (
    <footer className="text-muted-foreground flex flex-row justify-between border px-1 text-[0.7rem]">
      {/* Left side - Operations progress */}
      <div className="flex items-center">
        <OperationsProgress />
      </div>
      {/* Center - empty for now */}
      <div></div>
      {/* Right side - Controls and status */}
      <div className="flex flex-row items-center gap-2">
        <LangToggle />
        <ToggleTheme />
        <BackendStatus />
      </div>
    </footer>
  );
}
