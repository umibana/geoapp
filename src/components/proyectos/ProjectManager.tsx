import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Trash2, Edit, Plus, Upload, Database, MoreVertical, RefreshCw, ChevronDown, ChevronRight } from 'lucide-react';
import DatasetInfoViewer from './DatasetInfoViewer';
import { useBrushStore } from '@/stores/brushStore';
import { useProjectStore } from '@/stores/projectStore';

// Importar tipos generados
import { DatasetType, GetDatasetDataResponse, ColumnMapping, DataBoundaries } from '@/generated/projects';

/**
 * Propiedades del gestor de proyectos
 * Define callbacks opcionales para selección de proyectos y navegación a carga de archivos
 */
interface ProjectManagerProps {
  onSelectProject?: (projectId: string) => void;          // Callback al seleccionar un proyecto
  onNavigateToUpload?: (projectId: string, projectName: string) => void;  // Callback para navegar a vista de carga
}

/**
 * Estructura de datos de un proyecto
 * Representa la información básica de un proyecto geoespacial
 */
interface ProjectData {
  id: string;           // ID único del proyecto
  name: string;         // Nombre del proyecto
  description: string;  // Descripción del proyecto
  created_at: number;   // Timestamp de creación
  updated_at: number;   // Timestamp de última actualización
}

/**
 * Estructura de datos de un archivo
 * Representa un archivo CSV cargado en un proyecto
 */
interface FileData {
  id: string;                    // ID único del archivo
  project_id: string;            // ID del proyecto al que pertenece
  name: string;                  // Nombre del archivo
  dataset_type: DatasetType;     // Tipo de dataset (SAMPLE, DRILL_HOLES, BLOCK)
  original_filename: string;     // Nombre original del archivo
  file_size: number;             // Tamaño del archivo en bytes
  created_at: number;            // Timestamp de creación
}

/**
 * Estructura de datos de un dataset procesado
 * Representa un dataset que ha sido procesado y está listo para visualización
 */
interface DatasetData {
  id: string;
  file_id: string;
  file_name: string;
  dataset_type: number;
  original_filename: string;
  total_rows: number;
  created_at: number;
  column_mappings?: ColumnMapping[];
}

const datasetTypeLabels: Record<DatasetType, string> = {
  [DatasetType.DATASET_TYPE_SAMPLE]: 'Sample',
  [DatasetType.DATASET_TYPE_DRILL_HOLES]: 'Drill Holes',
  [DatasetType.DATASET_TYPE_BLOCK]: 'Block',
  [DatasetType.DATASET_TYPE_UNSPECIFIED]: 'Unknown',
  [DatasetType.UNRECOGNIZED]: 'Unknown'
};

const datasetTypeBadgeColors: Record<DatasetType, string> = {
  [DatasetType.DATASET_TYPE_SAMPLE]: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  [DatasetType.DATASET_TYPE_DRILL_HOLES]: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  [DatasetType.DATASET_TYPE_BLOCK]: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  [DatasetType.DATASET_TYPE_UNSPECIFIED]: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  [DatasetType.UNRECOGNIZED]: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
};

/**
 * Componente principal para gestión de proyectos geoespaciales
 * Maneja la creación, edición y visualización de proyectos, archivos y datasets
 * Incluye funcionalidades de carga de CSV y visualización de datos
 */
const ProjectManager: React.FC<ProjectManagerProps> = ({ onNavigateToUpload }) => {
  // Estados principales del componente
  const [projects, setProjects] = useState<ProjectData[]>([]);               // Lista de proyectos
  const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);  // Proyecto seleccionado
  const [_projectFiles, setProjectFiles] = useState<FileData[]>([]);         // Archivos del proyecto
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set()); // Proyectos expandidos
  const [projectDatasetsMap, setProjectDatasetsMap] = useState<Map<string, DatasetData[]>>(new Map()); // Datasets por proyecto
  const [loading, setLoading] = useState(false);                            // Estado de carga
  const [loadingDataset, setLoadingDataset] = useState(false);              // Estado de carga de dataset
  const [error, setError] = useState<string | null>(null);                  // Mensajes de error
  const [isRetrying, setIsRetrying] = useState(false);                      // Estado de reintento de conexión
  const [retryCount, setRetryCount] = useState(0);                          // Contador de reintentos
  
  // Estado del dataset seleccionado (no hay cambio de vista, todo en la misma página)
  const [selectedDataset, setSelectedDataset] = useState<DatasetData | null>(null);  // Dataset para visualizar
  
  // Get Zustand store actions and state
  const setSelectedDatasetInStore = useBrushStore((state) => state.setSelectedDataset);
  const selectedDatasetFromBrushStore = useBrushStore((state) => state.selectedDataset);
  const syncProjects = useProjectStore((state) => state.syncProjects);
  const syncProjectDatasets = useProjectStore((state) => state.syncProjectDatasets);
  const setSelectedProjectInStore = useProjectStore((state) => state.setSelectedProject);
  const selectedProjectFromStore = useProjectStore((state) => state.selectedProject);
  const getProjectByDatasetId = useProjectStore((state) => state.getProjectByDatasetId);
  
  // State for project switch confirmation dialog
  const [isSwitchDialogOpen, setIsSwitchDialogOpen] = useState(false);
  const [pendingProject, setPendingProject] = useState<ProjectData | null>(null);
  const [pendingDataset, setPendingDataset] = useState<DatasetData | null>(null);

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);

  // Form states
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [editingProject, setEditingProject] = useState<ProjectData | null>(null);

  const MAX_RETRIES = 10;
  const BASE_DELAY_MS = 1000;

  useEffect(() => {
    loadProjectsWithRetry();
  }, []);

  // Restore selected project from store on mount and auto-expand it
  useEffect(() => {
    if (selectedProjectFromStore && projects.length > 0) {
      // Verify the project still exists in the loaded projects
      const projectExists = projects.find(p => p.id === selectedProjectFromStore.id);
      if (projectExists) {
        setSelectedProject(projectExists);
        // Auto-expand the selected project
        setExpandedProjects(prev => {
          const newSet = new Set(prev);
          newSet.add(projectExists.id);
          return newSet;
        });
      }
    }
  }, [projects, selectedProjectFromStore]);

  // Load datasets for all projects when projects change
  useEffect(() => {
    projects.forEach(project => {
      loadProjectDatasets(project.id);
    });
  }, [projects]);

  const loadProjectsWithRetry = async (attempt = 0): Promise<void> => {
    try {
      setLoading(true);
      setError(null);
      setIsRetrying(attempt > 0);
      setRetryCount(attempt);
      
      const response = await window.grpc.getProjects({ limit: 100, offset: 0 });
      const projectsList = response.projects || [];
      setProjects(projectsList);
      syncProjects(projectsList);
      
      // Reset state on success
      setIsRetrying(false);
      setRetryCount(0);
      setLoading(false);
    } catch (err) {
      console.error('Error loading projects:', err);
      
      if (attempt < MAX_RETRIES) {
        // Exponential backoff: 1s, 2s, 4s, 8s... capped at 10s
        const delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), 10000);
        console.log(`Backend not ready, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        
        setTimeout(() => {
          loadProjectsWithRetry(attempt + 1);
        }, delay);
      } else {
        setError('No se pudo conectar al backend. Por favor, asegúrese de que el servidor esté en ejecución.');
        setIsRetrying(false);
        setLoading(false);
      }
    }
  };

  const loadProjects = async () => {
    setRetryCount(0);
    setIsRetrying(false);
    await loadProjectsWithRetry(0);
  };

  const loadProjectFiles = async (projectId: string) => {
    try {
      const response = await window.grpc.getProjectFiles({ project_id: projectId });
      setProjectFiles(response.files || []);
    } catch (err) {
      console.error('Error loading project files:', err);
      setError('Failed to load project files');
    }
  };

  const loadProjectDatasets = async (projectId: string) => {
    try {
      const response = await window.grpc.getProjectDatasets({ project_id: projectId });
      const datasetsList = response.datasets || [];
      setProjectDatasetsMap(prev => {
        const newMap = new Map(prev);
        newMap.set(projectId, datasetsList);
        return newMap;
      });
      syncProjectDatasets(projectId, datasetsList); // Sync to project store
    } catch (err) {
      console.error('Error loading project datasets:', err);
      setError('Failed to load project datasets');
    }
  };

  const toggleProjectExpansion = (projectId: string) => {
    setExpandedProjects(prev => {
      const newSet = new Set(prev);
      if (newSet.has(projectId)) {
        newSet.delete(projectId);
      } else {
        newSet.add(projectId);
      }
      return newSet;
    });
  };

  /**
   * Handle project selection with confirmation if switching from another project with active dataset
   */
  const handleProjectClick = (project: ProjectData) => {
    // If no dataset is selected, or clicking on already selected project, allow without confirmation
    if (!selectedDatasetFromBrushStore || selectedProject?.id === project.id) {
      selectProject(project);
      return;
    }
    
    // Check if the currently selected dataset belongs to a different project
    const currentDatasetProject = getProjectByDatasetId(selectedDatasetFromBrushStore.id);
    if (currentDatasetProject && currentDatasetProject.id !== project.id) {
      // Show confirmation dialog
      setPendingProject(project);
      setIsSwitchDialogOpen(true);
      return;
    }
    
    selectProject(project);
  };

  /**
   * Actually select a project (after confirmation if needed)
   */
  const selectProject = (project: ProjectData) => {
    setSelectedProject(project);
    setSelectedProjectInStore(project);
    toggleProjectExpansion(project.id);
  };

  /**
   * Confirm project switch - clears current dataset and switches to new project
   * If a pending dataset exists, also loads that dataset
   */
  const confirmProjectSwitch = () => {
    if (pendingProject) {
      // Clear current dataset selection
      setSelectedDataset(null);
      useBrushStore.getState().clearSelectedDataset();
      useBrushStore.getState().clearAllSelections();
      
      if (pendingDataset) {
        // User clicked on a dataset in another project - load that dataset
        loadDataset(pendingDataset, pendingProject);
      } else {
        // User clicked on a project header - just select the project
        selectProject(pendingProject);
      }
    }
    setIsSwitchDialogOpen(false);
    setPendingProject(null);
    setPendingDataset(null);
  };

  /**
   * Cancel project switch
   */
  const cancelProjectSwitch = () => {
    setIsSwitchDialogOpen(false);
    setPendingProject(null);
    setPendingDataset(null);
  };

  /**
   * Handle dataset click - checks if switching projects and asks for confirmation
   */
  const handleDatasetClick = (dataset: DatasetData, parentProject: ProjectData) => {
    // Check if there's a selected dataset from a different project
    if (selectedDatasetFromBrushStore && selectedProject) {
      const currentDatasetProject = getProjectByDatasetId(selectedDatasetFromBrushStore.id);
      if (currentDatasetProject && currentDatasetProject.id !== parentProject.id) {
        // Show confirmation dialog for project switch via dataset selection
        setPendingProject(parentProject);
        setPendingDataset(dataset);
        setIsSwitchDialogOpen(true);
        return;
      }
    }
    
    // No confirmation needed, load the dataset directly
    loadDataset(dataset, parentProject);
  };

  /**
   * Actually load a dataset (after confirmation if needed)
   */
  const loadDataset = async (dataset: DatasetData, parentProject: ProjectData) => {
    try {
      setLoadingDataset(true);
      setError(null);
      
      // Select the parent project when selecting a dataset
      setSelectedProject(parentProject);
      setSelectedProjectInStore(parentProject);
      
      // Find coordinate columns from dataset mappings
      const coordColumns = dataset.column_mappings
        ?.filter((m: ColumnMapping) => m.is_coordinate)
        .reduce((acc: { x: string; y: string; z: string }, m: ColumnMapping) => {
          if (m.mapped_field === 'x') acc.x = m.column_name;
          if (m.mapped_field === 'y') acc.y = m.column_name;
          if (m.mapped_field === 'z') acc.z = m.column_name;
          return acc;
        }, { x: 'x', y: 'y', z: 'z' });

      const initialColumns = {
        xAxis: coordColumns?.x || 'x',
        yAxis: coordColumns?.y || 'y',
        value: coordColumns?.z || 'z'
      };

      // Fetch full dataset with initial columns (x, y, z)
      // The backend will compute statistics for the full dataset
      const datasetResponse = await window.grpc.getDatasetData({
        dataset_id: dataset.id,
        columns: [initialColumns.xAxis, initialColumns.yAxis, initialColumns.value]
      }) as GetDatasetDataResponse;

      // Store in Zustand (ensure column_mappings is provided, even if empty)
      const datasetWithMappings = {
        ...dataset,
        column_mappings: dataset.column_mappings || []
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      setSelectedDatasetInStore(datasetWithMappings as any, datasetResponse, initialColumns);
      
      // Create an initial "full dataset" brush selection so all charts have data immediately
      if (datasetResponse.binary_data && datasetResponse.data_length > 0) {
        const fullData = new Float32Array(
          datasetResponse.binary_data.buffer,
          datasetResponse.binary_data.byteOffset,
          datasetResponse.data_length
        );

        // Get data boundaries for bounding box
        const xBoundary = datasetResponse.data_boundaries?.find(b => b.column_name === initialColumns.xAxis);
        const yBoundary = datasetResponse.data_boundaries?.find(b => b.column_name === initialColumns.yAxis);

        // Convert data_boundaries array to Record
        const boundariesMap: Record<string, DataBoundaries> = {};
        if (datasetResponse.data_boundaries) {
          datasetResponse.data_boundaries.forEach(boundary => {
            boundariesMap[boundary.column_name] = boundary;
          });
        }

        // Create initial brush selection representing the full dataset
        const initialBrushSelection = {
          datasetId: dataset.id,
          coordRange: {
            x1: xBoundary?.min_value ?? 0,
            x2: xBoundary?.max_value ?? 100,
            y1: yBoundary?.min_value ?? 0,
            y2: yBoundary?.max_value ?? 100
          },
          selectedIndices: Array.from({ length: datasetResponse.total_count }, (_, i) => i),
          selectedPoints: fullData,
          columns: initialColumns,
          timestamp: Date.now(),
          statistics: {
            histograms: datasetResponse.histograms || {},
            boxPlots: datasetResponse.box_plots || [],
            heatmap: datasetResponse.heatmap,
            totalCount: datasetResponse.total_count,
            boundaries: boundariesMap
          },
          datasetInfo: {
            id: dataset.id,
            name: dataset.file_name,
            totalRows: dataset.total_rows,
            fileId: dataset.file_id
          }
        };

        // Store initial brush selection
        const { setBrushSelection } = useBrushStore.getState();
        setBrushSelection(dataset.id, initialBrushSelection);
        
        console.log('✅ Initial brush selection created with full dataset');
      }
      
      // Update local state (stay on same page, no navigation)
      setSelectedDataset(dataset);
      
      console.log('✅ Dataset loaded and stored in Zustand');
    } catch (err) {
      console.error('❌ Error loading dataset:', err);
      setError('Error al cargar el dataset');
    } finally {
      setLoadingDataset(false);
    }
  };

  const createProject = async () => {
    if (!projectName.trim()) return;

    try {
      setLoading(true);
      const response = await window.grpc.createProject({
        name: projectName,
        description: projectDescription
      });

      if (response.success) {
        setIsCreateDialogOpen(false);
        setProjectName('');
        setProjectDescription('');
        await loadProjects();
      } else {
        setError(response.error_message || 'Failed to create project');
      }
    } catch (err) {
      console.error('Error creating project:', err);
      setError('Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  const updateProject = async () => {
    if (!editingProject || !projectName.trim()) return;

    try {
      setLoading(true);
      const response = await window.grpc.updateProject({
        project_id: editingProject.id,
        name: projectName,
        description: projectDescription
      });

      if (response.success) {
        setIsEditDialogOpen(false);
        setEditingProject(null);
        setProjectName('');
        setProjectDescription('');
        await loadProjects();
      } else {
        setError(response.error_message || 'Failed to update project');
      }
    } catch (err) {
      console.error('Error updating project:', err);
      setError('Failed to update project');
    } finally {
      setLoading(false);
    }
  };

  const deleteProject = async (projectId: string) => {
    if (!confirm('Esta seguro que desea eliminar este proyecto? Esto también eliminará todos los archivos y datasets asociados.')) {
      return;
    }

    try {
      setLoading(true);
      const response = await window.grpc.deleteProject({ project_id: projectId });

      if (response.success) {
        if (selectedProject?.id === projectId) {
          setSelectedProject(null);
          setSelectedProjectInStore(null); // Sync to project store
          setProjectFiles([]);
        }
        await loadProjects();
      } else {
        setError(response.error_message || 'Error al eliminar el proyecto');
      }
    } catch (err) {
      console.error('Error deleting project:', err);
      setError('Error al eliminar el proyecto');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateDatasetStats = async (fileId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent dataset click

    try {
      setLoading(true);
      console.log('🔄 Updating statistics for file:', fileId);

      // Call the backend to recalculate statistics
      const response = await window.grpc.getFileStatistics({
        file_id: fileId,
        columns: []
      });

      if (response.success) {
        // Reload datasets to show updated stats
        if (selectedProject) {
          await loadProjectDatasets(selectedProject.id);
        }
        console.log('✅ Statistics updated successfully');
      } else {
        setError('Failed to update statistics');
      }
    } catch (err) {
      console.error('Error updating statistics:', err);
      setError('Failed to update statistics');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteDataset = async (datasetId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent dataset click

    if (!confirm('¿Estás seguro de querer eliminar este dataset? Esta acción no puede ser deshecha.')) {
      return;
    }

    try {
      setLoading(true);
      const response = await window.grpc.deleteDataset({ dataset_id: datasetId });

      if (response.success) {
        // Clear selected dataset if it was deleted
        if (selectedDataset?.id === datasetId) {
          setSelectedDataset(null);
        }
        
        // Reload datasets after deletion for all projects or just the selected one
        if (selectedProject) {
          await loadProjectDatasets(selectedProject.id);
        } else {
          // Reload all project datasets
          projects.forEach(project => {
            loadProjectDatasets(project.id);
          });
        }
        console.log('✅ Dataset deleted successfully');
      } else {
        setError(response.error_message || 'Failed to delete dataset');
      }
    } catch (err) {
      console.error('Error deleting dataset:', err);
      setError('Failed to delete dataset');
    } finally {
      setLoading(false);
    }
  };

  const openEditDialog = (project: ProjectData) => {
    setEditingProject(project);
    setProjectName(project.name);
    setProjectDescription(project.description);
    setIsEditDialogOpen(true);
  };

  return (
    <div className="w-full h-full flex flex-col">
      {error && (
        <div className="bg-red-50 border-b border-red-200 p-3 flex-shrink-0">
          <div className="flex items-center justify-between">
            <p className="text-sm text-red-800">{error}</p>
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setError(null)}
              className="h-6"
            >
              <span className="text-xs">Descartar</span>
            </Button>
          </div>
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-0 overflow-hidden">
        {/* Projects & Datasets List (Accordion Style) */}
        <Card className="h-full flex flex-col rounded-none border-0 border-r bg-muted/20">
          <CardHeader className="flex-shrink-0 pb-3 px-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Proyectos y Datasets</CardTitle>
                <CardDescription className="text-sm mt-1">
                  {projects.length} proyecto(s)
                </CardDescription>
              </div>
              <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="outline">
                    <Plus className="mr-2 h-4 w-4" />
                    <span className="text-sm">Nuevo</span>
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Crear Nuevo Proyecto</DialogTitle>
                    <DialogDescription>
                      Crea un nuevo proyecto para organizar tus datasets geoespaciales.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="name">Nombre del Proyecto</Label>
                      <Input
                        id="name"
                        value={projectName}
                        onChange={(e) => setProjectName(e.target.value)}
                        placeholder="Ingresa el nombre del proyecto"
                      />
                    </div>
                    <div>
                      <Label htmlFor="description">Descripción</Label>
                      <Textarea
                        id="description"
                        value={projectDescription}
                        onChange={(e) => setProjectDescription(e.target.value)}
                        placeholder="Ingresa una descripción para el proyecto (opcional)"
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button
                      onClick={createProject}
                      disabled={loading || !projectName.trim()}
                    >
                      Crear Proyecto
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0">
            <div className="px-4 pb-4">
            {(loading || isRetrying) && projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                <p className="text-muted-foreground">
                  {isRetrying 
                    ? `Conectando al backend... (intento ${retryCount}/${MAX_RETRIES})`
                    : 'Cargando proyectos...'}
                </p>
                {isRetrying && (
                  <p className="text-xs text-muted-foreground">
                    El servidor está iniciando, por favor espere...
                  </p>
                )}
              </div>
            ) : error && projects.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 space-y-3">
                <p className="text-destructive">{error}</p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={loadProjects}
                  className="gap-2"
                >
                  <RefreshCw className="h-4 w-4" />
                  Reintentar
                </Button>
              </div>
            ) : projects.length === 0 ? (
              <p className="text-muted-foreground">No se encontraron proyectos. Crea tu primer proyecto para comenzar</p>
            ) : (
              <div className="space-y-1">
                {projects.map((project) => {
                  const isExpanded = expandedProjects.has(project.id);
                  const projectDatasets = projectDatasetsMap.get(project.id) || [];
                  
                  return (
                    <div key={project.id} className="border rounded">
                      {/* Project Header */}
                      <div
                        className={`p-2 cursor-pointer transition-colors ${
                          selectedProject?.id === project.id
                            ? 'bg-accent dark:bg-accent/50 border-b'
                            : 'hover:bg-muted/50'
                        }`}
                        onClick={() => handleProjectClick(project)}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2 flex-1 min-w-0">
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 shrink-0" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0" />
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <h4 className="text-base font-semibold truncate">{project.name}</h4>
                                <Badge variant="secondary" className="text-xs px-1.5 py-0.5">
                                  {projectDatasets.length}
                                </Badge>
                              </div>
                              {project.description && (
                                <p className="text-sm text-muted-foreground mt-1 truncate">
                                  {project.description}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center space-x-0.5 shrink-0">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onNavigateToUpload) {
                                  onNavigateToUpload(project.id, project.name);
                                }
                              }}
                              title="Cargar archivo"
                            >
                              <Upload className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(project);
                              }}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteProject(project.id);
                              }}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </div>

                      {/* Datasets List (Collapsible) */}
                      {isExpanded && (
                        <div className="bg-muted/30">
                          {projectDatasets.length === 0 ? (
                            <div className="text-center py-4 px-3">
                              <Database className="mx-auto h-6 w-6 text-muted-foreground mb-1" />
                              <p className="text-xs text-muted-foreground">No hay datasets</p>
                            </div>
                          ) : (
                            <div className="p-1 space-y-0.5">
                              {projectDatasets.map((dataset) => (
                                <div
                                  key={dataset.id}
                                  className={`p-2.5 rounded cursor-pointer transition-colors ${
                                    selectedDataset?.id === dataset.id
                                      ? 'bg-accent dark:bg-accent/50 border border-primary/20 dark:border-primary/30'
                                      : 'bg-card hover:bg-accent/50 dark:hover:bg-accent/30 border border-transparent'
                                  }`}
                                  onClick={() => handleDatasetClick(dataset, project)}
                                >
                                  <div className="flex items-center justify-between">
                                    <div className="flex-1 min-w-0">
                                      <div className="flex items-center gap-2">
                                        <Database className="h-4 w-4 shrink-0 text-muted-foreground" />
                                        <span className="font-medium text-sm truncate">{dataset.file_name}</span>
                                        <Badge className={`text-xs px-1.5 py-0.5 ${datasetTypeBadgeColors[dataset.dataset_type as DatasetType]}`}>
                                          {datasetTypeLabels[dataset.dataset_type as DatasetType]}
                                        </Badge>
                                      </div>
                                      <p className="text-xs text-muted-foreground mt-1 ml-6">
                                        {dataset.total_rows.toLocaleString()} filas
                                      </p>
                                    </div>
                                    <div className="flex items-center space-x-1 shrink-0">
                                      <DropdownMenu>
                                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                            <MoreVertical className="h-3 w-3" />
                                          </Button>
                                        </DropdownMenuTrigger>
                                        <DropdownMenuContent align="end" className="w-48">
                                          <DropdownMenuLabel>Opciones</DropdownMenuLabel>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem onClick={(e: React.MouseEvent) => handleUpdateDatasetStats(dataset.file_id, e)}>
                                            <RefreshCw className="mr-2 h-4 w-4" />
                                            Actualizar Stats
                                          </DropdownMenuItem>
                                          <DropdownMenuSeparator />
                                          <DropdownMenuItem
                                            onClick={(e: React.MouseEvent) => handleDeleteDataset(dataset.id, e)}
                                            className="text-destructive focus:text-destructive"
                                          >
                                            <Trash2 className="mr-2 h-4 w-4" />
                                            Eliminar
                                          </DropdownMenuItem>
                                        </DropdownMenuContent>
                                      </DropdownMenu>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add File Button */}
                          <div className="p-2">
                            <Button
                              variant="outline"
                              className="w-full h-10 gap-2 border-dashed hover:bg-accent/50"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (onNavigateToUpload) {
                                  onNavigateToUpload(project.id, project.name);
                                }
                              }}
                            >
                              <Plus className="h-4 w-4" />
                              <span className="text-sm font-medium">Cargar archivo</span>
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>

                  );
                  
                })}

              </div>
            )}
            </div>
          </CardContent>
        </Card>

        {/* Dataset Info Viewer */}
        <Card className="h-full flex flex-col overflow-hidden rounded-none border-0">
          {loadingDataset ? (
            <CardContent className="flex flex-col items-center justify-center h-full">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
                <p className="text-sm font-medium">Cargando dataset...</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Esto puede tomar unos momentos para datasets grandes
                </p>
              </div>
            </CardContent>
          ) : selectedDataset ? (
            <div className="h-full overflow-auto">
              <DatasetInfoViewer />
            </div>
          ) : (
            <CardContent className="flex items-center justify-center h-full">
              <div className="text-center">
                <Database className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-base font-medium">No hay dataset seleccionado</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Selecciona un dataset para ver su información
                </p>
              </div>
            </CardContent>
          )}
        </Card>
      </div>

      {/* Edit Project Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar Proyecto</DialogTitle>
            <DialogDescription>
              Actualiza la información del proyecto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Nombre del Proyecto</Label>
              <Input
                id="edit-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Ingresa el nombre del proyecto"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Descripción</Label>
              <Textarea
                id="edit-description"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Ingresa una descripción para el proyecto (opcional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={updateProject}
              disabled={loading || !projectName.trim()}
            >
              Actualizar Proyecto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Project Switch Confirmation Dialog */}
      <Dialog open={isSwitchDialogOpen} onOpenChange={setIsSwitchDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Cambiar de proyecto</DialogTitle>
            <DialogDescription>
              Tienes un dataset seleccionado en el proyecto actual. ¿Deseas cambiar al proyecto &quot;{pendingProject?.name}&quot;? 
              Esto deseleccionará el dataset actual.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              variant="outline"
              onClick={cancelProjectSwitch}
            >
              Cancelar
            </Button>
            <Button
              onClick={confirmProjectSwitch}
            >
              Cambiar proyecto
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectManager;