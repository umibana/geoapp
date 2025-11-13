import React from 'react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Settings2, Grid3x3, GitMerge } from 'lucide-react';
import Estimaciones from '@/components/procesamiento/Estimaciones';
import CrearGrilla from '@/components/procesamiento/CrearGrilla';
import MergeDataset from '@/components/procesamiento/MergeDataset';

export default function Procesamiento() {
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
                  Estimaciones
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
      <div className="flex-1">
        {/* Content will go here */}
      </div>
    </div>
  );
}

