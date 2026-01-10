import React from 'react';
import { PerformanceComparison } from '@/components/PerformanceComparison';
import { ThreeWayComparison } from '@/components/ThreeWayComparison';
import { SingleFormatBenchmark } from '@/components/SingleFormatBenchmark';
import { DatabaseComparison } from '@/components/DatabaseComparison';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export default function PerformancePage() {
  return (
    <div className="p-6">
      <Tabs defaultValue="single" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="single">Benchmark Formato Unico</TabsTrigger>
          <TabsTrigger value="threeway">Comparacion Tres Vias</TabsTrigger>
          <TabsTrigger value="database">SQLite vs DuckDB</TabsTrigger>
          <TabsTrigger value="legacy">Pruebas Heredadas</TabsTrigger>
        </TabsList>

        <TabsContent value="single">
          <SingleFormatBenchmark />
        </TabsContent>

        <TabsContent value="threeway">
          <ThreeWayComparison />
        </TabsContent>

        <TabsContent value="database">
          <DatabaseComparison />
        </TabsContent>

        <TabsContent value="legacy">
          <PerformanceComparison />
        </TabsContent>
      </Tabs>
    </div>
  );
}