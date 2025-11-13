import React from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { X, Calculator } from 'lucide-react';
import { Separator } from '@/components/ui/separator';

export default function Estimaciones() {
  return (
    <div className="space-y-4">
      {/* Data Section */}
      <div>
        <h4 className="text-xs font-medium mb-3 text-muted-foreground">Data</h4>
        <div className="space-y-3">
          <div>
            <Label htmlFor="block-model" className="text-xs">Block Model</Label>
            <Select value="" onValueChange={() => {}}>
              <SelectTrigger id="block-model" className="h-8 text-xs">
                <SelectValue placeholder="Seleccionar Block Model" />
              </SelectTrigger>
              <SelectContent>
                {/* Options will be populated here */}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="drill-holes" className="text-xs">Drill Holes</Label>
            <Select value="" onValueChange={() => {}}>
              <SelectTrigger id="drill-holes" className="h-8 text-xs">
                <SelectValue placeholder="Seleccionar Drill Holes" />
              </SelectTrigger>
              <SelectContent>
                {/* Options will be populated here */}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="variable" className="text-xs">Variable</Label>
            <Select value="" onValueChange={() => {}}>
              <SelectTrigger id="variable" className="h-8 text-xs">
                <SelectValue placeholder="Seleccionar Variable" />
              </SelectTrigger>
              <SelectContent>
                {/* Options will be populated here */}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="output-variable" className="text-xs">Output variable</Label>
            <Input
              id="output-variable"
              type="text"
              placeholder="x_est"
              className="h-8 text-xs"
            />
          </div>
          
          <div>
            <Label htmlFor="power" className="text-xs">Power</Label>
            <Input
              id="power"
              type="number"
              defaultValue="2"
              min="1"
              step="0.1"
              className="h-8 text-xs"
            />
          </div>
          
          <div>
            <Label htmlFor="number-of-samples" className="text-xs">Number of samples</Label>
            <Input
              id="number-of-samples"
              type="number"
              defaultValue="5"
              min="1"
              step="1"
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>

      <Separator />

      {/* Action Buttons */}
      <div className="space-y-2 pt-2">
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => {}}
        >
          <Calculator className="h-4 w-4 mr-2" />
          Calculate IDW
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {}}
        >
          <X className="h-4 w-4 mr-2" />
          Cancel
        </Button>
      </div>
    </div>
  );
}

