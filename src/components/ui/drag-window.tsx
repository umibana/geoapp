import React, { useState, useEffect, useCallback, useMemo } from "react";
import { Rnd } from "react-rnd";
import { cn } from "@/utils/tailwind";
import { X, GripHorizontal } from "lucide-react";
import { Button } from "./button";
import { getWindowSize } from "@/helpers/window_helpers";

interface DragWindowProps {
  children: React.ReactNode;
  title?: string;
  initialPosition?: { x: number; y: number };
  initialSize?: { width: number; height: number };
  minSize?: { width: number; height: number };
  maxSize?: { width: number; height: number };
  resizable?: boolean;
  closable?: boolean;
  className?: string;
  zIndex?: number;
  onClose?: () => void;
  onFocus?: () => void;
  useWindowMaxSize?: boolean;
}

export function DragWindow({
  children,
  title = "Window",
  initialPosition = { x: 100, y: 100 },
  initialSize = { width: 400, height: 300 },
  minSize = { width: 200, height: 150 },
  maxSize = { width: 800, height: 600 },
  resizable = true,
  closable = true,
  className,
  zIndex = 1000,
  onClose,
  onFocus,
  useWindowMaxSize = false,
}: DragWindowProps) {
  const [dynamicMaxSize, setDynamicMaxSize] = useState(maxSize);

  // Memoize the effective max size calculation
  const effectiveMaxSize = useMemo(() => 
    useWindowMaxSize ? dynamicMaxSize : maxSize,
    [useWindowMaxSize, dynamicMaxSize, maxSize]
  );

  // Memoize the window configuration to prevent unnecessary Rnd re-renders
  const windowConfig = useMemo(() => ({
    default: {
      x: initialPosition.x,
      y: initialPosition.y,
      width: initialSize.width,
      height: initialSize.height,
    },
    minWidth: minSize.width,
    minHeight: minSize.height,
    maxWidth: effectiveMaxSize.width,
    maxHeight: effectiveMaxSize.height,
  }), [initialPosition, initialSize, minSize, effectiveMaxSize]);

  // Memoize event handlers to prevent re-renders
  const handleMouseDown = useCallback(() => {
    onFocus?.();
  }, [onFocus]);

  const handleClose = useCallback(() => {
    onClose?.();
  }, [onClose]);

  useEffect(() => {
    if (useWindowMaxSize) {
      const updateMaxSize = async () => {
        try {
          const windowSize = await getWindowSize();
          setDynamicMaxSize({
            width: windowSize.width - 20,
            height: windowSize.height - 20,
          });
        } catch (error) {
          console.error("Failed to get window size:", error);
          setDynamicMaxSize(maxSize);
        }
      };

      updateMaxSize();

      // Listen for Electron window resize events
      const handleResize = () => {
        // Use a small delay to avoid too many calls
        setTimeout(updateMaxSize, 100);
      };
      
      window.addEventListener('resize', handleResize);
      
      return () => window.removeEventListener('resize', handleResize);
    } else {
      setDynamicMaxSize(maxSize);
    }
  }, [useWindowMaxSize, maxSize]);

  return (
    <Rnd
      {...windowConfig}
      disableDragging={false}
      enableResizing={resizable}
      dragHandleClassName="drag-handle"
      bounds="parent"
      onMouseDown={handleMouseDown}
      className={cn(
        "bg-background border border-border rounded-lg shadow-lg overflow-hidden",
        "transition-shadow hover:shadow-xl",
        className
      )}
      style={{ zIndex }}
    >
      <div className="flex flex-col h-full">
        {/* Title Bar */}
        <div className="drag-handle flex items-center justify-between px-4 py-2 bg-muted/50 border-b border-border cursor-move">
          <div className="flex items-center gap-2">
            <GripHorizontal className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium text-foreground">{title}</span>
          </div>
          
          <div className="flex items-center gap-1">
            {closable && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 hover:bg-destructive hover:text-destructive-foreground"
                onClick={handleClose}
                tabIndex={0}
                aria-label="Close window"
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Window Content */}
        <div className="flex-1 overflow-auto p-4">
          {children}
        </div>
      </div>
    </Rnd>
  );
} 