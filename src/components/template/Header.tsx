import React from "react";
import { Separator } from "../ui/separator";
import { SidebarTrigger } from "../ui/sidebar";
import { useBrushStore } from "@/stores/brushStore";
import { useProjectStore } from "@/stores/projectStore";
import { FilesIcon, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "../ui/dropdown-menu";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import { DatasetType } from "@/generated/projects";
import type {
  GetDatasetDataResponse,
  ColumnMapping,
  DataBoundaries,
} from "@/generated/projects";

const datasetTypeLabels: Record<DatasetType, string> = {
  [DatasetType.DATASET_TYPE_SAMPLE]: "Sample",
  [DatasetType.DATASET_TYPE_DRILL_HOLES]: "Drill Holes",
  [DatasetType.DATASET_TYPE_BLOCK]: "Block",
  [DatasetType.DATASET_TYPE_UNSPECIFIED]: "Unknown",
  [DatasetType.UNRECOGNIZED]: "Unknown",
};

// Header that is shown across all pages
// We keep the sidebar trigger here and dataset information
// We fetch dataset information from zustand store
function DatasetSelector() {
  const selectedDataset = useBrushStore((state) => state.selectedDataset);
  const selectedProject = useProjectStore((state) => state.selectedProject);
  const projectDatasetsMap = useProjectStore(
    (state) => state.projectDatasetsMap,
  );
  const getDatasetById = useProjectStore((state) => state.getDatasetById);
  const setSelectedDatasetInStore = useBrushStore(
    (state) => state.setSelectedDataset,
  );
  const setBrushSelection = useBrushStore((state) => state.setBrushSelection);

  const handleDatasetSelect = async (datasetId: string) => {
    if (!datasetId) return;

    try {
      // Find the dataset using the store helper
      const targetDataset = getDatasetById(datasetId);

      if (!targetDataset) {
        console.error("Dataset not found:", datasetId);
        return;
      }

      // Find coordinate columns from dataset mappings
      const coordColumns = targetDataset.column_mappings
        ?.filter((m: ColumnMapping) => m.is_coordinate)
        .reduce(
          (acc: { x: string; y: string; z: string }, m: ColumnMapping) => {
            if (m.mapped_field === "x") acc.x = m.column_name;
            if (m.mapped_field === "y") acc.y = m.column_name;
            if (m.mapped_field === "z") acc.z = m.column_name;
            return acc;
          },
          { x: "x", y: "y", z: "z" },
        );

      const initialColumns = {
        xAxis: coordColumns?.x || "x",
        yAxis: coordColumns?.y || "y",
        value: coordColumns?.z || "z",
      };

      // Fetch full dataset with initial columns
      const datasetResponse = (await window.autoGrpc.getDatasetData({
        dataset_id: targetDataset.id,
        columns: [
          initialColumns.xAxis,
          initialColumns.yAxis,
          initialColumns.value,
        ],
      })) as GetDatasetDataResponse;

      // Store in Zustand
      const datasetWithMappings = {
        ...targetDataset,
        column_mappings: targetDataset.column_mappings || [],
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSelectedDatasetInStore(
        datasetWithMappings as any,
        datasetResponse,
        initialColumns,
      );

      // Create initial brush selection
      if (datasetResponse.binary_data && datasetResponse.data_length > 0) {
        const fullData = new Float32Array(
          datasetResponse.binary_data.buffer,
          datasetResponse.binary_data.byteOffset,
          datasetResponse.data_length,
        );

        const xBoundary = datasetResponse.data_boundaries?.find(
          (b) => b.column_name === initialColumns.xAxis,
        );
        const yBoundary = datasetResponse.data_boundaries?.find(
          (b) => b.column_name === initialColumns.yAxis,
        );

        const boundariesMap: Record<string, DataBoundaries> = {};
        if (datasetResponse.data_boundaries) {
          datasetResponse.data_boundaries.forEach((boundary) => {
            boundariesMap[boundary.column_name] = boundary;
          });
        }

        const initialBrushSelection = {
          datasetId: targetDataset.id,
          coordRange: {
            x1: xBoundary?.min_value ?? 0,
            x2: xBoundary?.max_value ?? 100,
            y1: yBoundary?.min_value ?? 0,
            y2: yBoundary?.max_value ?? 100,
          },
          selectedIndices: Array.from(
            { length: datasetResponse.total_count },
            (_, i) => i,
          ),
          selectedPoints: fullData,
          columns: initialColumns,
          timestamp: Date.now(),
          statistics: {
            histograms: datasetResponse.histograms || {},
            boxPlots: datasetResponse.box_plots || [],
            heatmap: datasetResponse.heatmap,
            totalCount: datasetResponse.total_count,
            boundaries: boundariesMap,
          },
          datasetInfo: {
            id: targetDataset.id,
            name: targetDataset.file_name,
            totalRows: targetDataset.total_rows,
            fileId: targetDataset.file_id,
          },
        };

        setBrushSelection(targetDataset.id, initialBrushSelection);
      }
    } catch (err) {
      console.error("Error loading dataset:", err);
    }
  };

  // Get datasets only from the current selected project
  const currentProjectDatasets = selectedProject
    ? projectDatasetsMap.get(selectedProject.id) || []
    : [];

  return (
    <div className="flex min-w-0 flex-1 items-center space-x-2">
      <FilesIcon className="h-3 w-3 shrink-0" />
      {currentProjectDatasets.length > 0 ? (
        <div className="flex flex-row items-center space-x-2">
          <p className="text-muted-foreground truncate text-xs">
            {" "}
            Proyecto: {selectedProject?.name}
          </p>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" className="h-6 px-2 text-xs">
                <span className="max-w-[180px] truncate">
                  {selectedDataset
                    ? "Dataset: " + selectedDataset.file_name
                    : "Seleccionar dataset"}
                </span>
                <ChevronDown className="ml-1 h-3 w-3 shrink-0" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-[250px]">
              <DropdownMenuLabel>
                {selectedProject?.name || "Sin proyecto seleccionado"}
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              {currentProjectDatasets.map((dataset) => (
                <DropdownMenuItem
                  key={dataset.id}
                  onClick={() => handleDatasetSelect(dataset.id)}
                  className={
                    selectedDataset?.id === dataset.id ? "bg-accent" : ""
                  }
                >
                  <div className="flex w-full items-center gap-2">
                    <span className="flex-1 truncate">{dataset.file_name}</span>
                    <Badge
                      variant="outline"
                      className="shrink-0 px-1 py-0 text-xs"
                    >
                      {datasetTypeLabels[dataset.dataset_type as DatasetType]}
                    </Badge>
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ) : (
        <p className="text-muted-foreground truncate text-xs">
          {selectedDataset ? selectedDataset.file_name : "Sin dataset cargado"}
        </p>
      )}
    </div>
  );
}

function Header() {
  return (
    <header className="bg-background/95 supports-[backdrop-filter]:bg-background/60 z-40 flex h-6 items-center space-x-1 border-b backdrop-blur">
      <SidebarTrigger className="bg-background/80 ml-2 h-5 rounded-lg border shadow-md backdrop-blur-sm transition-all hover:shadow-lg" />
      <Separator orientation="vertical" className="bg-border h-5 w-px" />
      <DatasetSelector />
      <Separator orientation="vertical" className="bg-border h-5 w-px" />
    </header>
  );
}

export default Header;
