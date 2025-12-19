import React, { useState, useEffect, useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X, Calculator, Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { useProjectStore, type DatasetData } from '@/stores/projectStore';
import { useProcessingStore } from '@/stores/processingStore';
import { useBrushStore } from '@/stores/brushStore';
import { DatasetType } from '@/generated/projects';
import { toast } from 'sonner';

interface IDWFormState {
  blockModelFileId: string;
  drillHolesFileId: string;
  variable: string;
  outputVariable: string;
  power: number;
  numSamples: number;
}

interface IDWResult {
  success: boolean;
  outputVariable: string;
  blocksEstimated: number;
  samplesUsed: number;
  minValue: number;
  maxValue: number;
  meanValue: number;
  stdValue: number;
}

export default function Estimaciones() {
  // Get project and datasets from store
  const selectedProject = useProjectStore((state) => state.selectedProject);
  const projectDatasetsMap = useProjectStore((state) => state.projectDatasetsMap);
  const syncProjectDatasets = useProjectStore((state) => state.syncProjectDatasets);
  const setLatestResult = useProcessingStore((state) => state.setLatestResult);
  
  // Get brush store for refreshing selected dataset metadata
  const brushStoreSelectedDataset = useBrushStore((state) => state.selectedDataset);
  const setSelectedDatasetInBrushStore = useBrushStore((state) => state.setSelectedDataset);
  
  // Form state
  const [formState, setFormState] = useState<IDWFormState>({
    blockModelFileId: '',
    drillHolesFileId: '',
    variable: '',
    outputVariable: '',
    power: 2,
    numSamples: 5,
  });
  
  // UI state
  const [isCalculating, setIsCalculating] = useState(false);
  const [result, setResult] = useState<IDWResult | null>(null);
  const [drillHolesColumns, setDrillHolesColumns] = useState<string[]>([]);
  const [loadingColumns, setLoadingColumns] = useState(false);
  
  // Get datasets for current project
  const currentProjectDatasets = useMemo(() => {
    if (!selectedProject) return [];
    return projectDatasetsMap.get(selectedProject.id) || [];
  }, [selectedProject, projectDatasetsMap]);
  
  // Filter datasets by type
  const blockModelDatasets = useMemo(() => {
    return currentProjectDatasets.filter(
      (d: DatasetData) => d.dataset_type === DatasetType.DATASET_TYPE_BLOCK
    );
  }, [currentProjectDatasets]);
  
  const drillHolesDatasets = useMemo(() => {
    return currentProjectDatasets.filter(
      (d: DatasetData) => d.dataset_type === DatasetType.DATASET_TYPE_DRILL_HOLES
    );
  }, [currentProjectDatasets]);
  
  // Load columns when drill holes dataset is selected
  useEffect(() => {
    const loadDrillHolesColumns = async () => {
      if (!formState.drillHolesFileId) {
        setDrillHolesColumns([]);
        return;
      }
      
      try {
        setLoadingColumns(true);
        const response = await window.grpc.getFileStatistics({
          file_id: formState.drillHolesFileId,
          columns: [],
        });
        
        if (response.success && response.statistics) {
          // Get only numeric columns for estimation
          const numericColumns = response.statistics
            .filter((stat: { data_type: string }) => stat.data_type === 'numeric')
            .map((stat: { column_name: string }) => stat.column_name);
          setDrillHolesColumns(numericColumns);
        }
      } catch (err) {
        console.error('Error loading columns:', err);
        setDrillHolesColumns([]);
      } finally {
        setLoadingColumns(false);
      }
    };
    
    loadDrillHolesColumns();
  }, [formState.drillHolesFileId]);
  
  // Auto-generate output variable name when variable is selected
  useEffect(() => {
    if (formState.variable && !formState.outputVariable) {
      setFormState(prev => ({
        ...prev,
        outputVariable: `${formState.variable}_est`,
      }));
    }
  }, [formState.variable, formState.outputVariable]);
  
  // Handle form field changes
  const handleBlockModelChange = (value: string) => {
    setFormState(prev => ({ ...prev, blockModelFileId: value }));
    setResult(null);
  };
  
  const handleDrillHolesChange = (value: string) => {
    // Find the dataset to get the file_id
    const dataset = drillHolesDatasets.find((d: DatasetData) => d.id === value);
    setFormState(prev => ({
      ...prev,
      drillHolesFileId: dataset?.file_id || '',
      variable: '', // Reset variable when dataset changes
      outputVariable: '',
    }));
    setResult(null);
  };
  
  const handleVariableChange = (value: string) => {
    setFormState(prev => ({
      ...prev,
      variable: value,
      outputVariable: `${value}_est`,
    }));
    setResult(null);
  };
  
  const handleOutputVariableChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormState(prev => ({ ...prev, outputVariable: e.target.value }));
  };
  
  const handlePowerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value);
    if (!isNaN(value) && value > 0) {
      setFormState(prev => ({ ...prev, power: value }));
    }
  };
  
  const handleNumSamplesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseInt(e.target.value, 10);
    if (!isNaN(value) && value > 0) {
      setFormState(prev => ({ ...prev, numSamples: value }));
    }
  };
  
  // Calculate IDW
  const handleCalculateIdw = async () => {
    // Find the block model dataset to get file_id
    const blockModelDataset = blockModelDatasets.find(
      (d: DatasetData) => d.id === formState.blockModelFileId
    );
    
    if (!blockModelDataset) {
      toast.error('Por favor seleccione un modelo de bloques');
      return;
    }
    
    if (!formState.drillHolesFileId) {
      toast.error('Por favor seleccione un dataset de pozos');
      return;
    }
    
    if (!formState.variable) {
      toast.error('Por favor seleccione una variable para estimar');
      return;
    }
    
    if (!formState.outputVariable.trim()) {
      toast.error('Por favor ingrese un nombre para la variable de salida');
      return;
    }
    
    try {
      setIsCalculating(true);
      setResult(null);
      
      const response = await window.grpc.calculateIdw({
        block_model_file_id: blockModelDataset.file_id,
        drill_holes_file_id: formState.drillHolesFileId,
        variable: formState.variable,
        output_variable: formState.outputVariable,
        power: formState.power,
        num_samples: formState.numSamples,
        // Optional coordinate column overrides (empty = use defaults from dataset mappings)
        block_x_col: '',
        block_y_col: '',
        block_z_col: '',
        drill_x_col: '',
        drill_y_col: '',
        drill_z_col: '',
      });
      
      if (response.success) {
        const resultData = {
          success: true,
          outputVariable: response.output_variable || formState.outputVariable,
          blockModelName: blockModelDataset.file_name,
          drillHolesName: drillHolesDatasets.find((d: DatasetData) => d.file_id === formState.drillHolesFileId)?.file_name || '',
          variable: formState.variable,
          blocksEstimated: response.blocks_estimated || 0,
          samplesUsed: response.samples_used || 0,
          minValue: response.min_value || 0,
          maxValue: response.max_value || 0,
          meanValue: response.mean_value || 0,
          stdValue: response.std_value || 0,
          power: formState.power,
          numSamples: formState.numSamples,
          timestamp: Date.now(),
        };
        
        setResult(resultData);
        
        // Store result in processing store for the main content area
        setLatestResult({ type: 'idw', data: resultData });
        
        // Refresh dataset metadata to show new column
        // The backend already updates the dataset's column_mappings, so we just need to refetch
        if (selectedProject) {
          try {
            const datasetsResponse = await window.grpc.getProjectDatasets({
              project_id: selectedProject.id,
            });
            if (datasetsResponse.datasets) {
              // Update project store
              syncProjectDatasets(selectedProject.id, datasetsResponse.datasets);
              
              // Also refresh the brush store's selected dataset if it's the block model we just updated
              if (brushStoreSelectedDataset?.file_id === blockModelDataset.file_id) {
                const updatedDatasetInfo = datasetsResponse.datasets.find(
                  (d: DatasetData) => d.file_id === blockModelDataset.file_id
                );
                
                if (updatedDatasetInfo) {
                  // Update the brush store with the refreshed dataset info from backend
                  const currentState = useBrushStore.getState();
                  if (currentState.datasetData && currentState.globalColumns) {
                    setSelectedDatasetInBrushStore(
                      updatedDatasetInfo,
                      currentState.datasetData,
                      currentState.globalColumns
                    );
                  }
                }
              }
            }
          } catch (refreshErr) {
            console.error('Failed to refresh datasets:', refreshErr);
          }
        }
        
        toast.success(`Estimación IDW completada! Estimados ${response.blocks_estimated} bloques.`);
      } else {
        toast.error(response.error_message || 'IDW calculation failed');
      }
    } catch (err) {
      console.error('IDW calculation error:', err);
      toast.error('Error al calcular la estimación IDW. Verifique la consola para más detalles.');
    } finally {
      setIsCalculating(false);
    }
  };
  
  // Reset form
  const handleCancel = () => {
    setFormState({
      blockModelFileId: '',
      drillHolesFileId: '',
      variable: '',
      outputVariable: '',
      power: 2,
      numSamples: 5,
    });
    setResult(null);
  };
  
  // Check if form is valid
  const isFormValid = useMemo(() => {
    return (
      formState.blockModelFileId &&
      formState.drillHolesFileId &&
      formState.variable &&
      formState.outputVariable.trim()
    );
  }, [formState]);
  
  // Show message if no project selected
  if (!selectedProject) {
    return (
      <div className="space-y-4 p-2">
        <div className="flex items-center gap-2 text-muted-foreground text-xs">
          <AlertCircle className="h-4 w-4" />
          <span>Seleccione un proyecto primero</span>
        </div>
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      {/* Data Section */}
      <div>
        <h4 className="text-xs font-medium mb-3 text-muted-foreground">Data</h4>
        <div className="space-y-3">
          <div>
            <Label htmlFor="block-model" className="text-xs">Block Model</Label>
            <Select
              value={formState.blockModelFileId}
              onValueChange={handleBlockModelChange}
            >
              <SelectTrigger
                id="block-model"
                className="h-8 text-xs"
                aria-label="Select block model dataset"
              >
                <SelectValue placeholder="Seleccionar Block Model" />
              </SelectTrigger>
              <SelectContent>
                {blockModelDatasets.length === 0 ? (
                  <SelectItem value="_empty" disabled>
                    No hay modelos de bloques disponibles
                  </SelectItem>
                ) : (
                  blockModelDatasets.map((dataset: DatasetData) => (
                    <SelectItem key={dataset.id} value={dataset.id}>
                      {dataset.file_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="drill-holes" className="text-xs">Drill Holes</Label>
            <Select
              value={drillHolesDatasets.find((d: DatasetData) => d.file_id === formState.drillHolesFileId)?.id || ''}
              onValueChange={handleDrillHolesChange}
            >
              <SelectTrigger
                id="drill-holes"
                className="h-8 text-xs"
                aria-label="Select drill holes dataset"
              >
                <SelectValue placeholder="Seleccionar Drill Holes" />
              </SelectTrigger>
              <SelectContent>
                {drillHolesDatasets.length === 0 ? (
                  <SelectItem value="_empty" disabled>
                    No hay drill holes disponibles
                  </SelectItem>
                ) : (
                  drillHolesDatasets.map((dataset: DatasetData) => (
                    <SelectItem key={dataset.id} value={dataset.id}>
                      {dataset.file_name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="variable" className="text-xs">Variable</Label>
            <Select
              value={formState.variable}
              onValueChange={handleVariableChange}
              disabled={!formState.drillHolesFileId || loadingColumns}
            >
              <SelectTrigger
                id="variable"
                className="h-8 text-xs"
                aria-label="Seleccionar variable para estimar"
              >
                <SelectValue placeholder={loadingColumns ? 'Cargando...' : 'Seleccionar Variable'} />
              </SelectTrigger>
              <SelectContent>
                {drillHolesColumns.length === 0 ? (
                  <SelectItem value="_empty" disabled>
                    {loadingColumns ? 'Cargando columnas...' : 'No hay columnas numéricas disponibles'}
                  </SelectItem>
                ) : (
                  drillHolesColumns.map((column: string) => (
                    <SelectItem key={column} value={column}>
                      {column}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="output-variable" className="text-xs">Variable de salida</Label>
            <Input
              id="output-variable"
              type="text"
              placeholder="variable_est"
              value={formState.outputVariable}
              onChange={handleOutputVariableChange}
              className="h-8 text-xs"
              aria-label="Nombre de la variable de salida"
            />
          </div>
          
          <div>
            <Label htmlFor="power" className="text-xs">Potencia</Label>
            <Input
              id="power"
              type="number"
              value={formState.power}
              onChange={handlePowerChange}
              min={0.1}
              step={0.1}
              className="h-8 text-xs"
              aria-label="Parámetro de potencia de IDW"
            />
          </div>
          
          <div>
            <Label htmlFor="number-of-samples" className="text-xs">Número de muestras</Label>
            <Input
              id="number-of-samples"
              type="number"
              value={formState.numSamples}
              onChange={handleNumSamplesChange}
              min={1}
              step={1}
              className="h-8 text-xs"
              aria-label="Número de muestras más cercanas"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Result Section */}
      {result && result.success && (
        <>
          <div className="bg-muted/50 rounded-md p-3 space-y-2">
            <div className="flex items-center gap-2 text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              <span className="text-xs font-medium">Estimación Completada</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-muted-foreground">Salida:</span>
                <span className="ml-1 font-mono">{result.outputVariable}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Bloques:</span>
                <span className="ml-1">{result.blocksEstimated.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Muestras:</span>
                <span className="ml-1">{result.samplesUsed.toLocaleString()}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Media:</span>
                <span className="ml-1">{result.meanValue.toFixed(4)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Mínimo:</span>
                <span className="ml-1">{result.minValue.toFixed(4)}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Máximo:</span>
                <span className="ml-1">{result.maxValue.toFixed(4)}</span>
              </div>
            </div>
          </div>
          <Separator />
        </>
      )}

      {/* Action Buttons */}
      <div className="space-y-2 pt-2">
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={handleCalculateIdw}
          disabled={!isFormValid || isCalculating}
          aria-label="Calculate IDW estimation"
        >
          {isCalculating ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Calculando...
            </>
          ) : (
            <>
              <Calculator className="h-4 w-4 mr-2" />
              Calcular IDW
            </>
          )}
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleCancel}
          disabled={isCalculating}
          aria-label="Clear form"
        >
          <X className="h-4 w-4 mr-2" />
          Limpiar
        </Button>
      </div>
    </div>
  );
}
