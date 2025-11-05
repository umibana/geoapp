import React, { useState } from 'react';
import ProjectManager from './ProjectManager';
import EnhancedCsvProcessor from './EnhancedCsvProcessor';

/**
 * Estado del flujo de trabajo de proyectos
 * Define la navegación entre gestión de proyectos y procesamiento de CSV
 */
interface ProjectWorkflowState {
  view: 'projects' | 'csv-processor';  // Vista actual del flujo de trabajo
  processingFileId?: string;          // ID del archivo en procesamiento
  processingFileName?: string;        // Nombre del archivo en procesamiento
}

/**
 * Componente principal del flujo de trabajo de proyectos
 * Orquesta la navegación entre la gestión de proyectos y el procesamiento de archivos CSV
 * Maneja el flujo: Proyectos → Carga de archivo → Configuración → Procesamiento → Vuelta a proyectos
 */
const ProjectWorkflow: React.FC = () => {
  const [workflowState, setWorkflowState] = useState<ProjectWorkflowState>({
    view: 'projects'
  });

  /**
   * Maneja la finalización de carga de archivo
   * Después de cargar un archivo, cambia al procesador CSV para configuración de columnas
   */
  const handleFileUploadComplete = (fileId: string, fileName: string) => {
    setWorkflowState({
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
   * Maneja la cancelación del procesamiento
   * Regresa a la vista de proyectos si el usuario cancela
   */
  const handleCancelProcessing = () => {
    setWorkflowState({ view: 'projects' });
  };

  return (
    <div className="w-full h-full">
      {workflowState.view === 'projects' && (
        <ProjectManager 
          onFileUploadComplete={handleFileUploadComplete}
        />
      )}
      
      {workflowState.view === 'csv-processor' && workflowState.processingFileId && (
        <EnhancedCsvProcessor
          fileId={workflowState.processingFileId}
          fileName={workflowState.processingFileName || 'Archivo Desconocido'}
          onProcessingComplete={handleProcessingComplete}
          onCancel={handleCancelProcessing}
        />
      )}
    </div>
  );
};

export default ProjectWorkflow;