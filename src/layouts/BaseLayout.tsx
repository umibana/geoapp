import React from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/template/AppSidebar";
import { WindowProvider, useWindows } from "@/contexts/WindowContext";
import { DragWindow } from "@/components/ui/drag-window";
import Footer from "@/components/template/Footer";
import Header from "@/components/template/Header";

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
        <Header />
        
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
