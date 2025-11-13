
import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { useTranslation } from "react-i18next";
import langs from "@/localization/langs";
import { setAppLanguage } from "@/helpers/language_helpers";
import { Languages, Moon } from "lucide-react";
import { toggleTheme } from "@/helpers/theme_helpers";


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
      const healthData = await window.autoGrpc.healthCheck({});

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
      const result = await window.autoGrpc.helloWorld({
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

      const healthData = await window.autoGrpc.healthCheck({});

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




export default function Footer() {
  return (
    <footer className="text-muted-foreground flex flex-row justify-between border px-1 text-[0.7rem]">
      {/* Se dejan div vacios, se puede cambiar por componentes reales en el futuro */}
      <div></div>
      <div></div>
      <div className="flex flex-row items-center gap-2">
        <LangToggle />
        <ToggleTheme />
        <BackendStatus />
      </div>
    </footer>
  );
}
