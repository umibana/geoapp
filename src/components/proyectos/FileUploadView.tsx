import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ArrowLeft, Upload, ChevronDown, ChevronRight, Plus, Trash2, AlertCircle, Loader2, Settings, CheckCircle2 } from 'lucide-react';
import { DatasetType } from '@/generated/projects';
import { startOperationTracking } from '@/stores/operationsStore';

/**
 * FileUploadView Component
 * Unified view for uploading files and previewing them before processing
 * Replaces the upload dialog with a dedicated view
 */

interface FileUploadViewProps {
  projectId: string;
  projectName: string;
  onCancel: () => void;
  onUploadComplete: (fileId: string, fileName: string) => void;
  compact?: boolean; // Add this prop
}

const FileUploadView: React.FC<FileUploadViewProps> = ({
  projectId,
  projectName,
  onCancel,
  onUploadComplete,
  compact = false // Default to false
}) => {
  // Upload state
  const [uploadDatasetType, setUploadDatasetType] = useState<DatasetType>(DatasetType.DATASET_TYPE_SAMPLE);
  const [uploadDatasetName, setUploadDatasetName] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  // Multi-file upload (for DRILL_HOLES)
  const [assayFiles, setAssayFiles] = useState<File[]>([]);
  const [collarFile, setCollarFile] = useState<File | null>(null);
  const [surveyFile, setSurveyFile] = useState<File | null>(null);
  
  // Preprocessing options
  const [skipRows, setSkipRows] = useState<number>(0);
  const [skipColumns, setSkipColumns] = useState<string>('');
  const [replacements, setReplacements] = useState<{from: string, to: string}[]>([{from: '', to: ''}]);
  const [preprocessingExpanded, setPreprocessingExpanded] = useState(false);
  
  // Block settings (for BLOCK dataset type)
  const [blockSettingsX, setBlockSettingsX] = useState<number>(10);
  const [blockSettingsY, setBlockSettingsY] = useState<number>(10);
  const [blockSettingsZ, setBlockSettingsZ] = useState<number>(5);
  
  // Upload state
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Handle file upload
  const handleUploadFile = async () => {
    if (!uploadDatasetName.trim()) {
      setError('Por favor ingrese un nombre para el dataset');
      return;
    }

    setError(null);
    setSuccessMessage(null);
    setUploading(true);

    // Start progress tracking in footer
    startOperationTracking();

    try {
      // Prepare preprocessing options
      const replaceData = replacements
        .filter(r => r.from.trim() !== '')
        .map(r => ({ from_value: r.from, to_value: r.to }));
      
      const skipColumnsArray = skipColumns
        .split(',')
        .map(col => col.trim())
        .filter(col => col !== '');

      if (uploadDatasetType === DatasetType.DATASET_TYPE_DRILL_HOLES) {
        // Multi-file upload for drill holes
        if (assayFiles.length === 0) {
          throw new Error('Debe cargar al menos un archivo de ensayos (assay)');
        }

        const fileUploads = [];
        
        // Add assay files
        for (const file of assayFiles) {
          const content = await file.arrayBuffer();
          fileUploads.push({
            name: file.name.replace('.csv', ''),
            original_filename: file.name,
            file_content: new Uint8Array(content),
            file_role: 'assay'
          });
        }
        
        // Add collar file if present
        if (collarFile) {
          const content = await collarFile.arrayBuffer();
          fileUploads.push({
            name: collarFile.name.replace('.csv', ''),
            original_filename: collarFile.name,
            file_content: new Uint8Array(content),
            file_role: 'collar'
          });
        }
        
        // Add survey file if present
        if (surveyFile) {
          const content = await surveyFile.arrayBuffer();
          fileUploads.push({
            name: surveyFile.name.replace('.csv', ''),
            original_filename: surveyFile.name,
            file_content: new Uint8Array(content),
            file_role: 'survey'
          });
        }

        const result = await window.grpc.createMultiFile({
          project_id: projectId,
          dataset_type: uploadDatasetType,
          files: fileUploads,
          skip_rows: skipRows > 0 ? skipRows : undefined,
          skip_columns: skipColumnsArray,
          replace_data: replaceData,
        });

        if (result.success && result.files.length > 0) {
          // Use the first assay file as the primary file
          const primaryFile = result.files.find((f: { name: string }) => f.name.includes('assay')) || result.files[0];
          setSuccessMessage('Archivos cargados correctamente.');
          onUploadComplete(primaryFile.id, primaryFile.name);
        } else {
          throw new Error(result.error_message || 'Error al cargar archivos');
        }
      } else {
        // Single file upload for SAMPLE or BLOCK
        if (!uploadFile) {
          throw new Error('Debe seleccionar un archivo');
        }

        const content = await uploadFile.arrayBuffer();
        const requestData: {
          project_id: string;
          name: string;
          dataset_type: DatasetType;
          original_filename: string;
          file_content: Uint8Array;
          skip_rows?: number;
          skip_columns: string[];
          replace_data: Array<{ from_value: string; to_value: string }>;
          block_settings?: { x: number; y: number; z: number };
        } = {
          project_id: projectId,
          name: uploadDatasetName,
          dataset_type: uploadDatasetType,
          original_filename: uploadFile.name,
          file_content: new Uint8Array(content),
          skip_rows: skipRows > 0 ? skipRows : undefined,
          skip_columns: skipColumnsArray,
          replace_data: replaceData,
        };

        // Add block settings if BLOCK type
        if (uploadDatasetType === DatasetType.DATASET_TYPE_BLOCK) {
          requestData.block_settings = {
            x: blockSettingsX,
            y: blockSettingsY,
            z: blockSettingsZ
          };
        }

        const result = await window.grpc.createFile(requestData);

        if (result.success && result.file) {
          setSuccessMessage('Archivo cargado correctamente.');
          onUploadComplete(result.file.id, result.file.name);
        } else {
          throw new Error(result.error_message || 'Error al cargar archivo');
        }
      }
    } catch (err) {
      const error = err as Error;
      console.error('Error uploading file:', error);
      setError(error.message || 'Error al cargar archivo');
    } finally {
      setUploading(false);
    }
  };

  // Add replacement row
  const handleAddReplacement = () => {
    setReplacements([...replacements, {from: '', to: ''}]);
  };

  // Remove replacement row
  const handleRemoveReplacement = (index: number) => {
    setReplacements(replacements.filter((_, i) => i !== index));
  };

  // Render upload form
  const renderUploadForm = () => (
    <div className="space-y-6">
      {/* Basic Info */}
      <Card>
        <CardHeader>
          <CardTitle>Información del Dataset</CardTitle>
          <CardDescription>Proporcione la información básica del archivo</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="dataset-name">Nombre del Dataset</Label>
            <Input
              id="dataset-name"
              value={uploadDatasetName}
              onChange={(e) => setUploadDatasetName(e.target.value)}
              placeholder="Ej: Muestras Enero 2024"
              disabled={uploading}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="dataset-type">Tipo de Dataset</Label>
            <Select
              value={uploadDatasetType.toString()}
              onValueChange={(value) => setUploadDatasetType(parseInt(value) as DatasetType)}
              disabled={uploading}
            >
              <SelectTrigger id="dataset-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={DatasetType.DATASET_TYPE_SAMPLE.toString()}>Sample</SelectItem>
                <SelectItem value={DatasetType.DATASET_TYPE_DRILL_HOLES.toString()}>Drill Holes</SelectItem>
                <SelectItem value={DatasetType.DATASET_TYPE_BLOCK.toString()}>Block Model</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* File Upload */}
      <Card>
        <CardHeader>
          <CardTitle>Archivos</CardTitle>
          <CardDescription>
            {uploadDatasetType === DatasetType.DATASET_TYPE_DRILL_HOLES
              ? 'Cargue archivos de ensayos (assay), collar y survey'
              : 'Seleccione el archivo CSV a cargar'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {uploadDatasetType === DatasetType.DATASET_TYPE_DRILL_HOLES ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="assay-files">Archivos de Ensayos (Assay) *</Label>
                <Input
                  id="assay-files"
                  type="file"
                  accept=".csv"
                  multiple
                  onChange={(e) => {
                    setSuccessMessage(null);
                    setAssayFiles(e.target.files ? Array.from(e.target.files) : []);
                  }}
                  disabled={uploading}
                />
                {assayFiles.length > 0 && (
                  <p className="text-sm text-muted-foreground">
                    {assayFiles.length} archivo(s) seleccionado(s)
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="collar-file">Archivo Collar (Opcional)</Label>
                <Input
                  id="collar-file"
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    setSuccessMessage(null);
                    setCollarFile(e.target.files?.[0] || null);
                  }}
                  disabled={uploading}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="survey-file">Archivo Survey (Opcional)</Label>
                <Input
                  id="survey-file"
                  type="file"
                  accept=".csv"
                  onChange={(e) => {
                    setSuccessMessage(null);
                    setSurveyFile(e.target.files?.[0] || null);
                  }}
                  disabled={uploading}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="upload-file">
                {uploadDatasetType === DatasetType.DATASET_TYPE_BLOCK 
                  ? 'Archivo (CSV o GSLIB .out) *' 
                  : 'Archivo CSV *'}
              </Label>
              <Input
                id="upload-file"
                type="file"
                accept={uploadDatasetType === DatasetType.DATASET_TYPE_BLOCK ? ".csv,.out" : ".csv"}
                onChange={(e) => {
                  setSuccessMessage(null);
                  setUploadFile(e.target.files?.[0] || null);
                }}
                disabled={uploading}
              />
              {uploadFile && (
                <p className="text-sm text-muted-foreground">
                  {uploadFile.name} ({(uploadFile.size / 1024).toFixed(2)} KB)
                </p>
              )}
              {uploadDatasetType === DatasetType.DATASET_TYPE_BLOCK && (
                <p className="text-xs text-muted-foreground">
                  Formatos soportados: CSV estándar o GSLIB (.out)
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Block Model Settings */}
      {uploadDatasetType === DatasetType.DATASET_TYPE_BLOCK && (
        <Card>
          <CardHeader>
            <CardTitle>Configuración del Modelo de Bloques</CardTitle>
            <CardDescription>Defina las dimensiones de los bloques</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="block-x">Tamaño X</Label>
                <Input
                  id="block-x"
                  type="number"
                  value={blockSettingsX}
                  onChange={(e) => setBlockSettingsX(parseFloat(e.target.value) || 10)}
                  step="0.1"
                  disabled={uploading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="block-y">Tamaño Y</Label>
                <Input
                  id="block-y"
                  type="number"
                  value={blockSettingsY}
                  onChange={(e) => setBlockSettingsY(parseFloat(e.target.value) || 10)}
                  step="0.1"
                  disabled={uploading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="block-z">Tamaño Z</Label>
                <Input
                  id="block-z"
                  type="number"
                  value={blockSettingsZ}
                  onChange={(e) => setBlockSettingsZ(parseFloat(e.target.value) || 5)}
                  step="0.1"
                  disabled={uploading}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Preprocessing Options */}
      <Card>
        <Collapsible open={preprocessingExpanded} onOpenChange={setPreprocessingExpanded}>
          <CardHeader className="cursor-pointer" onClick={() => !uploading && setPreprocessingExpanded(!preprocessingExpanded)}>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5" />
                  Opciones de Preprocesamiento
                </CardTitle>
                <CardDescription>Configuración opcional para limpieza de datos</CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" disabled={uploading}>
                  {preprocessingExpanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="skip-rows">Saltar Filas Iniciales</Label>
                <Input
                  id="skip-rows"
                  type="number"
                  min="0"
                  value={skipRows}
                  onChange={(e) => setSkipRows(parseInt(e.target.value) || 0)}
                  placeholder="0"
                  disabled={uploading}
                />
                <p className="text-xs text-muted-foreground">
                  Número de filas a ignorar al inicio del archivo
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="skip-columns">Columnas a Ignorar</Label>
                <Input
                  id="skip-columns"
                  value={skipColumns}
                  onChange={(e) => setSkipColumns(e.target.value)}
                  placeholder="columna1, columna2"
                  disabled={uploading}
                />
                <p className="text-xs text-muted-foreground">
                  Nombres de columnas separados por comas
                </p>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Reemplazar Valores</Label>
                  <Button variant="outline" size="sm" onClick={handleAddReplacement} disabled={uploading}>
                    <Plus className="h-4 w-4 mr-1" />
                    Agregar
                  </Button>
                </div>
                {replacements.map((replacement, index) => (
                  <div key={index} className="flex gap-2 items-center">
                    <Input
                      placeholder="Valor original"
                      value={replacement.from}
                      onChange={(e) => {
                        const newReplacements = [...replacements];
                        newReplacements[index].from = e.target.value;
                        setReplacements(newReplacements);
                      }}
                      disabled={uploading}
                    />
                    <span>→</span>
                    <Input
                      placeholder="Nuevo valor"
                      value={replacement.to}
                      onChange={(e) => {
                        const newReplacements = [...replacements];
                        newReplacements[index].to = e.target.value;
                        setReplacements(newReplacements);
                      }}
                      disabled={uploading}
                    />
                    {replacements.length > 1 && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRemoveReplacement(index)}
                        disabled={uploading}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>
      
      {/* Show upload button here in compact mode */}
      {compact && (
        <div className="pt-2">
          <Button onClick={handleUploadFile} disabled={uploading} className="w-full">
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Cargando...
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 mr-2" />
                Cargar Archivo
              </>
            )}
          </Button>
        </div>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {successMessage && (
        <Alert className="border-green-200 bg-green-50 text-green-800">
          <CheckCircle2 className="h-4 w-4 text-green-600" />
          <AlertDescription>{successMessage}</AlertDescription>
        </Alert>
      )}
    </div>
  );


  return (
    <div className="h-full flex flex-col">
      {/* Header - Only show if NOT compact */}
      {!compact && (
        <div className="border-b bg-background sticky top-0 z-10">
          <div className="flex items-center justify-between p-4">
            <div className="flex items-center gap-4">
              <Button variant="ghost" onClick={onCancel} disabled={uploading}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Volver
              </Button>
              <div>
                <h1 className="text-2xl font-bold">Cargar Archivo</h1>
                <p className="text-sm text-muted-foreground">Proyecto: {projectName}</p>
              </div>
            </div>
            
            <Button onClick={handleUploadFile} disabled={uploading}>
              {uploading ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Cargando...
                </>
              ) : (
                <>
                  <Upload className="h-4 w-4 mr-2" />
                  Cargar Archivo
                </>
              )}
            </Button>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 relative overflow-hidden">
        {uploading && (
          <div className="absolute inset-0 bg-background/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
            <Loader2 className="h-16 w-16 animate-spin text-primary" />
            <h3 className="text-xl font-semibold mt-4">Cargando archivo...</h3>
            <p className="text-muted-foreground">Por favor espere mientras procesamos el archivo</p>
          </div>
        )}
        <div className={`h-full overflow-y-auto ${compact ? 'p-4' : 'p-6'}`}>
          <div className={compact ? '' : 'max-w-5xl mx-auto'}>
            {renderUploadForm()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default FileUploadView;

