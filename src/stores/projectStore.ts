import { create } from 'zustand';
import type { ColumnMapping } from '@/generated/projects';

/**
 * Project data structure matching ProjectManager interface
 */
export interface ProjectData {
  id: string;
  name: string;
  description: string;
  created_at: number;
  updated_at: number;
}

/**
 * Dataset data structure matching ProjectManager interface
 */
export interface DatasetData {
  id: string;
  file_id: string;
  file_name: string;
  dataset_type: number;
  original_filename: string;
  total_rows: number;
  created_at: number;
  column_mappings?: ColumnMapping[];
}

/**
 * Project store state - read-only for dataset selection
 * Projects and datasets are synced from ProjectManager
 */
interface ProjectStore {
  // All projects
  projects: ProjectData[];
  
  // Currently selected project
  selectedProject: ProjectData | null;
  
  // Datasets mapped by project_id
  projectDatasetsMap: Map<string, DatasetData[]>;
  
  // Actions - only for syncing data from ProjectManager
  syncProjects: (projects: ProjectData[]) => void;
  syncProjectDatasets: (projectId: string, datasets: DatasetData[]) => void;
  setSelectedProject: (project: ProjectData | null) => void;
  
  // Helper to find a dataset by ID across all projects
  getDatasetById: (datasetId: string) => DatasetData | null;
}

/**
 * Zustand store for managing projects and datasets (read-only for selection)
 */
export const useProjectStore = create<ProjectStore>((set, get) => ({
  // Initial state
  projects: [],
  selectedProject: null,
  projectDatasetsMap: new Map<string, DatasetData[]>(),

  // Sync projects from ProjectManager
  syncProjects: (projects: ProjectData[]) => {
    set({ projects });
  },

  // Sync datasets for a project from ProjectManager
  syncProjectDatasets: (projectId: string, datasets: DatasetData[]) => {
    set((state) => {
      const newMap = new Map(state.projectDatasetsMap);
      newMap.set(projectId, datasets);
      return { projectDatasetsMap: newMap };
    });
  },

  // Set selected project
  setSelectedProject: (project: ProjectData | null) => {
    set({ selectedProject: project });
  },

  // Find a dataset by ID across all projects
  getDatasetById: (datasetId: string) => {
    const { projectDatasetsMap } = get();
    for (const datasets of projectDatasetsMap.values()) {
      const dataset = datasets.find((d) => d.id === datasetId);
      if (dataset) return dataset;
    }
    return null;
  }
}));

