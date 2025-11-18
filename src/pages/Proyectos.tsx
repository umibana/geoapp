import React, { useState } from 'react';
import ProjectManager from '@/components/proyectos/ProjectManager';
import EnhancedCsvProcessor from '@/components/proyectos/EnhancedCsvProcessor';
import FileUploadView from '@/components/proyectos/FileUploadView';

/**
 * Estado del flujo de trabajo de proyectos
 * Define la navegación entre gestión de proyectos, carga de archivos y procesamiento de CSV
 */
interface ProjectWorkflowState {
  view: 'projects' | 'file-upload' | 'csv-processor';  // Vista actual del flujo de trabajo
  projectId?: string;                 // ID del proyecto actual
  projectName?: string;               // Nombre del proyecto actual
  processingFileId?: string;          // ID del archivo en procesamiento
  processingFileName?: string;        // Nombre del archivo en procesamiento
}

/**
 * Componente principal del flujo de trabajo de proyectos
 * Orquesta la navegación entre la gestión de proyectos, carga de archivos y el procesamiento de archivos CSV
 * Maneja el flujo: Proyectos → Vista de Carga → Configuración → Procesamiento → Vuelta a proyectos
 */
export default function Proyectos() {
  const [workflowState, setWorkflowState] = useState<ProjectWorkflowState>({
    view: 'projects'
  });

  /**
   * Maneja la navegación a la vista de carga de archivos
   * Se llama cuando el usuario quiere agregar un nuevo archivo
   */
  const handleNavigateToUpload = (projectId: string, projectName: string) => {
    setWorkflowState({
      view: 'file-upload',
      projectId,
      projectName
    });
  };

  /**
   * Maneja la finalización de carga de archivo
   * Después de cargar un archivo, cambia al procesador CSV para configuración de columnas
   */
  const handleFileUploadComplete = (fileId: string, fileName: string) => {
    setWorkflowState({
      ...workflowState,
      view: 'csv-processor',
      processingFileId: fileId,
      processingFileName: fileName
    });
  };

  /**
   * Maneja la finalización del procesamiento de dataset
   * Regresa a la vista de proyectos después del procesamiento exitoso
   */
  const handleProcessingComplete = (datasetId: string) => {
    console.log('Dataset processing complete:', datasetId);
    setWorkflowState({ view: 'projects' });
  };

  /**
   * Maneja la cancelación de cualquier vista
   * Regresa a la vista de proyectos
   */
  const handleCancel = () => {
    setWorkflowState({ view: 'projects' });
  };

  return (
    <div className="w-full h-full">
      {workflowState.view === 'projects' && (
        <ProjectManager 
          onNavigateToUpload={handleNavigateToUpload}
        />
      )}
      
      {workflowState.view === 'file-upload' && workflowState.projectId && (
        <FileUploadView
          projectId={workflowState.projectId}
          projectName={workflowState.projectName || 'Proyecto'}
          onCancel={handleCancel}
          onUploadComplete={handleFileUploadComplete}
        />
      )}
      
      {workflowState.view === 'csv-processor' && workflowState.processingFileId && (
        <EnhancedCsvProcessor
          fileId={workflowState.processingFileId}
          fileName={workflowState.processingFileName || 'Archivo Desconocido'}
          onProcessingComplete={handleProcessingComplete}
          onCancel={handleCancel}
        />
      )}
    </div>
  );
};