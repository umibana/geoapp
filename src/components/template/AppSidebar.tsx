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
import BrushedDataViewer from "@/components/chart-components/BrushedDataViewer"
import BrushedBarChart from "../chart-components/BrushedBarChart"
import BrushedBoxPlot from "../chart-components/BrushedBoxPlot"
import BrushedHeatmap from "../chart-components/BrushedHeatmap"
import BrushedLineChart from "../chart-components/BrushedLineChart"

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
  {
    title: "2D EDA",
    url: "/chart-mosaic-example",
    icon: LayoutGrid,
  },
  {
    title: "3D EDA (WIP)",
    url: "/dataset-info-viewer",
    icon: Database,
  },
  {
    title: "Procesamiento",
    url: "/dataset-info-viewer",
    icon: Database,
  }
]

// Window items that can be opened
const windowItems = [
  {
    title: "Brushed Data Viewer",
    icon: Paintbrush,
    component: <BrushedDataViewer />,
    size: { width: 700, height: 600 },
  },

  {
    title: "Brushed Bar Viewer",
    icon: Paintbrush,
    component: <BrushedBarChart />,
    size: { width: 700, height: 600 },
  },
  {
    title: "Brushed Boxplot",
    icon: Paintbrush,
    component: <BrushedBoxPlot />,
    size: { width: 700, height: 600 },
  },
  {
    title: "Brushed Heatmap",
    icon: Paintbrush,
    component: <BrushedHeatmap />,
    size: { width: 700, height: 600 },
  },
  {
    title: "Brushed Line (TODO)",
    icon: Paintbrush,
    component: <BrushedLineChart />,
    size: { width: 700, height: 600 },
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