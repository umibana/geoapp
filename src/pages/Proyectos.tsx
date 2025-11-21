import React, { useState } from 'react';
import ProjectManager from '@/components/proyectos/ProjectManager';
import UploadAndProcessView from '@/components/proyectos/UploadAndProcessView';

/**
 * Estado del flujo de trabajo de proyectos
 */
interface ProjectWorkflowState {
  view: 'projects' | 'upload-process'; 
  projectId?: string;
  projectName?: string;
}

export default function Proyectos() {
  const [workflowState, setWorkflowState] = useState<ProjectWorkflowState>({
    view: 'projects'
  });

  const handleNavigateToUpload = (projectId: string, projectName: string) => {
    setWorkflowState({
      view: 'upload-process',
      projectId,
      projectName
    });
  };

  const handleBackToProjects = () => {
    setWorkflowState({ view: 'projects' });
  };

  return (
    <div className="w-full h-full">
      {workflowState.view === 'projects' && (
        <ProjectManager 
          onNavigateToUpload={handleNavigateToUpload}
        />
      )}
      
      {workflowState.view === 'upload-process' && workflowState.projectId && (
        <UploadAndProcessView
          projectId={workflowState.projectId}
          projectName={workflowState.projectName || 'Proyecto'}
          onBack={handleBackToProjects}
        />
      )}
    </div>
  );
};