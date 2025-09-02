import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { CheckCircle2, XCircle, AlertCircle, FileText, Settings, Database } from 'lucide-react';

// Importar tipos generados
import { AnalyzeCsvForProjectResponse, ColumnMapping, ColumnType, ProcessDatasetResponse } from '@/generated/projects';

/**
 * Propiedades del procesador mejorado de CSV
 * Define los callbacks y datos necesarios para procesar archivos CSV
 */
interface EnhancedCsvProcessorProps {
  fileId: string;                                          // ID del archivo a procesar
  fileName: string;                                        // Nombre del archivo
  onProcessingComplete?: (datasetId: string) => void;      // Callback al completar procesamiento
  onCancel?: () => void;                                   // Callback para cancelar
}


const columnTypeLabels = {
  [ColumnType.NUMERIC]: 'Numeric',
  [ColumnType.CATEGORICAL]: 'Categorical',
  [ColumnType.UNUSED]: 'Unused',
  [ColumnType.UNSPECIFIED]: 'Unspecified'
};

const columnTypeBadgeColors = {
  [ColumnType.NUMERIC]: 'bg-blue-100 text-blue-800',
  [ColumnType.CATEGORICAL]: 'bg-green-100 text-green-800',
  [ColumnType.UNUSED]: 'bg-gray-100 text-gray-800',
  [ColumnType.UNSPECIFIED]: 'bg-yellow-100 text-yellow-800'
};

// Campos de coordenadas disponibles para mapeo
const coordinateFields = ['x', 'y', 'z'];

/**
 * Componente mejorado para procesamiento de archivos CSV
 * Analiza la estructura del CSV, permite configurar mapeo de columnas
 * y procesa el archivo para crear un dataset geoespacial
 */
const EnhancedCsvProcessor: React.FC<EnhancedCsvProcessorProps> = ({
  fileId,
  fileName,
  onProcessingComplete,
  onCancel
}) => {
  // Estados del procesamiento
  const [currentStep, setCurrentStep] = useState<'analyzing' | 'configuring' | 'processing' | 'complete'>('analyzing');
  const [loading, setLoading] = useState(false);               // Estado de carga
  const [error, setError] = useState<string | null>(null);     // Mensajes de error
  
  // Analysis results
  const [headers, setHeaders] = useState<string[]>([]);
  const [previewRows, setPreviewRows] = useState<string[][]>([]);
  const [totalRows, setTotalRows] = useState(0);
  
  // Column configuration
  const [columnMappings, setColumnMappings] = useState<ColumnMapping[]>([]);
  
  // Processing results
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [processedDataset, setProcessedDataset] = useState<any>(null);

  useEffect(() => {
    analyzeFile();
  }, [fileId]);

  const analyzeFile = async () => {
    try {
      setLoading(true);
      setError(null);
      setCurrentStep('analyzing');

      const response = await window.autoGrpc.analyzeCsvForProject({
        file_id: fileId
        
      }) as AnalyzeCsvForProjectResponse;

      if (response.success) {
        setHeaders(response.headers);
        setPreviewRows(response.preview_rows.map(row => row.values));
        setTotalRows(response.total_rows);

        // Initialize column mappings with suggestions
        const initialMappings: ColumnMapping[] = response.headers.map((header, index) => ({
          column_name: header,
          column_type: response.suggested_types[index] || ColumnType.NUMERIC,
          mapped_field: response.suggested_mappings[header] || 'none',
          is_coordinate: coordinateFields.includes(response.suggested_mappings[header] || '')
        }));

        setColumnMappings(initialMappings);
        setCurrentStep('configuring');
      } else {
        setError(response.error_message || 'Failed to analyze CSV file');
      }
    } catch (err) {
      console.error('Error analyzing file:', err);
      setError('Failed to analyze CSV file');
    } finally {
      setLoading(false);
    }
  };

  const updateColumnMapping = (index: number, updates: Partial<ColumnMapping>) => {
    const newMappings = [...columnMappings];
    newMappings[index] = { ...newMappings[index], ...updates };
    
    // Auto-set is_coordinate based on mapped_field
    if (updates.mapped_field !== undefined) {
      newMappings[index].is_coordinate = updates.mapped_field !== 'none' && coordinateFields.includes(updates.mapped_field);
    }
    
    setColumnMappings(newMappings);
  };

  const processDataset = async () => {
    try {
      setLoading(true);
      setError(null);
      setCurrentStep('processing');

      // Convert 'none' values back to empty strings for the backend
      const backendMappings = columnMappings.map(mapping => ({
        ...mapping,
        mapped_field: mapping.mapped_field === 'none' ? '' : mapping.mapped_field
      }));

      const response = await window.autoGrpc.processDataset({
        file_id: fileId,
        column_mappings: backendMappings
      }) as ProcessDatasetResponse;

      if (response.success) {
        setProcessedDataset(response.dataset);
        setCurrentStep('complete');
        
        if (onProcessingComplete) {
          onProcessingComplete(response.dataset.id);
        }
      } else {
        setError(response.error_message || 'Failed to process dataset');
        setCurrentStep('configuring');
      }
    } catch (err) {
      console.error('Error processing dataset:', err);
      setError('Failed to process dataset');
      setCurrentStep('configuring');
    } finally {
      setLoading(false);
    }
  };

  const getStepIcon = (step: string) => {
    switch (step) {
      case 'analyzing':
        return <FileText className="h-5 w-5" />;
      case 'configuring':
        return <Settings className="h-5 w-5" />;
      case 'processing':
        return <Database className="h-5 w-5" />;
      case 'complete':
        return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      default:
        return <AlertCircle className="h-5 w-5" />;
    }
  };

  const isCurrentStep = (step: string) => currentStep === step;
  const isCompletedStep = (step: string) => {
    const steps = ['analyzing', 'configuring', 'processing', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(step);
    return stepIndex < currentIndex;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Process CSV Dataset</h2>
          <p className="text-muted-foreground">
            Configure column types and coordinate mappings for {fileName}
          </p>
        </div>
        {onCancel && (
          <Button variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>

      {/* Progress Steps */}
      <div className="flex items-center space-x-4">
        {[
          { key: 'analyzing', label: 'Analyzing' },
          { key: 'configuring', label: 'Configure' },
          { key: 'processing', label: 'Processing' },
          { key: 'complete', label: 'Complete' }
        ].map((step, index) => (
          <div key={step.key} className="flex items-center space-x-2">
            <div className={`flex items-center justify-center w-10 h-10 rounded-full border-2 ${
              isCurrentStep(step.key) 
                ? 'border-blue-500 bg-blue-50' 
                : isCompletedStep(step.key)
                ? 'border-green-500 bg-green-50'
                : 'border-gray-300 bg-gray-50'
            }`}>
              {getStepIcon(step.key)}
            </div>
            <span className={`text-sm ${
              isCurrentStep(step.key) || isCompletedStep(step.key)
                ? 'font-semibold'
                : 'text-muted-foreground'
            }`}>
              {step.label}
            </span>
            {index < 3 && (
              <div className={`w-8 h-0.5 ${
                isCompletedStep(['configuring', 'processing', 'complete'][index])
                  ? 'bg-green-500'
                  : 'bg-gray-300'
              }`} />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-md p-4">
          <div className="flex items-center space-x-2">
            <XCircle className="h-5 w-5 text-red-600" />
            <p className="text-red-800">{error}</p>
          </div>
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

      {/* Content based on current step */}
      {currentStep === 'analyzing' && (
        <Card>
          <CardHeader>
            <CardTitle>Analyzing CSV File</CardTitle>
            <CardDescription>
              Examining file structure and detecting column types...
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                <span className="ml-3">Analyzing file...</span>
              </div>
            ) : (
              <p className="text-muted-foreground">Analysis complete. Proceeding to configuration...</p>
            )}
          </CardContent>
        </Card>
      )}

      {currentStep === 'configuring' && (
        <div className="space-y-6">
          {/* File Info */}
          <Card>
            <CardHeader>
              <CardTitle>File Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label className="text-sm font-medium">File Name</Label>
                  <p className="text-sm text-muted-foreground">{fileName}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Total Rows</Label>
                  <p className="text-sm text-muted-foreground">{totalRows.toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium">Columns</Label>
                  <p className="text-sm text-muted-foreground">{headers.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Data Preview */}
          <Card>
            <CardHeader>
              <CardTitle>Data Preview</CardTitle>
              <CardDescription>First 5 rows of your data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {headers.map((header) => (
                        <TableHead key={header} className="min-w-[100px]">
                          {header}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((row, rowIndex) => (
                      <TableRow key={rowIndex}>
                        {row.map((cell, cellIndex) => (
                          <TableCell key={cellIndex} className="max-w-[150px] truncate">
                            {cell}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          {/* Column Configuration */}
          <Card>
            <CardHeader>
              <CardTitle>Column Configuration</CardTitle>
              <CardDescription>
                Configure the data type and coordinate mapping for each column
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {columnMappings.map((mapping, index) => (
                  <div key={mapping.column_name} className="grid grid-cols-4 gap-4 items-center p-3 border rounded-lg">
                    <div>
                      <Label className="text-sm font-medium">{mapping.column_name}</Label>
                      <Badge className={`ml-2 ${columnTypeBadgeColors[mapping.column_type]}`}>
                        {columnTypeLabels[mapping.column_type]}
                      </Badge>
                    </div>
                    
                    <div>
                      <Label className="text-xs text-muted-foreground">Data Type</Label>
                      <Select
                        value={mapping.column_type.toString()}
                        onValueChange={(value) => updateColumnMapping(index, { 
                          column_type: parseInt(value) as ColumnType 
                        })}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">
                            Numeric
                          </SelectItem>
                          <SelectItem value="2">
                            Categorical
                          </SelectItem>
                          <SelectItem value="3">
                            Unused
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div>
                      <Label className="text-xs text-muted-foreground">Coordinate Field</Label>
                      <Select
                        value={mapping.mapped_field}
                        onValueChange={(value) => updateColumnMapping(index, { mapped_field: value })}
                        disabled={mapping.column_type === ColumnType.UNUSED}
                      >
                        <SelectTrigger className="h-8">
                          <SelectValue placeholder="None" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">None</SelectItem>
                          <SelectItem value="x">X (East/Longitude)</SelectItem>
                          <SelectItem value="y">Y (North/Latitude)</SelectItem>
                          <SelectItem value="z">Z (Elevation/Depth)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    <div className="flex items-center space-x-2">
                      <Switch
                        checked={mapping.is_coordinate}
                        onCheckedChange={(checked) => updateColumnMapping(index, { is_coordinate: checked })}
                        disabled={mapping.mapped_field === 'none' || mapping.column_type === ColumnType.UNUSED}
                      />
                      <Label className="text-xs text-muted-foreground">Coordinate</Label>
                    </div>
                  </div>
                ))}
              </div>
              
              <div className="flex justify-end space-x-2 mt-6">
                <Button variant="outline" onClick={onCancel}>
                  Cancel
                </Button>
                <Button 
                  onClick={processDataset} 
                  disabled={loading || !columnMappings.some(m => m.column_type !== ColumnType.UNUSED)}
                >
                  Process Dataset
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {currentStep === 'processing' && (
        <Card>
          <CardHeader>
            <CardTitle>Processing Dataset</CardTitle>
            <CardDescription>
              Converting and storing your data with the specified configuration...
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3">Processing dataset...</span>
            </div>
          </CardContent>
        </Card>
      )}

      {currentStep === 'complete' && processedDataset && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <CheckCircle2 className="h-6 w-6 text-green-600" />
              <span>Dataset Processed Successfully</span>
            </CardTitle>
            <CardDescription>
              Your dataset has been processed and is ready for analysis
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <Label className="text-sm font-medium">Dataset ID</Label>
                <p className="text-sm text-muted-foreground font-mono">{processedDataset.id}</p>
              </div>
              <div>
                <Label className="text-sm font-medium">Processed Rows</Label>
                <p className="text-sm text-muted-foreground">{processedDataset.total_rows.toLocaleString()}</p>
              </div>
            </div>
            
            <div className="mt-4">
              <Label className="text-sm font-medium">Column Mappings</Label>
              <div className="mt-2 space-y-1">
                {processedDataset.column_mappings
                  .filter((m: ColumnMapping) => m.column_type !== ColumnType.UNUSED)
                  .map((mapping: ColumnMapping) => (
                    <div key={mapping.column_name} className="flex items-center justify-between text-sm">
                      <span>{mapping.column_name}</span>
                      <div className="flex items-center space-x-2">
                        <Badge className={columnTypeBadgeColors[mapping.column_type]}>
                          {columnTypeLabels[mapping.column_type]}
                        </Badge>
                        {mapping.mapped_field && mapping.mapped_field !== 'none' && (
                          <Badge variant="outline">
                            {mapping.mapped_field.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
            
            <div className="flex justify-end mt-6">
              <Button onClick={onCancel}>
                Done
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default EnhancedCsvProcessor;