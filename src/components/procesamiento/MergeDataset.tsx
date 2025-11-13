import React, { useState } from 'react';
import { Select, SelectContent, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Search, ArrowRight, Grid3x3, Settings } from 'lucide-react';

export default function MergeDataset() {
  const [mergeOption, setMergeOption] = useState<'columns' | 'rows'>('columns');
  const [firstNotAllDataset, setFirstNotAllDataset] = useState(false);
  const [secondNotAllDataset, setSecondNotAllDataset] = useState(false);

  return (
    <div className="space-y-4">
      {/* Merge Option Section */}
      <div>
        <h4 className="text-xs font-medium mb-3 text-muted-foreground">Merge option</h4>
        <div className="flex gap-2">
          <Button
            type="button"
            variant={mergeOption === 'columns' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setMergeOption('columns')}
          >
            By columns
          </Button>
          <Button
            type="button"
            variant={mergeOption === 'rows' ? 'default' : 'outline'}
            size="sm"
            className="flex-1 text-xs"
            onClick={() => setMergeOption('rows')}
          >
            By rows
          </Button>
        </div>
      </div>

      {/* First Dataset Section */}
      <div>
        <h4 className="text-xs font-medium mb-3 text-muted-foreground">First dataset</h4>
        <div className="space-y-3">
          <div>
            <Select value="" onValueChange={() => {}}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="results_modified.csv" />
              </SelectTrigger>
              <SelectContent>
                {/* Options will be populated here */}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <h5 className="text-xs font-medium mb-2 text-muted-foreground">Settings</h5>
            <div className="flex items-center gap-2">
              <Checkbox
                id="first-not-all"
                checked={firstNotAllDataset}
                onCheckedChange={(checked) => setFirstNotAllDataset(checked === true)}
              />
              <Label htmlFor="first-not-all" className="text-xs cursor-pointer">
                Not all dataset
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto text-xs"
                onClick={() => {}}
              >
                <Search className="h-3 w-3 mr-1" />
                Select Variables
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Second Dataset Section */}
      <div>
        <h4 className="text-xs font-medium mb-3 text-muted-foreground">Second dataset</h4>
        <div className="space-y-3">
          <div>
            <Select value="" onValueChange={() => {}}>
              <SelectTrigger className="h-8 text-xs">
                <SelectValue placeholder="results_modified.csv" />
              </SelectTrigger>
              <SelectContent>
                {/* Options will be populated here */}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <h5 className="text-xs font-medium mb-2 text-muted-foreground">Settings</h5>
            <div className="flex items-center gap-2">
              <Checkbox
                id="second-not-all"
                checked={secondNotAllDataset}
                onCheckedChange={(checked) => setSecondNotAllDataset(checked === true)}
              />
              <Label htmlFor="second-not-all" className="text-xs cursor-pointer">
                Not all dataset
              </Label>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto text-xs"
                onClick={() => {}}
              >
                <Search className="h-3 w-3 mr-1" />
                Select Variables
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Output Dataset Section */}
      <div>
        <h4 className="text-xs font-medium mb-3 text-muted-foreground">Output dataset</h4>
        <Input
          type="text"
          defaultValue="_Merged"
          className="h-8 text-xs"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col gap-2 pt-2">
        <Button
          variant="default"
          size="sm"
          className="w-full"
          onClick={() => {}}
        >
          <ArrowRight className="h-4 w-4 mr-2" />
          Merge
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {}}
        >
          <Grid3x3 className="h-4 w-4 mr-2" />
          Preview
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={() => {}}
        >
          <Settings className="h-4 w-4 mr-2" />
          Load
        </Button>
      </div>
    </div>
  );
}

