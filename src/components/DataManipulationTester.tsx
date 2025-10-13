import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import {
  Database,
  Search,
  Filter,
  Trash2,
  Plus,
  Copy,
  RefreshCw,
  CheckCircle,
  XCircle,
  Loader2,
  Merge,
  Edit,
  BarChart
} from 'lucide-react';

/**
 * DataManipulationTester Component
 * Comprehensive testing interface for all Phase 1-5 data manipulation features
 */
const DataManipulationTester: React.FC = () => {
  // Projects and datasets state
  const [projects, setProjects] = useState<any[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [datasets, setDatasets] = useState<any[]>([]);
  const [selectedDatasetId, setSelectedDatasetId] = useState<string>('');
  const [selectedDataset, setSelectedDataset] = useState<any>(null);
  const [files, setFiles] = useState<any[]>([]);
  const [selectedFileId, setSelectedFileId] = useState<string>('');
  const [fileStats, setFileStats] = useState<any>(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // Phase 1: File Operations
  const [newFileName, setNewFileName] = useState('');
  const [columnRenames, setColumnRenames] = useState<{old: string, new: string}[]>([{old: '', new: ''}]);

  // Phase 2: Data Manipulation
  const [replacements, setReplacements] = useState<{from: string, to: string}[]>([{from: '', to: ''}]);
  const [replaceColumns, setReplaceColumns] = useState<string[]>([]); // Array of selected column names
  const [searchQuery, setSearchQuery] = useState('');
  const [filterColumn, setFilterColumn] = useState('');
  const [filterOperation, setFilterOperation] = useState('=');
  const [filterValue, setFilterValue] = useState('');
  const [filterMode, setFilterMode] = useState<'add_column' | 'delete_rows' | 'new_file'>('add_column');
  const [newFilterColumnName, setNewFilterColumnName] = useState('');
  const [createNewFile, setCreateNewFile] = useState(false);
  const [newFilterFileName, setNewFilterFileName] = useState('');
  const [rowIndicesToDelete, setRowIndicesToDelete] = useState('');

  // Phase 3: Advanced Column Operations
  const [newColumns, setNewColumns] = useState<{name: string, values: string}[]>([{name: '', values: ''}]);
  const [columnsToDuplicate, setColumnsToDuplicate] = useState<string[]>([]);

  // Phase 5: Dataset Merging
  const [secondDatasetId, setSecondDatasetId] = useState('');
  const [mergeMode, setMergeMode] = useState<'BY_ROWS' | 'BY_COLUMNS'>('BY_ROWS');
  const [excludeColumnsFirst, setExcludeColumnsFirst] = useState('');
  const [excludeColumnsSecond, setExcludeColumnsSecond] = useState('');
  const [mergeOutputName, setMergeOutputName] = useState('');

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, []);

  // Load datasets when project changes
  useEffect(() => {
    if (selectedProjectId) {
      loadProjectDatasets();
      loadProjectFiles();
    }
  }, [selectedProjectId]);

  // Load dataset details when dataset changes
  useEffect(() => {
    if (selectedDatasetId) {
      const dataset = datasets.find(d => d.id === selectedDatasetId);
      setSelectedDataset(dataset);
    }
  }, [selectedDatasetId, datasets]);

  // Load file statistics when file changes
  useEffect(() => {
    if (selectedFileId) {
      loadFileStatistics();
    }
  }, [selectedFileId]);

  const loadProjects = async () => {
    try {
      console.log('Loading projects...');
      const response = await window.autoGrpc.getProjects({});
      console.log('Projects response:', response);
      const projectList = response.projects || [];
      console.log('Projects list:', projectList);
      setProjects(projectList);
    } catch (err) {
      console.error('Error loading projects:', err);
      setError('Failed to load projects: ' + (err as Error).message);
    }
  };

  const loadProjectDatasets = async () => {
    try {
      const response = await window.autoGrpc.getProjectDatasets({ project_id: selectedProjectId });
      setDatasets(response.datasets || []);
    } catch (err) {
      console.error('Error loading datasets:', err);
    }
  };

  const loadProjectFiles = async () => {
    try {
      const response = await window.autoGrpc.getProjectFiles({ project_id: selectedProjectId });
      setFiles(response.files || []);
    } catch (err) {
      console.error('Error loading files:', err);
    }
  };

  const loadFileStatistics = async () => {
    try {
      setLoading(true);
      console.log('📊 [FRONTEND] Loading file statistics for file_id:', selectedFileId);

      const response = await window.autoGrpc.getFileStatistics({
        file_id: selectedFileId,
        columns: [] // Get all columns
      });

      console.log('📊 [FRONTEND] Received statistics response:', response);

      // Extract column names from statistics for use in column selection UI
      const columns = response.statistics?.map((stat: any) => stat.column_name) || [];
      console.log('📊 [FRONTEND] Extracted column names:', columns);

      const enhancedStats = { ...response, columns };

      setFileStats(enhancedStats);
      setResult({ type: 'statistics', data: enhancedStats });

      console.log('📊 [FRONTEND] Updated fileStats state with columns:', columns);
    } catch (err: any) {
      console.error('❌ [FRONTEND] Error loading file statistics:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Phase 1: Update File
  const handleUpdateFile = async () => {
    if (!selectedFileId || !newFileName) {
      setError('Please select a file and enter a new name');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await window.autoGrpc.updateFile({
        file_id: selectedFileId,
        name: newFileName
      });
      setResult({ type: 'update', data: response });
      if (response.success) {
        loadProjectFiles();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Phase 1: Rename File Columns
  const handleRenameColumns = async () => {
    if (!selectedFileId) {
      setError('Please select a file');
      return;
    }

    const renames = columnRenames.filter(r => r.old && r.new);
    if (renames.length === 0) {
      setError('Please provide at least one column rename mapping');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const renameMap: Record<string, string> = {};
      renames.forEach(r => renameMap[r.old] = r.new);

      console.log('🔄 [FRONTEND] Renaming columns:', renameMap, 'for file_id:', selectedFileId);

      const response = await window.autoGrpc.renameFileColumn({
        file_id: selectedFileId,
        column_renames: renameMap
      });

      console.log('🔄 [FRONTEND] Rename response:', response);
      setResult({ type: 'rename', data: response });

      // Refresh file statistics to show updated column names
      if (response.success) {
        console.log('✅ [FRONTEND] Rename successful, refreshing file statistics...');
        await loadFileStatistics();
        console.log('✅ [FRONTEND] File statistics refreshed');
        // Clear the rename inputs after successful rename
        setColumnRenames([{old: '', new: ''}]);
      } else {
        console.error('❌ [FRONTEND] Rename failed:', response.error_message);
      }
    } catch (err: any) {
      console.error('❌ [FRONTEND] Error renaming columns:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Phase 2: Replace File Data
  const handleReplaceData = async () => {
    if (!selectedFileId) {
      setError('Please select a file');
      return;
    }

    const validReplacements = replacements.filter(r => r.from);
    if (validReplacements.length === 0) {
      setError('Please provide at least one replacement');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      const response = await window.autoGrpc.replaceFileData({
        file_id: selectedFileId,
        replacements: validReplacements.map(r => ({ from_value: r.from, to_value: r.to })),
        columns: replaceColumns // Already an array
      });
      setResult({ type: 'replace', data: response });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Phase 2: Search File Data
  const handleSearchData = async () => {
    if (!selectedFileId) {
      setError('Please select a file');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await window.autoGrpc.searchFileData({
        file_id: selectedFileId,
        query: searchQuery,
        limit: 100,
        offset: 0
      });
      setResult({ type: 'search', data: response });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Phase 2: Filter File Data
  const handleFilterData = async () => {
    if (!selectedFileId || !filterColumn || !filterValue) {
      setError('Please select a file, column, and value');
      return;
    }

    if (filterMode === 'add_column' && !newFilterColumnName) {
      setError('Please enter a name for the new filtered column');
      return;
    }

    if (filterMode === 'new_file' && !newFilterFileName) {
      setError('Please enter a name for the new file');
      return;
    }

    try {
      setLoading(true);
      setError(null);

      if (filterMode === 'add_column') {
        // Add a new column with filtered values (NULL for non-matching rows)
        console.log('🔍 [FRONTEND] Creating filtered column:', newFilterColumnName);

        const response = await window.autoGrpc.addFilteredColumn({
          file_id: selectedFileId,
          new_column_name: newFilterColumnName,
          source_column: filterColumn,
          operation: filterOperation,
          value: filterValue
        });

        console.log('🔍 [FRONTEND] Add filtered column response:', response);
        setResult({ type: 'filter', data: response });

        if (response.success) {
          await loadFileStatistics();
          console.log(`✅ [FRONTEND] Filtered column added: ${response.rows_with_values} matches, ${response.rows_with_null} NULL`);
        }

      } else if (filterMode === 'delete_rows') {
        // Delete rows that don't match (destructive)
        const response = await window.autoGrpc.filterFileData({
          file_id: selectedFileId,
          column: filterColumn,
          operation: filterOperation,
          value: filterValue,
          create_new_file: false,
          new_file_name: ''
        });
        setResult({ type: 'filter', data: response });

        // Refresh file statistics after deletion
        if (response.success) {
          await loadFileStatistics();
        }

      } else if (filterMode === 'new_file') {
        // Create new file with filtered data
        const response = await window.autoGrpc.filterFileData({
          file_id: selectedFileId,
          column: filterColumn,
          operation: filterOperation,
          value: filterValue,
          create_new_file: true,
          new_file_name: newFilterFileName
        });
        setResult({ type: 'filter', data: response });

        if (response.success) {
          loadProjectFiles();
        }
      }

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Phase 2: Delete File Points
  const handleDeletePoints = async () => {
    if (!selectedFileId || !rowIndicesToDelete) {
      setError('Please select a file and enter row indices');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const indices = rowIndicesToDelete.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));
      const response = await window.autoGrpc.deleteFilePoints({
        file_id: selectedFileId,
        row_indices: indices
      });
      setResult({ type: 'delete', data: response });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Phase 3: Add File Columns
  const handleAddColumns = async () => {
    if (!selectedFileId) {
      setError('Please select a file');
      return;
    }

    const validColumns = newColumns.filter(c => c.name && c.values);
    if (validColumns.length === 0) {
      setError('Please provide at least one column with name and values');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await window.autoGrpc.addFileColumns({
        file_id: selectedFileId,
        new_columns: validColumns.map(c => ({
          column_name: c.name,
          values: c.values.split(',').map(v => v.trim())
        }))
      });
      setResult({ type: 'addColumns', data: response });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Phase 3: Duplicate File Columns
  const handleDuplicateColumns = async () => {
    if (!selectedFileId || columnsToDuplicate.length === 0) {
      setError('Please select a file and columns to duplicate');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await window.autoGrpc.duplicateFileColumns({
        file_id: selectedFileId,
        column_names: columnsToDuplicate
      });
      setResult({ type: 'duplicate', data: response });
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Phase 5: Merge Datasets
  const handleMergeDatasets = async () => {
    if (!selectedDatasetId || !secondDatasetId) {
      setError('Please select two datasets to merge');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await window.autoGrpc.mergeDatasets({
        first_dataset_id: selectedDatasetId,
        second_dataset_id: secondDatasetId,
        mode: mergeMode === 'BY_ROWS' ? 1 : 2, // MERGE_MODE enum
        exclude_columns_first: excludeColumnsFirst ? excludeColumnsFirst.split(',').map(s => s.trim()) : [],
        exclude_columns_second: excludeColumnsSecond ? excludeColumnsSecond.split(',').map(s => s.trim()) : [],
        output_file: mergeOutputName
      });
      setResult({ type: 'merge', data: response });
      if (response.success) {
        loadProjectDatasets();
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const getAvailableColumns = () => {
    // Get columns from file statistics if available (works for file operations)
    if (fileStats && (fileStats as any).columns) {
      const columns = (fileStats as any).columns;
      console.log('🔍 [FRONTEND] getAvailableColumns() returning from fileStats:', columns);
      return columns;
    }
    // Fallback to dataset column mappings (for dataset-specific operations)
    if (selectedDataset?.column_mappings) {
      const columns = selectedDataset.column_mappings.map((m: any) => m.column_name);
      console.log('🔍 [FRONTEND] getAvailableColumns() returning from dataset:', columns);
      return columns;
    }
    console.log('🔍 [FRONTEND] getAvailableColumns() returning empty array');
    return [];
  };

  return (
    <div className="flex flex-col h-full p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Data Manipulation Tester</h2>
          <p className="text-muted-foreground">Test all Phase 1-5 features</p>
        </div>
        <Badge variant="outline" className="px-3 py-1">
          <Database className="mr-2 h-4 w-4" />
          10 Features Available
        </Badge>
      </div>

      {/* Project and Dataset Selection */}
      <Card>
        <CardHeader>
          <CardTitle>Select Data Source</CardTitle>
          <CardDescription>Choose a project, file, or dataset to work with</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Project</Label>
              <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select project" />
                </SelectTrigger>
                <SelectContent className="z-[99999]">
                  {projects.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No projects found. Create one first.
                    </div>
                  ) : (
                    projects.map(p => (
                      <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>File (for file operations)</Label>
              <Select value={selectedFileId} onValueChange={setSelectedFileId} disabled={!selectedProjectId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select file" />
                </SelectTrigger>
                <SelectContent className="z-[99999]">
                  {files.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No files found
                    </div>
                  ) : (
                    files.map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>Dataset (for merging)</Label>
              <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId} disabled={!selectedProjectId}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select dataset" />
                </SelectTrigger>
                <SelectContent className="z-[99999]">
                  {datasets.length === 0 ? (
                    <div className="px-2 py-1.5 text-sm text-muted-foreground">
                      No datasets found
                    </div>
                  ) : (
                    datasets.map(d => (
                      <SelectItem key={d.id} value={d.id}>{d.file_name}</SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs for different feature categories */}
      <Tabs defaultValue="phase1" className="flex-1">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="phase1">Phase 1: File Ops</TabsTrigger>
          <TabsTrigger value="phase2">Phase 2: Data Manip</TabsTrigger>
          <TabsTrigger value="phase3">Phase 3: Columns</TabsTrigger>
          <TabsTrigger value="phase5">Phase 5: Merge</TabsTrigger>
        </TabsList>

        {/* Phase 1: File Operations */}
        <TabsContent value="phase1" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Edit className="mr-2 h-5 w-5" />
                Update File Name
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>New File Name</Label>
                <Input
                  value={newFileName}
                  onChange={(e) => setNewFileName(e.target.value)}
                  placeholder="Enter new file name"
                />
              </div>
              <Button onClick={handleUpdateFile} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Edit className="mr-2 h-4 w-4" />}
                Update File
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <RefreshCw className="mr-2 h-5 w-5" />
                Rename Columns
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {columnRenames.map((rename, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-xs text-muted-foreground">Select column to rename</Label>
                    <Select
                      value={rename.old}
                      onValueChange={(value) => {
                        const updated = [...columnRenames];
                        updated[idx].old = value;
                        setColumnRenames(updated);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select column" />
                      </SelectTrigger>
                      <SelectContent className="z-[99999]">
                        {getAvailableColumns().length === 0 ? (
                          <div className="px-2 py-1.5 text-sm text-muted-foreground">
                            Select a file first
                          </div>
                        ) : (
                          getAvailableColumns().map((col: string) => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">New column name</Label>
                    <Input
                      placeholder="New column name"
                      value={rename.new}
                      onChange={(e) => {
                        const updated = [...columnRenames];
                        updated[idx].new = e.target.value;
                        setColumnRenames(updated);
                      }}
                    />
                  </div>
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setColumnRenames([...columnRenames, {old: '', new: ''}])}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button onClick={handleRenameColumns} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Rename Columns
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <BarChart className="mr-2 h-5 w-5" />
                File Statistics
              </CardTitle>
            </CardHeader>
            <CardContent>
              <Button onClick={loadFileStatistics} disabled={loading || !selectedFileId}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BarChart className="mr-2 h-4 w-4" />}
                Load Statistics
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Phase 2: Data Manipulation */}
        <TabsContent value="phase2" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <RefreshCw className="mr-2 h-5 w-5" />
                Replace Data Values
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {replacements.map((repl, idx) => (
                <div key={idx} className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder="From value"
                    value={repl.from}
                    onChange={(e) => {
                      const updated = [...replacements];
                      updated[idx].from = e.target.value;
                      setReplacements(updated);
                    }}
                  />
                  <Input
                    placeholder="To value"
                    value={repl.to}
                    onChange={(e) => {
                      const updated = [...replacements];
                      updated[idx].to = e.target.value;
                      setReplacements(updated);
                    }}
                  />
                </div>
              ))}
              <div>
                <Label>Target Columns (optional - leave empty for all columns)</Label>
                <div className="flex flex-wrap gap-2 mt-2 p-3 border rounded-md min-h-[60px]">
                  {getAvailableColumns().length === 0 ? (
                    <p className="text-sm text-muted-foreground">Select a dataset to see available columns</p>
                  ) : (
                    getAvailableColumns().map((col: string) => (
                      <Badge
                        key={col}
                        variant={replaceColumns.includes(col) ? "default" : "outline"}
                        className="cursor-pointer"
                        onClick={() => {
                          if (replaceColumns.includes(col)) {
                            setReplaceColumns(replaceColumns.filter(c => c !== col));
                          } else {
                            setReplaceColumns([...replaceColumns, col]);
                          }
                        }}
                      >
                        {col}
                      </Badge>
                    ))
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {replaceColumns.length === 0
                    ? "No columns selected - will apply to ALL columns"
                    : `Selected ${replaceColumns.length} column(s): ${replaceColumns.join(', ')}`}
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setReplacements([...replacements, {from: '', to: ''}])}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button onClick={handleReplaceData} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Replace Data
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Search className="mr-2 h-5 w-5" />
                Search File Data
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>SQL WHERE clause (without WHERE)</Label>
                <Input
                  placeholder='e.g., column_name > 100 AND other_col = "value"'
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              <Button onClick={handleSearchData} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
                Search
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Filter className="mr-2 h-5 w-5" />
                Filter File Data
              </CardTitle>
              <p className="text-sm text-muted-foreground mt-2">
                Filter rows based on a condition. Choose how to handle the results:
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>Column</Label>
                  <Select value={filterColumn} onValueChange={setFilterColumn}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select column" />
                    </SelectTrigger>
                    <SelectContent className="z-[99999]">
                      {getAvailableColumns().length === 0 ? (
                        <div className="px-2 py-1.5 text-sm text-muted-foreground">
                          Select a file first
                        </div>
                      ) : (
                        getAvailableColumns().map((col: string) => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Operation</Label>
                  <Select value={filterOperation} onValueChange={setFilterOperation}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="z-[99999]">
                      <SelectItem value="=">=</SelectItem>
                      <SelectItem value="!=">!=</SelectItem>
                      <SelectItem value=">">&gt;</SelectItem>
                      <SelectItem value="<">&lt;</SelectItem>
                      <SelectItem value=">=">&gt;=</SelectItem>
                      <SelectItem value="<=">&lt;=</SelectItem>
                      <SelectItem value="LIKE">LIKE (text contains)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Value</Label>
                  <Input
                    value={filterValue}
                    onChange={(e) => setFilterValue(e.target.value)}
                    placeholder="Filter value"
                  />
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <Label className="text-base">Filter Mode:</Label>

                <label className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                  <input
                    type="radio"
                    name="filterMode"
                    value="add_column"
                    checked={filterMode === 'add_column'}
                    onChange={(e) => setFilterMode(e.target.value as any)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">✅ Add filtered column (Safe - Recommended)</div>
                    <div className="text-xs text-muted-foreground">
                      Creates a new column with matching values, NULL for non-matching rows. Original data preserved.
                    </div>
                    {filterMode === 'add_column' && (
                      <Input
                        value={newFilterColumnName}
                        onChange={(e) => setNewFilterColumnName(e.target.value)}
                        placeholder="New column name (e.g., 'Year_2023')"
                        className="mt-2"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                  <input
                    type="radio"
                    name="filterMode"
                    value="new_file"
                    checked={filterMode === 'new_file'}
                    onChange={(e) => setFilterMode(e.target.value as any)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm">📄 Create new file (Safe)</div>
                    <div className="text-xs text-muted-foreground">
                      Creates a new file with only matching rows. Original file unchanged.
                    </div>
                    {filterMode === 'new_file' && (
                      <Input
                        value={newFilterFileName}
                        onChange={(e) => setNewFilterFileName(e.target.value)}
                        placeholder="New file name"
                        className="mt-2"
                        onClick={(e) => e.stopPropagation()}
                      />
                    )}
                  </div>
                </label>

                <label className="flex items-start gap-3 p-3 border border-destructive/50 rounded-lg hover:bg-destructive/5 cursor-pointer">
                  <input
                    type="radio"
                    name="filterMode"
                    value="delete_rows"
                    checked={filterMode === 'delete_rows'}
                    onChange={(e) => setFilterMode(e.target.value as any)}
                    className="mt-1"
                  />
                  <div className="flex-1">
                    <div className="font-medium text-sm text-destructive">⚠️ Delete non-matching rows (Destructive)</div>
                    <div className="text-xs text-muted-foreground">
                      Permanently deletes all rows that don't match. Cannot be undone!
                    </div>
                  </div>
                </label>
              </div>

              <Button onClick={handleFilterData} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}
                Filter Data
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Trash2 className="mr-2 h-5 w-5" />
                Delete Rows
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Row Indices (comma-separated, 0-based)</Label>
                <Input
                  value={rowIndicesToDelete}
                  onChange={(e) => setRowIndicesToDelete(e.target.value)}
                  placeholder="e.g., 0,5,10,15"
                />
              </div>
              <Button onClick={handleDeletePoints} disabled={loading} variant="destructive">
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                Delete Rows
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Phase 3: Column Operations */}
        <TabsContent value="phase3" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Plus className="mr-2 h-5 w-5" />
                Add New Columns
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {newColumns.map((col, idx) => (
                <div key={idx} className="space-y-2">
                  <Input
                    placeholder="Column name"
                    value={col.name}
                    onChange={(e) => {
                      const updated = [...newColumns];
                      updated[idx].name = e.target.value;
                      setNewColumns(updated);
                    }}
                  />
                  <Input
                    placeholder="Values (comma-separated, must match row count)"
                    value={col.values}
                    onChange={(e) => {
                      const updated = [...newColumns];
                      updated[idx].values = e.target.value;
                      setNewColumns(updated);
                    }}
                  />
                  <Separator />
                </div>
              ))}
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setNewColumns([...newColumns, {name: '', values: ''}])}
                >
                  <Plus className="h-4 w-4" />
                </Button>
                <Button onClick={handleAddColumns} disabled={loading}>
                  {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
                  Add Columns
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Copy className="mr-2 h-5 w-5" />
                Duplicate Columns
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Select Columns to Duplicate</Label>
                <div className="flex flex-wrap gap-2 mt-2">
                  {getAvailableColumns().map((col: string) => (
                    <Badge
                      key={col}
                      variant={columnsToDuplicate.includes(col) ? "default" : "outline"}
                      className="cursor-pointer"
                      onClick={() => {
                        if (columnsToDuplicate.includes(col)) {
                          setColumnsToDuplicate(columnsToDuplicate.filter(c => c !== col));
                        } else {
                          setColumnsToDuplicate([...columnsToDuplicate, col]);
                        }
                      }}
                    >
                      {col}
                    </Badge>
                  ))}
                </div>
              </div>
              <Button onClick={handleDuplicateColumns} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                Duplicate Selected
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Phase 5: Dataset Merging */}
        <TabsContent value="phase5" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Merge className="mr-2 h-5 w-5" />
                Merge Datasets
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>First Dataset</Label>
                  <Select value={selectedDatasetId} onValueChange={setSelectedDatasetId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select first dataset" />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.file_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Second Dataset</Label>
                  <Select value={secondDatasetId} onValueChange={setSecondDatasetId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select second dataset" />
                    </SelectTrigger>
                    <SelectContent>
                      {datasets.map(d => (
                        <SelectItem key={d.id} value={d.id}>{d.file_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div>
                <Label>Merge Mode</Label>
                <Select value={mergeMode} onValueChange={(v) => setMergeMode(v as any)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BY_ROWS">BY_ROWS (append rows)</SelectItem>
                    <SelectItem value="BY_COLUMNS">BY_COLUMNS (add columns)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {mergeMode === 'BY_COLUMNS' && (
                <>
                  <div>
                    <Label>Exclude Columns from First (comma-separated)</Label>
                    <Input
                      value={excludeColumnsFirst}
                      onChange={(e) => setExcludeColumnsFirst(e.target.value)}
                      placeholder="col1,col2,col3"
                    />
                  </div>
                  <div>
                    <Label>Exclude Columns from Second (comma-separated)</Label>
                    <Input
                      value={excludeColumnsSecond}
                      onChange={(e) => setExcludeColumnsSecond(e.target.value)}
                      placeholder="col1,col2,col3"
                    />
                  </div>
                </>
              )}

              <div>
                <Label>Output File Name (optional)</Label>
                <Input
                  value={mergeOutputName}
                  onChange={(e) => setMergeOutputName(e.target.value)}
                  placeholder="merged_dataset"
                />
              </div>

              <Button onClick={handleMergeDatasets} disabled={loading}>
                {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Merge className="mr-2 h-4 w-4" />}
                Merge Datasets
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Results Display */}
      {error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <CheckCircle className="mr-2 h-5 w-5 text-green-600" />
              Operation Result
            </CardTitle>
          </CardHeader>
          <CardContent>
            <pre className="bg-gray-100 p-4 rounded-lg overflow-auto max-h-96">
              {JSON.stringify(result, null, 2)}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DataManipulationTester;
