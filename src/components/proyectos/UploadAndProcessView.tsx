import React, { useState } from 'react';
import { ArrowLeft, Upload, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import FileUploadView from './FileUploadView';
import EnhancedCsvProcessor from './EnhancedCsvProcessor';

interface UploadAndProcessViewProps {
  projectId: string;
  projectName: string;
  onBack: () => void;
}

const UploadAndProcessView: React.FC<UploadAndProcessViewProps> = ({
  projectId,
  projectName,
  onBack
}) => {
  const [processingFile, setProcessingFile] = useState<{id: string, name: string} | null>(null);

  const handleUploadComplete = (fileId: string, fileName: string) => {
    setProcessingFile({ id: fileId, name: fileName });
  };

  const handleProcessingComplete = (datasetId: string) => {
    // Optional: We could show a toast here
    // We don't navigate away immediately to allow users to upload more files if needed
    console.log('Dataset processed:', datasetId);
  };

  const handleProcessorCancel = () => {
    // This clears the right panel, effectively resetting it for the next upload
    setProcessingFile(null);
  };

  return (
    <div className="w-full h-full flex flex-col">
      {/* Main Header */}
      <div className="border-b bg-background p-4 flex items-center gap-4 shadow-sm z-20">
         <Button variant="ghost" size="sm" onClick={onBack}>
           <ArrowLeft className="h-4 w-4 mr-2" />
           Volver a Proyectos
         </Button>
         <div className="h-6 w-px bg-border mx-2" />
         <div>
           <h1 className="text-lg font-semibold">Gestión de Archivos</h1>
           <p className="text-xs text-muted-foreground">Proyecto: {projectName}</p>
         </div>
      </div>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-0 overflow-hidden">
        {/* Left Column: Upload Form */}
        <div className="border-r bg-muted/10 h-full overflow-y-auto custom-scrollbar">
           <FileUploadView 
             projectId={projectId}
             projectName={projectName}
             onCancel={() => {}} 
             onUploadComplete={handleUploadComplete}
             compact={true}
           />
        </div>

        {/* Right Column: Processor or Placeholder */}
        <div className="h-full overflow-y-auto bg-background custom-scrollbar relative">
           {processingFile ? (
             <EnhancedCsvProcessor
               fileId={processingFile.id}
               fileName={processingFile.name}
               onProcessingComplete={handleProcessingComplete}
               onCancel={handleProcessorCancel}
             />
           ) : (
             <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8 animate-in fade-in duration-500">
               <div className="max-w-md text-center space-y-4">
                 <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center mx-auto mb-6">
                   <Upload className="h-8 w-8 text-muted-foreground/50" />
                 </div>
                 <h3 className="text-xl font-semibold text-foreground">Listo para cargar</h3>
                 <p className="text-sm leading-relaxed">
                   Seleccione un archivo en el panel izquierdo para comenzar. 
                   El asistente de configuración aparecerá aquí automáticamente una vez cargado el archivo.
                 </p>
                 
                 <div className="grid grid-cols-2 gap-4 text-xs mt-8 text-left">
                   <div className="p-3 rounded bg-muted/30 border">
                     <span className="font-medium block mb-1">1. Carga</span>
                     Suba archivos CSV, Survey/Collar o modelos de bloques.
                   </div>
                   <div className="p-3 rounded bg-muted/30 border">
                     <span className="font-medium block mb-1">2. Configuración</span>
                     Defina tipos de columnas y coordenadas (X, Y, Z).
                   </div>
                 </div>
               </div>
             </div>
           )}
        </div>
      </div>
    </div>
  );
};

export default UploadAndProcessView;
