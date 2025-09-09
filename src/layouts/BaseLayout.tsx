import React from "react";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/template/AppSidebar";
import { WindowProvider, useWindows } from "@/contexts/WindowContext";
import { DragWindow } from "@/components/ui/drag-window";
import Footer from "@/components/template/Footer";

function BaseLayoutContent({
  children,
}: {
  children: React.ReactNode;
}) {
  const { windows, closeWindow, bringToFront } = useWindows();

  return (
    <SidebarProvider>
      <AppSidebar />
      <div className="flex flex-1 flex-col min-h-screen">
        <main className="flex flex-1 flex-col relative overflow-y-auto">
          <SidebarTrigger />
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
