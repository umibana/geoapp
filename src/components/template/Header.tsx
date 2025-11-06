import React from "react";
import { Separator } from "../ui/separator";
import { SidebarTrigger } from "../ui/sidebar";
import { useBrushStore } from "@/stores/brushStore";
import { FilesIcon } from "lucide-react";

// Header that is shown across all pages
// We keep the sidebar trigger here and dataset information
// We fetch dataset information from zustand store
function Header() {
    const selectedDataset = useBrushStore(state => state.selectedDataset);
    return (
        <header className="flex items-center h-6 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 z-40 space-x-1">
            <SidebarTrigger className="ml-2 h-5 bg-background/80 backdrop-blur-sm border rounded-lg shadow-md hover:shadow-lg transition-all" />
            <Separator orientation="vertical" className="h-5 w-px bg-border" />
            <FilesIcon className="h-3 w-3" />
            {selectedDataset ? (
                <div className="flex items-center space-x-2">
                    <p className="text-sm text-muted-foreground">{selectedDataset.file_name}</p>
                </div>
            ) : (
                <div className="flex items-center space-x-2">
                    <p className="text-sm text-muted-foreground">Sin dataset cargado</p>
                </div>
            )}
            
            <Separator orientation="vertical" className="h-5 w-px bg-border" />
        </header>
    )
}

export default Header;