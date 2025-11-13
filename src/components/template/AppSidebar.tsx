import {  Home, FolderOpen, Paintbrush, Database, LayoutGrid } from "lucide-react"

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

interface WindowItem {
  title: string;
  icon: React.ComponentType;
  component: React.ReactNode;
  size: { width: number; height: number };
}

// Navigation items
const navigationItems = [
  {
    title: "Projects",
    url: "/",
    icon: FolderOpen,
  },
  {
    title: "2D EDA",
    url: "/eda-2d",
    icon: LayoutGrid,
  },
  {
    title: "3D EDA (WIP)",
    url: "/eda-3d",
    icon: Database,
  },
  {
    title: "Procesamiento",
    url: "/procesamiento",
    icon: Database,
  }
]

// Window items that can be opened
// const windowItems = [
//   {
//     title: "Brushed Data Viewer",
//     icon: Paintbrush,
//     component: <BrushedDataViewer />,
//     size: { width: 700, height: 600 },
//   },
// ]
const windowItems: WindowItem[] = []

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
          <SidebarGroupLabel>Módulos</SidebarGroupLabel>
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
        {windowItems && windowItems.length > 0 && (
        <     SidebarGroup>
          <SidebarGroupLabel>Ventanas abiertas</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {windowItems && windowItems.length > 0 && windowItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton 
                    onClick={() => handleOpenWindow(item)}
                    className="cursor-pointer"
                  >
                    {item.icon && <item.icon />}
                    <span>{item.title}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        )}
      </SidebarContent>
    </Sidebar>
  )
}