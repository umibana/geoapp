import React, { createContext, useContext, useState, useCallback } from "react";

export interface WindowConfig {
  id: string;
  title: string;
  component: React.ReactNode;
  initialPosition: { x: number; y: number };
  initialSize: { width: number; height: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  useWindowMaxSize?: boolean;
  zIndex: number;
}

interface WindowContextType {
  windows: WindowConfig[];
  openWindow: (config: Omit<WindowConfig, 'id' | 'initialPosition' | 'zIndex'>) => void;
  closeWindow: (id: string) => void;
  clearAllWindows: () => void;
  bringToFront: (id: string) => void;
}

const WindowContext = createContext<WindowContextType | null>(null);

export function WindowProvider({ children }: { children: React.ReactNode }) {
  const [windows, setWindows] = useState<WindowConfig[]>([]);
  const [nextZIndex, setNextZIndex] = useState(1000);

  const openWindow = useCallback((config: Omit<WindowConfig, 'id' | 'initialPosition' | 'zIndex'>) => {
    const newWindow: WindowConfig = {
      ...config,
      id: `${config.title.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}`,
      initialPosition: { 
        x: 150 + (windows.length * 30), 
        y: 120 + (windows.length * 30) 
      },
      zIndex: nextZIndex,
    };

    setWindows(prev => [...prev, newWindow]);
    setNextZIndex(prev => prev + 1);
  }, [windows.length, nextZIndex]);

  const closeWindow = useCallback((id: string) => {
    setWindows(prev => prev.filter(window => window.id !== id));
  }, []);

  const bringToFront = useCallback((id: string) => {
    setWindows(prev => 
      prev.map(window => 
        window.id === id 
          ? { ...window, zIndex: nextZIndex }
          : window
      )
    );
    setNextZIndex(prev => prev + 1);
  }, [nextZIndex]);

  const clearAllWindows = useCallback(() => {
    setWindows([]);
    setNextZIndex(1000); // Reset z-index counter
  }, []);

  return (
    <WindowContext.Provider 
      value={{ 
        windows, 
        openWindow, 
        closeWindow, 
        clearAllWindows,
        bringToFront
      }}
    >
      {children}
    </WindowContext.Provider>
  );
}

export function useWindows() {
  const context = useContext(WindowContext);
  if (!context) {
    throw new Error('useWindows debe ser usado dentro de un WindowProvider');
  }
  return context;
} 