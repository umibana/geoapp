import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Settings2, Grid3x3, GitMerge, CheckCircle2, Calculator, Clock, Database, BarChart3 } from 'lucide-react';
import Estimaciones from '@/components/procesamiento/Estimaciones';
import CrearGrilla from '@/components/procesamiento/CrearGrilla';
import MergeDataset from '@/components/procesamiento/MergeDataset';
import { useProcessingStore, type IDWResultData } from '@/stores/processingStore';
import { Separator } from '@/components/ui/separator';

/**
 * Component to display IDW result details
 */
function IDWResultCard({ data }: { data: IDWResultData }) {
  const formattedTime = new Date(data.timestamp).toLocaleTimeString();
  const formattedDate = new Date(data.timestamp).toLocaleDateString();
  
  return (
    <div className="bg-card border rounded-lg p-6 shadow-sm max-w-2xl">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="h-10 w-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center">
          <CheckCircle2 className="h-5 w-5 text-green-600 dark:text-green-400" />
        </div>
        <div>
          <h3 className="text-lg font-semibold text-foreground">Estimación IDW Completada</h3>
          <p className="text-sm text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {formattedDate} a las {formattedTime}
          </p>
        </div>
      </div>
      
      <Separator className="mb-4" />
      
      {/* Input Data */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
          <Database className="h-4 w-4" />
          Datos de Entrada
        </h4>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="bg-muted/50 rounded-md p-3">
            <span className="text-muted-foreground block text-xs">Modelo de Bloques</span>
            <span className="font-medium">{data.blockModelName}</span>
          </div>
          <div className="bg-muted/50 rounded-md p-3">
            <span className="text-muted-foreground block text-xs">Drill Holes</span>
            <span className="font-medium">{data.drillHolesName}</span>
          </div>
          <div className="bg-muted/50 rounded-md p-3">
            <span className="text-muted-foreground block text-xs">Variable a Interpolar</span>
            <span className="font-medium font-mono">{data.variable}</span>
          </div>
          <div className="bg-muted/50 rounded-md p-3">
            <span className="text-muted-foreground block text-xs">Columna de Salida</span>
            <span className="font-medium font-mono text-green-600 dark:text-green-400">{data.outputVariable}</span>
          </div>
        </div>
      </div>
      
      {/* Parameters */}
      <div className="mb-4">
        <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
          <Calculator className="h-4 w-4" />
          Parámetros
        </h4>
        <div className="flex gap-4 text-sm">
          <div className="bg-muted/50 rounded-md px-3 py-2">
            <span className="text-muted-foreground text-xs">Potencia:</span>
            <span className="ml-1 font-medium">{data.power}</span>
          </div>
          <div className="bg-muted/50 rounded-md px-3 py-2">
            <span className="text-muted-foreground text-xs">Muestras:</span>
            <span className="ml-1 font-medium">{data.numSamples}</span>
          </div>
          <div className="bg-muted/50 rounded-md px-3 py-2">
            <span className="text-muted-foreground text-xs">Bloques Estimados:</span>
            <span className="ml-1 font-medium">{data.blocksEstimated.toLocaleString()}</span>
          </div>
          <div className="bg-muted/50 rounded-md px-3 py-2">
            <span className="text-muted-foreground text-xs">Muestras Usadas:</span>
            <span className="ml-1 font-medium">{data.samplesUsed.toLocaleString()}</span>
          </div>
        </div>
      </div>
      
      {/* Statistics */}
      <div>
        <h4 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
          <BarChart3 className="h-4 w-4" />
          Estadísticas de Resultado
        </h4>
        <div className="grid grid-cols-4 gap-3 text-sm">
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-md p-3 text-center">
            <span className="text-muted-foreground block text-xs mb-1">Min</span>
            <span className="font-semibold text-blue-600 dark:text-blue-400">{data.minValue.toFixed(4)}</span>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-md p-3 text-center">
            <span className="text-muted-foreground block text-xs mb-1">Mean</span>
            <span className="font-semibold text-green-600 dark:text-green-400">{data.meanValue.toFixed(4)}</span>
          </div>
          <div className="bg-orange-50 dark:bg-orange-900/20 rounded-md p-3 text-center">
            <span className="text-muted-foreground block text-xs mb-1">Max</span>
            <span className="font-semibold text-orange-600 dark:text-orange-400">{data.maxValue.toFixed(4)}</span>
          </div>
          <div className="bg-purple-50 dark:bg-purple-900/20 rounded-md p-3 text-center">
            <span className="text-muted-foreground block text-xs mb-1">Std Dev</span>
            <span className="font-semibold text-purple-600 dark:text-purple-400">{data.stdValue.toFixed(4)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Empty state when no processing has been done
 */
function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-8">
      <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mb-4">
        <Calculator className="h-8 w-8 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium text-foreground mb-2">No hay resultados de procesamiento</h3>
      <p className="text-sm text-muted-foreground max-w-md">
        Utiliza las herramientas en la barra lateral para ejecutar operaciones de procesamiento. 
        Los resultados aparecerán aquí cuando estén completos.
      </p>
    </div>
  );
}

export default function Procesamiento() {
  const latestResult = useProcessingStore((state) => state.latestResult);
  
  return (
    <div className="w-full h-screen flex">
      {/* Sidebar for processing tools */}
      <div className="w-64 border-r bg-background flex flex-col overflow-auto">
        <div className="p-4">
          <Accordion type="single" defaultValue="estimaciones" collapsible className="w-full">
            <AccordionItem value="estimaciones">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center">
                  <Settings2 className="h-4 w-4 mr-2" />
                  Estimaciones IDW
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <Estimaciones />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="crear-grilla">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center">
                  <Grid3x3 className="h-4 w-4 mr-2" />
                  Crear Grilla
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <CrearGrilla />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="merge-dataset">
              <AccordionTrigger className="text-sm font-medium">
                <div className="flex items-center">
                  <GitMerge className="h-4 w-4 mr-2" />
                  Merge Dataset
                </div>
              </AccordionTrigger>
              <AccordionContent>
                <MergeDataset />
              </AccordionContent>
            </AccordionItem>
          </Accordion>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex items-center justify-center bg-muted/30 overflow-auto p-6">
        {latestResult ? (
          latestResult.type === 'idw' ? (
            <IDWResultCard data={latestResult.data} />
          ) : (
            <EmptyState />
          )
        ) : (
          <EmptyState />
        )}
      </div>
    </div>
  );
}
