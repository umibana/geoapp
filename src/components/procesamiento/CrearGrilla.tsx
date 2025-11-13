import React, { useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Settings } from 'lucide-react';

export default function CrearGrilla() {
  const [gridSource, setGridSource] = useState<'dataset' | 'solid'>('dataset');

  return (
    <div className="space-y-4">
      {/* Grid Source Section */}
      <div>
        <h4 className="text-xs font-medium mb-3 text-muted-foreground">Grid Source</h4>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={gridSource === 'dataset' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setGridSource('dataset')}
          >
            Dataset/BoundingBox
          </Button>
          {/* <Button
            type="button"
            variant={gridSource === 'solid' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setGridSource('solid')}
          >
            Solid Body
          </Button> */}
        </div>
      </div>

      {/* Dataset Section */}
      <div>
        <h4 className="text-xs font-medium mb-3 text-muted-foreground">Dataset</h4>
        <div className="space-y-3">
          <div>
            <Label htmlFor="base-dataset" className="text-xs">Base dataset</Label>
            <Select value="" onValueChange={() => {}}>
              <SelectTrigger id="base-dataset" className="h-8 text-xs">
                <SelectValue placeholder="Empty" />
              </SelectTrigger>
              <SelectContent>
                {/* Options will be populated here */}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="output-dataset" className="text-xs">Output dataset</Label>
            <Input
              id="output-dataset"
              type="text"
              defaultValue="Grid"
              className="h-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Grid parameters Section */}
      <div>
        <h4 className="text-xs font-medium mb-3 text-muted-foreground">Grid parameters</h4>
        <div className="space-y-3">
          {/* Column Headers */}
          <div className="grid grid-cols-3 gap-2 text-xs text-muted-foreground font-medium">
            <div>East (x)</div>
            <div>North (y)</div>
            <div>Elevation (z)</div>
          </div>

          {/* Origin Row */}
          <div>
            <Label className="text-xs mb-2 block">Origin</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                defaultValue="0.00"
                step="0.01"
                className="h-8 text-xs"
              />
              <Input
                type="number"
                defaultValue="0.00"
                step="0.01"
                className="h-8 text-xs"
              />
              <Input
                type="number"
                defaultValue="0.00"
                step="0.01"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Blocks Row */}
          <div>
            <Label className="text-xs mb-2 block">Blocks</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                defaultValue="1"
                min="1"
                step="1"
                className="h-8 text-xs"
              />
              <Input
                type="number"
                defaultValue="1"
                min="1"
                step="1"
                className="h-8 text-xs"
              />
              <Input
                type="number"
                defaultValue="1"
                min="1"
                step="1"
                className="h-8 text-xs"
              />
            </div>
          </div>

          {/* Block size Row */}
          <div>
            <Label className="text-xs mb-2 block">Block size</Label>
            <div className="grid grid-cols-3 gap-2">
              <Input
                type="number"
                defaultValue="1.00"
                step="0.01"
                className="h-8 text-xs"
              />
              <Input
                type="number"
                defaultValue="1.00"
                step="0.01"
                className="h-8 text-xs"
              />
              <Input
                type="number"
                defaultValue="1.00"
                step="0.01"
                className="h-8 text-xs"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Generate grid Button */}
      <div className="pt-2">
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => {}}
        >
          <Settings className="h-4 w-4 mr-2" />
          Generate grid
        </Button>
      </div>
    </div>
  );
}

