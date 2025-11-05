import React from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/template/AppSidebar";
import { WindowProvider, useWindows } from "@/contexts/WindowContext";
import { DragWindow } from "@/components/ui/drag-window";
import Footer from "@/components/template/Footer";
import { Separator } from "@/components/ui/separator";

function BaseLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const { windows, closeWindow, bringToFront } = useWindows();

  return (
    <>
      <AppSidebar />
      <div className="flex flex-1 flex-col h-screen overflow-hidden">
        {/* Thin header bar with sidebar trigger */}
        <header className="flex items-center h-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-40 space-x-1">
          <SidebarTrigger className="ml-2 h-5 bg-background/80 backdrop-blur-sm border rounded-lg shadow-md hover:shadow-lg transition-all" />
          <Separator orientation="vertical" className="h-5 w-px bg-border" />
        </header>
        
        <main className="flex flex-1 flex-col relative overflow-hidden">
          {children}
          
          {/* Render all open windows */}
          {windows.map((window) => (
            <DragWindow
              key={window.id}
              title={window.title}
              initialPosition={window.initialPosition}
              initialSize={window.initialSize}
              minSize={window.minSize}
              maxSize={window.maxSize}
              useWindowMaxSize={window.useWindowMaxSize}
              zIndex={window.zIndex}
              onClose={() => closeWindow(window.id)}
              onFocus={() => bringToFront(window.id)}
            >
              {window.component}
            </DragWindow>
          ))}
        </main>
        <Footer/>
      </div>
    </>
  );
}

function BaseLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SidebarProvider>
      <BaseLayoutInner>{children}</BaseLayoutInner>
    </SidebarProvider>
  );
}

export default function BaseLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WindowProvider>
      <BaseLayoutContent>{children}</BaseLayoutContent>
    </WindowProvider>
  );
}
