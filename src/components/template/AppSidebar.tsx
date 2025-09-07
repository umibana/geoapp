import {  Home, TestTube, TestTube2, TestTubeDiagonal, Wifi, FolderOpen, Zap } from "lucide-react"

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import React from "react"
import { Link } from "@tanstack/react-router"
import { useWindows } from "@/contexts/WindowContext"
import { 
  Prueba2D,
  Prueba3D,
  GrpcDemo
} from "@/components/WindowComponents"

// Navigation items
const navigationItems = [
  {
    title: "Home",
    url: "/",
    icon: Home,
  },
  {
    title: "Projects",
    url: "/projects",
    icon: FolderOpen,
  },
]

// Window items that can be opened
const windowItems = [
  {
    title: "gRPC Demo",
    icon: Wifi,
    component: <GrpcDemo />,
    size: { width: 800, height: 600 },
  },
  {
    title: "Prueba 2D",
    icon: TestTube2,
    component: <Prueba2D />,
    size: { width: 500, height: 400 },
  },
  {
    title: "Prueba 3D",
    icon: TestTubeDiagonal,
    component: <Prueba3D />,
    size: { width: 400, height: 500 },
  },
]

export function AppSidebar() {
  const { openWindow } = useWindows();

  const handleOpenWindow = (item: typeof windowItems[0]) => {
    openWindow({
      title: item.title,
      component: item.component,
      initialSize: item.size,
      minSize: { width: 300, height: 200 },
      maxSize: { width: 800, height: 600 },
      useWindowMaxSize: true, // Enable dynamic window max size
    });
  };

  return (
    <Sidebar>
      <SidebarContent>
        {/* Navigation Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Navigation</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {navigationItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link to={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Windows Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Open Windows</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {windowItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    onClick={() => handleOpenWindow(item)}
                    className="cursor-pointer"
                  >
                    <item.icon />
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}