import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Trash2, Edit, Plus, FolderOpen, Upload, BarChart3, Database, Eye } from 'lucide-react';
import DatasetViewer from './DatasetViewer';

// Importar tipos generados
import { DatasetType } from '@/generated/projects';

/**
 * Propiedades del gestor de proyectos
 * Define callbacks opcionales para selección de proyectos y carga de archivos
 */
interface ProjectManagerProps {
  onSelectProject?: (projectId: string) => void;          // Callback al seleccionar un proyecto
  onFileUploadComplete?: (fileId: string, fileName: string) => void;  // Callback al completar carga de archivo
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
}

const datasetTypeLabels = {
  [DatasetType.SAMPLE]: 'Sample',
  [DatasetType.DRILL_HOLES]: 'Drill Holes',
  [DatasetType.BLOCK]: 'Block',
  [DatasetType.UNSPECIFIED]: 'Unknown'
};

const datasetTypeBadgeColors = {
  [DatasetType.SAMPLE]: 'bg-blue-100 text-blue-800',
  [DatasetType.DRILL_HOLES]: 'bg-green-100 text-green-800',
  [DatasetType.BLOCK]: 'bg-purple-100 text-purple-800',
  [DatasetType.UNSPECIFIED]: 'bg-gray-100 text-gray-800'
};

/**
 * Componente principal para gestión de proyectos geoespaciales
 * Maneja la creación, edición y visualización de proyectos, archivos y datasets
 * Incluye funcionalidades de carga de CSV y visualización de datos
 */
const ProjectManager: React.FC<ProjectManagerProps> = ({ onFileUploadComplete }) => {
  // Estados principales del componente
  const [projects, setProjects] = useState<ProjectData[]>([]);               // Lista de proyectos
  const [selectedProject, setSelectedProject] = useState<ProjectData | null>(null);  // Proyecto seleccionado
  const [projectFiles, setProjectFiles] = useState<FileData[]>([]);         // Archivos del proyecto
  const [projectDatasets, setProjectDatasets] = useState<DatasetData[]>([]);  // Datasets del proyecto
  const [loading, setLoading] = useState(false);                            // Estado de carga
  const [error, setError] = useState<string | null>(null);                  // Mensajes de error
  
  // Estados de navegación entre vistas
  const [currentView, setCurrentView] = useState<'projects' | 'datasets' | 'dataset-viewer'>('projects');
  const [selectedDataset, setSelectedDataset] = useState<DatasetData | null>(null);  // Dataset para visualizar

  // Dialog states
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);

  // Form states
  const [projectName, setProjectName] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [editingProject, setEditingProject] = useState<ProjectData | null>(null);

  // File upload states
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadDatasetType, setUploadDatasetType] = useState<DatasetType>(DatasetType.SAMPLE);
  const [uploadName, setUploadName] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  useEffect(() => {
    if (selectedProject) {
      loadProjectFiles(selectedProject.id);
    }
  }, [selectedProject]);

  const loadProjects = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await window.autoGrpc.getProjects({ limit: 100, offset: 0 });
      setProjects(response.projects || []);
    } catch (err) {
      console.error('Error loading projects:', err);
      setError('Failed to load projects');
    } finally {
      setLoading(false);
    }
  };

  const loadProjectFiles = async (projectId: string) => {
    try {
      const response = await window.autoGrpc.getProjectFiles({ project_id: projectId });
      setProjectFiles(response.files || []);
    } catch (err) {
      console.error('Error loading project files:', err);
      setError('Failed to load project files');
    }
  };

  const loadProjectDatasets = async (projectId: string) => {
    try {
      const response = await window.autoGrpc.getProjectDatasets({ project_id: projectId });
      setProjectDatasets(response.datasets || []);
    } catch (err) {
      console.error('Error loading project datasets:', err);
      setError('Failed to load project datasets');
    }
  };

  const handleDatasetClick = (dataset: DatasetData) => {
    setSelectedDataset(dataset);
    setCurrentView('dataset-viewer');
  };

  const handleBackToProjects = () => {
    setCurrentView('projects');
    setSelectedDataset(null);
  };

  const handleViewDatasets = () => {
    if (selectedProject) {
      loadProjectDatasets(selectedProject.id);
      setCurrentView('datasets');
    }
  };

  const createProject = async () => {
    if (!projectName.trim()) return;

    try {
      setLoading(true);
      const response = await window.autoGrpc.createProject({
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
      const response = await window.autoGrpc.updateProject({
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
    if (!confirm('Are you sure you want to delete this project? This will also delete all associated files and datasets.')) {
      return;
    }

    try {
      setLoading(true);
      const response = await window.autoGrpc.deleteProject({ project_id: projectId });

      if (response.success) {
        if (selectedProject?.id === projectId) {
          setSelectedProject(null);
          setProjectFiles([]);
        }
        await loadProjects();
      } else {
        setError(response.error_message || 'Failed to delete project');
      }
    } catch (err) {
      console.error('Error deleting project:', err);
      setError('Failed to delete project');
    } finally {
      setLoading(false);
    }
  };

  const handleUploadFile = async () => {
    if (!selectedProject || !uploadFile || !uploadName.trim()) return;

    try {
      setLoading(true);
      
      // Read file content as bytes
      const fileContent = await uploadFile.arrayBuffer();
      const uint8Array = new Uint8Array(fileContent);

      const response = await window.autoGrpc.createFile({
        project_id: selectedProject.id,
        name: uploadName,
        dataset_type: uploadDatasetType,
        original_filename: uploadFile.name,
        file_content: uint8Array
      });

      if (response.success) {
        setIsUploadDialogOpen(false);
        setUploadFile(null);
        setUploadName('');
        setUploadDatasetType(DatasetType.SAMPLE);
        await loadProjectFiles(selectedProject.id);
        
        // Call the callback to trigger CSV processing workflow
        if (onFileUploadComplete) {
          onFileUploadComplete(response.file.id, response.file.name);
        }
      } else {
        setError(response.error_message || 'Failed to upload file');
      }
    } catch (err) {
      console.error('Error uploading file:', err);
      setError('Failed to upload file');
    } finally {
      setLoading(false);
    }
  };

  const deleteFile = async (fileId: string) => {
    if (!confirm('Are you sure you want to delete this file?')) {
      return;
    }

    try {
      setLoading(true);
      const response = await window.autoGrpc.deleteFile({ file_id: fileId });

      if (response.success) {
        if (selectedProject) {
          await loadProjectFiles(selectedProject.id);
        }
      } else {
        setError(response.error_message || 'Failed to delete file');
      }
    } catch (err) {
      console.error('Error deleting file:', err);
      setError('Failed to delete file');
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

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  // Conditional rendering based on current view
  if (currentView === 'dataset-viewer' && selectedDataset) {
    return (
      <DatasetViewer
        DatasetInfo={selectedDataset}
        onBack={handleBackToProjects}
      />
    );
  }

  if (currentView === 'datasets' && selectedProject) {
    return (
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Button variant="outline" onClick={() => setCurrentView('projects')}>
              <FolderOpen className="mr-2 h-4 w-4" />
              Volver a Proyectos
            </Button>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">
                {selectedProject.name} - Datasets Procesados
              </h2>
              <p className="text-muted-foreground">
                {projectDatasets.length} dataset(s) procesados
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-md p-4">
            <p className="text-red-800">{error}</p>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setError(null)}
              className="mt-2"
            >
              Descartar
            </Button>
          </div>
        )}

        {/* Datasets List */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="mr-2 h-5 w-5" />
              Datasets Procesados
            </CardTitle>
            <CardDescription>
              Haz click en un dataset para visualizar los datos
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-muted-foreground">Cargando datasets...</p>
            ) : projectDatasets.length === 0 ? (
              <div className="text-center py-8">
                <Database className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No se encontraron datasets</p>
                <p className="text-sm text-muted-foreground mt-1">Procesa algunos archivos CSV para crear datasets</p>
              </div>
            ) : (
              <div className="space-y-3">
                {projectDatasets.map((dataset) => (
                  <div
                    key={dataset.id}
                    className="p-4 border rounded-lg cursor-pointer transition-colors hover:border-blue-300 hover:bg-blue-50"
                    onClick={() => handleDatasetClick(dataset)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-semibold">{dataset.file_name}</h4>
                          <Badge className={datasetTypeBadgeColors[dataset.dataset_type as DatasetType]}>
                            {datasetTypeLabels[dataset.dataset_type as DatasetType]}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {dataset.original_filename} • {dataset.total_rows.toLocaleString()} rows
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Procesado: {formatDate(dataset.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDatasetClick(dataset);
                          }}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Ver
                        </Button>
                        <BarChart3 className="h-5 w-5 text-muted-foreground" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Administrador de Proyectos</h2>
          <p className="text-muted-foreground">
            Administra tus proyectos geoespaciales y datasets
          </p>
        </div>
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="mr-2 h-4 w-4" />
              Nuevo Proyecto
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

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <p className="text-red-800">{error}</p>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => setError(null)}
            className="mt-2"
          >
            Descartar
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Projects List */}
        <Card>
          <CardHeader>
            <CardTitle>Proyectos</CardTitle>
            <CardDescription>
              {projects.length} proyecto(s)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading && projects.length === 0 ? (
              <p className="text-muted-foreground">Cargando proyectos...</p>
            ) : projects.length === 0 ? (
              <p className="text-muted-foreground">No se encontraron proyectos. Crea tu primer proyecto para comenzar</p>
            ) : (
              <div className="space-y-3">
                {projects.map((project) => (
                  <div
                    key={project.id}
                    className={`p-3 border rounded-lg cursor-pointer transition-colors ${ 
                      selectedProject?.id === project.id 
                        ? 'border-blue-500 bg-blue-50' 
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                    onClick={() => setSelectedProject(project)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <h4 className="font-semibold">{project.name}</h4>
                        {project.description && (
                          <p className="text-sm text-muted-foreground mt-1">
                            {project.description}
                          </p>
                        )}
                        <p className="text-xs text-muted-foreground mt-2">
                          Creado: {formatDate(project.created_at)}
                        </p>
                      </div>
                      <div className="flex items-center space-x-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            openEditDialog(project);
                          }}
                        >
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteProject(project.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Project Details & Files */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>{selectedProject ? `${selectedProject.name} Archivos` : 'Selecciona un Proyecto'}</span>
              {selectedProject && (
                <div className="flex items-center space-x-2">
                  <Button 
                    size="sm" 
                    variant="outline"
                    onClick={handleViewDatasets}
                  >
                    <Database className="mr-2 h-4 w-4" />
                    Ver Datasets
                  </Button>
                  <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm">
                        <Upload className="mr-2 h-4 w-4" />
                        Cargar Archivo
                      </Button>
                    </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Cargar Archivo</DialogTitle>
                      <DialogDescription>
                        Carga un archivo de dataset a {selectedProject.name}
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="file-upload">File</Label>
                        <Input
                          id="file-upload"
                          type="file"
                          accept=".csv,.txt"
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        />
                      </div>
                      <div>
                        <Label htmlFor="file-name">File Name</Label>
                        <Input
                          id="file-name"
                          value={uploadName}
                          onChange={(e) => setUploadName(e.target.value)}
                          placeholder="Ingresa un nombre para este archivo"
                        />
                      </div>
                      {uploadDatasetType && (
                      <div>
                        <Label htmlFor="dataset-type">Tipo de Dataset </Label>
                        <Select
                          value={uploadDatasetType.toString()}
                          onValueChange={(value) => setUploadDatasetType(parseInt(value) as DatasetType)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select dataset type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="1">
                              Sample
                            </SelectItem>
                            <SelectItem value="2">
                              Drill Holes
                            </SelectItem>
                            <SelectItem value="3">
                              Block
                            </SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                    <DialogFooter>
                      <Button
                        onClick={handleUploadFile}
                        disabled={loading || !uploadFile || !uploadName.trim()}
                      >
                        Upload File
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
                </div>
              )}
            </CardTitle>
            <CardDescription>
              {selectedProject ? `${projectFiles.length} archivo(s)` : 'Selecciona un proyecto para ver sus archivos'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!selectedProject ? (
              <div className="text-center py-8">
                <FolderOpen className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">Selecciona un proyecto desde la izquierda para ver sus archivos</p>
              </div>
            ) : projectFiles.length === 0 ? (
              <div className="text-center py-8">
                <Upload className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-muted-foreground">No hay archivos cargados aún</p>
                <p className="text-sm text-muted-foreground mt-1">Carga tu primer dataset para comenzar</p>
              </div>
            ) : (
              <div className="space-y-3">
                {projectFiles.map((file) => (
                  <div
                    key={file.id}
                    className="p-3 border rounded-lg"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <h4 className="font-semibold">{file.name}</h4>
                          <Badge className={datasetTypeBadgeColors[file.dataset_type]}>
                            {datasetTypeLabels[file.dataset_type]}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {file.original_filename} • {formatFileSize(file.file_size)}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">
                          Cargado: {formatDate(file.created_at)}
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteFile(file.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Edit Project Dialog */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>
              Update the project information.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="edit-name">Project Name</Label>
              <Input
                id="edit-name"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="Enter project name"
              />
            </div>
            <div>
              <Label htmlFor="edit-description">Description</Label>
              <Textarea
                id="edit-description"
                value={projectDescription}
                onChange={(e) => setProjectDescription(e.target.value)}
                placeholder="Enter project description (optional)"
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={updateProject}
              disabled={loading || !projectName.trim()}
            >
              Update Project
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ProjectManager;