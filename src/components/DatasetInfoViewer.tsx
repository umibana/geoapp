import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Database, Info, Grid3x3, Calendar, Settings, Edit2, Copy, Trash2, RefreshCw, Filter, Plus, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
import { useBrushStore } from '@/stores/brushStore';
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  ColumnDef,
  PaginationState,
} from '@tanstack/react-table';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';

/**
 * DatasetInfoViewer Component
 * Displays metadata and preview of the selected dataset
 * Shows dataset info, column list, and preview of first 10 rows
 * Uses TanStack Table with virtualization for performance
 */

interface DataRow {
  rowNumber: number;
  [key: string]: number;
}

interface EditingCell {
  rowIndex: number;
  columnId: string;
  value: string;
}

interface ContextMenuState {
  show: boolean;
  x: number;
  y: number;
  type: 'header' | 'cell' | 'row' | null;
  target: {
    columnId?: string;
    rowIndex?: number;
    value?: string;
  };
}

const ROWS_PER_PAGE = 1000;

const DatasetInfoViewer: React.FC = () => {
  const selectedDataset = useBrushStore((state) => state.selectedDataset);
  const [previewData, setPreviewData] = useState<DataRow[]>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: ROWS_PER_PAGE,
  });
  const tableContainerRef = React.useRef<HTMLDivElement>(null);
  const lastFetchedDatasetRef = React.useRef<string | null>(null);
  
  // Inline editing state
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    show: false,
    x: 0,
    y: 0,
    type: null,
    target: {}
  });
  
  // Advanced operations dialog state
  const [advancedDialogOpen, setAdvancedDialogOpen] = useState(false);
  
  // Operation-specific states
  const [operationLoading, setOperationLoading] = useState(false);
  const [replacements, setReplacements] = useState<{from: string, to: string}[]>([{from: '', to: ''}]);
  const [replaceColumns, setReplaceColumns] = useState<string[]>([]);
  const [filterColumn, setFilterColumn] = useState('');
  const [filterOperation, setFilterOperation] = useState('=');
  const [filterValue, setFilterValue] = useState('');
  const [filterMode, setFilterMode] = useState<'add_column' | 'delete_rows' | 'new_file'>('add_column');
  const [newFilterColumnName, setNewFilterColumnName] = useState('');
  const [newFilterFileName, setNewFilterFileName] = useState('');
  const [columnsToDuplicate, setColumnsToDuplicate] = useState<{sourceColumn: string, newName: string}[]>([]);
  const [rowIndicesToDelete, setRowIndicesToDelete] = useState('');
  
  // Column header editing state
  const [editingColumnHeader, setEditingColumnHeader] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState('');
  
  // Row selection for deletion
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());

  // Helper function to refresh data
  const refreshData = async () => {
    if (!selectedDataset) return;

    try {
      setLoading(true);
      setError(null);

      const offset = pagination.pageIndex * pagination.pageSize;

      const response = await window.autoGrpc.getDatasetTableData({
        dataset_id: selectedDataset.id,
        limit: pagination.pageSize,
        offset: offset,
        columns: []
      });
      console.log(response);

      if (response.success && response.rows) {
        setPreviewColumns(response.column_names);
        setTotalRows(response.total_rows);

        const rows: DataRow[] = response.rows.map((row: { values: Record<string, number> }, index: number) => {
          const dataRow: DataRow = { rowNumber: offset + index + 1 };
          for (const [colName, value] of Object.entries(row.values)) {
            dataRow[colName] = value as number;
          }
          return dataRow;
        });

        setPreviewData(rows);
      } else {
        setError(response.error_message || 'Error al cargar datos');
      }
    } catch {
      setError('Error al refrescar los datos');
    } finally {
      setLoading(false);
    }
  };

  // Show success message temporarily
  const showSuccess = (message: string) => {
    setSuccess(message);
    setTimeout(() => setSuccess(null), 3000);
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, type: 'header' | 'cell' | 'row', target: Record<string, unknown>) => {
    e.preventDefault();
    setContextMenu({
      show: true,
      x: e.clientX,
      y: e.clientY,
      type,
      target
    });
  };

  const closeContextMenu = () => {
    setContextMenu({ show: false, x: 0, y: 0, type: null, target: {} });
  };

  // Click outside to close context menu
  useEffect(() => {
    const handleClick = () => closeContextMenu();
    if (contextMenu.show) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu.show]);

  // Inline editing handlers
  const handleCellDoubleClick = (rowIndex: number, columnId: string, value: unknown) => {
    if (columnId === 'rowNumber') return; // Don't edit row numbers
    setEditingCell({
      rowIndex,
      columnId,
      value: String(value)
    });
  };

  const handleCellEditSave = async () => {
    if (!editingCell || !selectedDataset) return;

    const fileId = selectedDataset.file_id;
    const row = previewData[editingCell.rowIndex];
    const oldValue = String(row[editingCell.columnId]);
    const newValue = editingCell.value;

    if (oldValue === newValue) {
      setEditingCell(null);
      return;
    }

    try {
      setOperationLoading(true);
      setError(null);

      const response = await window.autoGrpc.replaceFileData({
        file_id: fileId,
        replacements: [{ from_value: oldValue, to_value: newValue }],
        columns: [editingCell.columnId]
      });

      if (response.success) {
        showSuccess(`Actualizado: ${response.rows_affected} celdas`);
        await refreshData();
      } else {
        setError(response.error_message || 'Error al actualizar');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOperationLoading(false);
      setEditingCell(null);
    }
  };

  const handleCellEditCancel = () => {
    setEditingCell(null);
  };

  const handleCellEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCellEditSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleCellEditCancel();
    }
  };

  // Column header editing handlers
  const handleColumnHeaderDoubleClick = (columnId: string) => {
    if (columnId === 'rowNumber') return; // Don't rename row number column
    setEditingColumnHeader(columnId);
    setEditingColumnName(columnId);
  };

  const handleColumnHeaderEditSave = async () => {
    if (!editingColumnHeader || !editingColumnName || !selectedDataset) return;

    const oldName = editingColumnHeader;
    const newName = editingColumnName.trim();

    if (oldName === newName || !newName) {
      setEditingColumnHeader(null);
      setEditingColumnName('');
      return;
    }

    const fileId = selectedDataset.file_id;

    try {
      setOperationLoading(true);
      setError(null);

      const response = await window.autoGrpc.renameFileColumn({
        file_id: fileId,
        column_renames: { [oldName]: newName }
      });

      if (response.success) {
        showSuccess(`Columna renombrada: ${oldName} → ${newName}`);
        await refreshData();
      } else {
        setError(response.error_message || 'Error al renombrar columna');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOperationLoading(false);
      setEditingColumnHeader(null);
      setEditingColumnName('');
    }
  };

  const handleColumnHeaderEditCancel = () => {
    setEditingColumnHeader(null);
    setEditingColumnName('');
  };

  const handleColumnHeaderEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleColumnHeaderEditSave();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      handleColumnHeaderEditCancel();
    }
  };

  const handleDuplicateColumn = async (columnName: string) => {
    if (!selectedDataset) return;

    const fileId = selectedDataset.file_id;

    try {
      setOperationLoading(true);
      setError(null);

      const response = await window.autoGrpc.duplicateFileColumns({
        file_id: fileId,
        columns: [{ source_column: columnName, new_column_name: '' }] // Empty string lets backend auto-generate name
      });

      if (response.success) {
        showSuccess(`Columna duplicada: ${columnName} → ${response.duplicated_columns.join(', ')}`);
        await refreshData();
      } else {
        setError(response.error_message || 'Error al duplicar columna');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOperationLoading(false);
    }
  };

  // Replace all occurrences in a column
  const handleReplaceAllInColumn = async (columnName: string, oldValue: string) => {
    if (!selectedDataset) return;

    const newValue = prompt(`Reemplazar "${oldValue}" por:`, oldValue);
    if (newValue === null || newValue === oldValue) return;

    const fileId = selectedDataset.file_id;

    try {
      setOperationLoading(true);
      setError(null);

      const response = await window.autoGrpc.replaceFileData({
        file_id: fileId,
        replacements: [{ from_value: oldValue, to_value: newValue }],
        columns: [columnName]
      });

      if (response.success) {
        showSuccess(`Reemplazadas ${response.rows_affected} celdas`);
        await refreshData();
      } else {
        setError(response.error_message || 'Error al reemplazar');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOperationLoading(false);
    }
  };

  // Row selection handlers
  const toggleRowSelection = (rowIndex: number) => {
    const newSelection = new Set(selectedRows);
    if (newSelection.has(rowIndex)) {
      newSelection.delete(rowIndex);
    } else {
      newSelection.add(rowIndex);
    }
    setSelectedRows(newSelection);
  };

  const clearRowSelection = () => {
    setSelectedRows(new Set());
  };

  const selectAllVisibleRows = () => {
    const allRowIndices = new Set(previewData.map((_, index) => index));
    setSelectedRows(allRowIndices);
  };

  // Delete selected rows
  const handleDeleteSelectedRows = async () => {
    if (!selectedDataset || selectedRows.size === 0) return;

    const confirmed = window.confirm(`¿Eliminar ${selectedRows.size} fila(s) seleccionada(s)?`);
    if (!confirmed) return;

    const fileId = selectedDataset.file_id;
    // Convert to actual data indices (accounting for pagination)
    const offset = pagination.pageIndex * pagination.pageSize;
    const actualIndices = Array.from(selectedRows).map(idx => offset + idx);

    try {
      setOperationLoading(true);
      setError(null);

      const response = await window.autoGrpc.deleteFilePoints({
        file_id: fileId,
        row_indices: actualIndices
      });

      if (response.success) {
        showSuccess(`${response.rows_deleted} fila(s) eliminada(s). ${response.rows_remaining} filas restantes`);
        clearRowSelection();
        await refreshData();
      } else {
        setError(response.error_message || 'Error al eliminar filas');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOperationLoading(false);
    }
  };

  // Delete single row (from context menu)
  const handleDeleteRow = async (rowIndex: number) => {
    if (!selectedDataset) return;

    const confirmed = window.confirm(`¿Eliminar fila ${rowIndex + 1}?`);
    if (!confirmed) return;

    const fileId = selectedDataset.file_id;
    const offset = pagination.pageIndex * pagination.pageSize;
    const actualIndex = offset + rowIndex;

    try {
      setOperationLoading(true);
      setError(null);

      const response = await window.autoGrpc.deleteFilePoints({
        file_id: fileId,
        row_indices: [actualIndex]
      });

      if (response.success) {
        showSuccess(`Fila eliminada. ${response.rows_remaining} filas restantes`);
        await refreshData();
      } else {
        setError(response.error_message || 'Error al eliminar fila');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOperationLoading(false);
    }
  };

  // Advanced operations - Replace values
  const handleReplaceData = async () => {
    if (!selectedDataset) return;

    const validReplacements = replacements.filter(r => r.from);
    if (validReplacements.length === 0) {
      setError('Proporciona al menos un reemplazo');
      return;
    }

    const fileId = selectedDataset.file_id;

    try {
      setOperationLoading(true);
      setError(null);

      const response = await window.autoGrpc.replaceFileData({
        file_id: fileId,
        replacements: validReplacements.map(r => ({ from_value: r.from, to_value: r.to })),
        columns: replaceColumns
      });

      if (response.success) {
        showSuccess(`Reemplazadas ${response.rows_affected} celdas`);
        await refreshData();
        setReplacements([{from: '', to: ''}]);
        setReplaceColumns([]);
      } else {
        setError(response.error_message || 'Error al reemplazar');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOperationLoading(false);
    }
  };

  // Advanced operations - Filter data
  const handleFilterData = async () => {
    if (!selectedDataset || !filterColumn || !filterValue) {
      setError('Selecciona columna y valor para filtrar');
      return;
    }

    if (filterMode === 'add_column' && !newFilterColumnName) {
      setError('Ingresa un nombre para la columna filtrada');
      return;
    }

    if (filterMode === 'new_file' && !newFilterFileName) {
      setError('Ingresa un nombre para el archivo nuevo');
      return;
    }

    const fileId = selectedDataset.file_id;

    try {
      setOperationLoading(true);
      setError(null);

      if (filterMode === 'add_column') {
        const response = await window.autoGrpc.addFilteredColumn({
          file_id: fileId,
          new_column_name: newFilterColumnName,
          source_column: filterColumn,
          operation: filterOperation,
          value: filterValue
        });

        if (response.success) {
          showSuccess(`Columna filtrada creada: ${response.rows_with_values} coincidencias`);
          await refreshData();
          setNewFilterColumnName('');
        } else {
          setError(response.error_message || 'Error al filtrar');
        }
      } else {
        const response = await window.autoGrpc.filterFileData({
          file_id: fileId,
          column: filterColumn,
          operation: filterOperation,
          value: filterValue,
          create_new_file: filterMode === 'new_file',
          new_file_name: filterMode === 'new_file' ? newFilterFileName : ''
        });

        if (response.success) {
          showSuccess(`Filtrado completado: ${response.total_rows} filas`);
          await refreshData();
          if (filterMode === 'new_file') {
            setNewFilterFileName('');
          }
        } else {
          setError(response.error_message || 'Error al filtrar');
        }
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOperationLoading(false);
    }
  };

  // Advanced operations - Duplicate columns (bulk)
  const handleDuplicateColumns = async () => {
    if (!selectedDataset || columnsToDuplicate.length === 0) {
      setError('Selecciona columnas para duplicar');
      return;
    }

    const fileId = selectedDataset.file_id;

    try {
      setOperationLoading(true);
      setError(null);

      const response = await window.autoGrpc.duplicateFileColumns({
        file_id: fileId,
        columns: columnsToDuplicate.map(col => ({
          source_column: col.sourceColumn,
          new_column_name: col.newName
        }))
      });

      if (response.success) {
        showSuccess(`${response.duplicated_columns.length} columna(s) duplicada(s)`);
        await refreshData();
        setColumnsToDuplicate([]);
      } else {
        setError(response.error_message || 'Error al duplicar columnas');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOperationLoading(false);
    }
  };

  // Advanced operations - Delete rows
  const handleDeletePoints = async () => {
    if (!selectedDataset || !rowIndicesToDelete) {
      setError('Ingresa índices de filas a eliminar');
      return;
    }

    const fileId = selectedDataset.file_id;
    const indices = rowIndicesToDelete.split(',').map(s => parseInt(s.trim())).filter(n => !isNaN(n));

    if (indices.length === 0) {
      setError('Índices inválidos');
      return;
    }

    const confirmed = window.confirm(`¿Eliminar ${indices.length} fila(s)?`);
    if (!confirmed) return;

    try {
      setOperationLoading(true);
      setError(null);

      const response = await window.autoGrpc.deleteFilePoints({
        file_id: fileId,
        row_indices: indices
      });

      if (response.success) {
        showSuccess(`${response.rows_deleted} fila(s) eliminada(s)`);
        await refreshData();
        setRowIndicesToDelete('');
      } else {
        setError(response.error_message || 'Error al eliminar filas');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOperationLoading(false);
    }
  };

  // Load paginated data
  useEffect(() => {
    if (!selectedDataset) return;
    
    // Check if dataset changed
    const datasetChanged = lastFetchedDatasetRef.current !== selectedDataset.id;
    
    if (datasetChanged) {
      // Reset pagination when dataset changes
      if (pagination.pageIndex !== 0) {
        setPagination(prev => ({ ...prev, pageIndex: 0 }));
        return; // Let the pagination change trigger the fetch
      }
      lastFetchedDatasetRef.current = selectedDataset.id;
    }
    
    refreshData();
    clearRowSelection(); // Clear selection when changing pages
  }, [selectedDataset, pagination.pageIndex, pagination.pageSize]);

  // Define table columns dynamically based on preview columns
  const columns = useMemo<ColumnDef<DataRow>[]>(() => {
    const cols: ColumnDef<DataRow>[] = [
      {
        id: 'select',
        header: () => (
          <input
            type="checkbox"
            className="cursor-pointer"
            checked={selectedRows.size === previewData.length && previewData.length > 0}
            onChange={(e) => {
              if (e.target.checked) {
                selectAllVisibleRows();
              } else {
                clearRowSelection();
              }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        cell: ({ row }) => (
          <input
            type="checkbox"
            className="cursor-pointer"
            checked={selectedRows.has(row.index)}
            onChange={() => toggleRowSelection(row.index)}
            onClick={(e) => e.stopPropagation()}
          />
        ),
        size: 40,
      },
      {
        accessorKey: 'rowNumber',
        header: '#',
        size: 60,
        cell: info => <span className="font-medium">{info.getValue() as number}</span>,
      },
    ];

    // Add data columns
    previewColumns.forEach(colName => {
      cols.push({
        accessorKey: colName,
        header: colName,
        cell: info => {
          const value = info.getValue() as number;
          return typeof value === 'number' ? value.toFixed(4) : value;
        },
      });
    });

    return cols;
  }, [previewColumns, selectedRows, previewData.length]);

  // Create table instance with manual pagination
  const pageCount = useMemo(() => Math.ceil(totalRows / pagination.pageSize), [totalRows, pagination.pageSize]);

  const table = useReactTable({
    data: previewData,
    columns,
    pageCount,
    state: {
      pagination,
    },
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true, // We handle pagination on the server
  });

  // Setup virtualizer for rows
  const { rows } = table.getRowModel();
  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 48, // Estimated row height in pixels
    overscan: 5,
  });

  if (!selectedDataset) {
    return (
      <Card className="w-full h-full flex items-center justify-center">
        <CardContent className="text-center py-12">
          <Database className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
          <p className="text-lg font-medium">No hay dataset seleccionado</p>
          <p className="text-sm text-muted-foreground mt-2">
            Selecciona un dataset desde el administrador de proyectos
          </p>
        </CardContent>
      </Card>
    );
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp * 1000).toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-3 p-4 h-full flex flex-col">
      {/* Header */}
      <div className="space-y-1 flex-shrink-0">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold tracking-tight truncate">{selectedDataset.file_name}</h2>
          <Badge variant="default" className="px-3 py-1 text-sm">
            <Database className="mr-1.5 h-4 w-4" />
            {selectedDataset.total_rows.toLocaleString()}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Información y vista previa del dataset
        </p>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded p-3 flex-shrink-0">
          <p className="text-sm text-red-800">{error}</p>
        </div>
      )}

      {/* Metadata and Columns in a single row card */}
      <Card className="flex-shrink-0">
        <CardContent className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-4">
            {/* Dataset Metadata */}
            <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center mb-3">
                  <Info className="mr-1.5 h-4 w-4" />
                  Metadatos
                </h3>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Archivo original</p>
                  <p className="text-sm truncate">{selectedDataset.original_filename}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Total de filas</p>
                  <p className="text-sm">{selectedDataset.total_rows.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Fecha de creación</p>
                  <p className="text-sm flex items-center">
                    <Calendar className="mr-1.5 h-3.5 w-3.5" />
                    {formatDate(selectedDataset.created_at)}
                  </p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">ID del Dataset</p>
                  <p className="text-xs font-mono bg-muted px-2 py-1 rounded truncate">{selectedDataset.id}</p>
                </div>
              </div>

              {/* Columns List */}
              <div className="space-y-2">
                <h3 className="text-sm font-semibold flex items-center mb-3">
                  <Grid3x3 className="mr-1.5 h-4 w-4" />
                  Columnas ({selectedDataset.column_mappings?.length || 0})
                </h3>
                <ScrollArea className="h-[140px] pr-2">
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
                    {selectedDataset.column_mappings?.map((mapping, index) => (
                      <div
                        key={index}
                        className="flex flex-col p-2 border rounded space-y-1"
                      >
                        <div className="flex items-center space-x-1.5 flex-1 min-w-0">
                          <span className="font-medium truncate text-sm">{mapping.column_name}</span>
                          {mapping.is_coordinate && (
                            <Badge variant="secondary" className="text-xs px-1.5 py-0.5 shrink-0">
                              {mapping.mapped_field?.toUpperCase()}
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline" className="text-xs px-1.5 py-0.5 w-fit">
                          {String(mapping.column_type) === "COLUMN_TYPE_NUMERIC" ? 'Num' : String(mapping.column_type) === "COLUMN_TYPE_CATEGORICAL" ? 'Text' : 'Unused'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Success/Error Alerts */}
      {success && (
        <Alert className="flex-shrink-0 border-green-200 bg-green-50">
          <CheckCircle className="h-4 w-4 text-green-600" />
          <AlertDescription className="text-green-800">{success}</AlertDescription>
        </Alert>
      )}

      {/* Data Preview */}
      <Card className="flex-shrink-0 mt-3">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Datos</CardTitle>
              <CardDescription className="text-xs">
                Doble clic para editar, clic derecho para más opciones
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setAdvancedDialogOpen(true)}
              disabled={operationLoading}
            >
              <Settings className="mr-2 h-4 w-4" />
              Operaciones Avanzadas
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          {operationLoading && (
            <div className="flex items-center justify-center py-2 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Procesando operación...
            </div>
          )}

          {/* Row Selection Toolbar */}
          {selectedRows.size > 0 && (
            <div className="flex items-center justify-between p-3 bg-accent rounded-md border">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">
                  {selectedRows.size} fila(s) seleccionada(s)
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={clearRowSelection}
                >
                  Limpiar selección
                </Button>
              </div>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleDeleteSelectedRows}
                disabled={operationLoading}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Eliminar seleccionadas
              </Button>
            </div>
          )}
          
          {previewData.length === 0 && !loading ? (
            <div className="text-center py-8 text-muted-foreground">
              No se pudo cargar la vista previa
            </div>
          ) : (
            <div
              ref={tableContainerRef}
              className="h-[500px] overflow-auto border rounded relative"
            >
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted z-10">
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header) => {
                        const isEditing = editingColumnHeader === header.column.id;
                        const isSelectColumn = header.column.id === 'select';
                        const isRowNumberColumn = header.column.id === 'rowNumber';
                        
                        return (
                          <th
                            key={header.id}
                            className="px-6 py-3 text-left text-sm font-medium text-muted-foreground border-b whitespace-nowrap cursor-pointer hover:bg-accent"
                            style={{ 
                              width: isSelectColumn ? '40px' : isRowNumberColumn ? '100px' : 'auto',
                              minWidth: isSelectColumn ? '40px' : isRowNumberColumn ? '100px' : '180px'
                            }}
                            onDoubleClick={() => {
                              if (!isSelectColumn && !isRowNumberColumn) {
                                handleColumnHeaderDoubleClick(header.column.id);
                              }
                            }}
                            onContextMenu={(e) => {
                              if (!isSelectColumn && !isRowNumberColumn) {
                                handleContextMenu(e, 'header', { columnId: header.column.id });
                              }
                            }}
                          >
                            {isEditing ? (
                              <Input
                                value={editingColumnName}
                                onChange={(e) => setEditingColumnName(e.target.value)}
                                onKeyDown={handleColumnHeaderEditKeyDown}
                                onBlur={handleColumnHeaderEditSave}
                                autoFocus
                                className="h-8 text-sm font-medium"
                              />
                            ) : (
                              header.isPlaceholder
                                ? null
                                : flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                  )
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  ))}
                </thead>
                <tbody
                  style={{
                    height: `${rowVirtualizer.getTotalSize()}px`,
                    position: 'relative',
                  }}
                >
                  {loading ? (
                    // Show skeleton rows during loading
                    Array.from({ length: 10 }).map((_, index) => (
                      <tr
                        key={`skeleton-${index}`}
                        className="border-b"
                        style={{
                          position: 'absolute',
                          top: 0,
                          left: 0,
                          width: '100%',
                          height: '48px',
                          transform: `translateY(${index * 48}px)`,
                        }}
                      >
                        <td className="px-6 py-3" style={{ width: '40px', minWidth: '40px' }}>
                          <Skeleton className="h-4 w-4" />
                        </td>
                        <td className="px-6 py-3" style={{ width: '100px', minWidth: '100px' }}>
                          <Skeleton className="h-4 w-14" />
                        </td>
                        {previewColumns.map((col, colIdx) => (
                          <td key={`skeleton-col-${colIdx}`} className="px-6 py-3" style={{ minWidth: '180px' }}>
                            <Skeleton className="h-4 w-32" />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : (
                    // Show actual data rows
                    rowVirtualizer.getVirtualItems().map(virtualRow => {
                      const row = rows[virtualRow.index];
                      return (
                        <tr
                          key={row.id}
                          className="border-b hover:bg-muted/50"
                          style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: `${virtualRow.size}px`,
                            transform: `translateY(${virtualRow.start}px)`,
                          }}
                        >
                          {row.getVisibleCells().map((cell) => {
                            const columnId = cell.column.id;
                            const rowIndex = virtualRow.index;
                            const cellValue = cell.getValue();
                            const isEditing = editingCell && 
                                            editingCell.rowIndex === rowIndex && 
                                            editingCell.columnId === columnId;
                            const isSelectColumn = columnId === 'select';
                            const isRowNumberColumn = columnId === 'rowNumber';
                            
                            return (
                              <td 
                                key={cell.id} 
                                className="px-6 py-3 cursor-pointer hover:bg-accent/50"
                                style={{ 
                                  width: isSelectColumn ? '40px' : isRowNumberColumn ? '100px' : 'auto',
                                  minWidth: isSelectColumn ? '40px' : isRowNumberColumn ? '100px' : '180px'
                                }}
                                onDoubleClick={() => {
                                  if (!isSelectColumn && !isRowNumberColumn) {
                                    handleCellDoubleClick(rowIndex, columnId, cellValue);
                                  }
                                }}
                                onContextMenu={(e) => {
                                  if (isRowNumberColumn) {
                                    handleContextMenu(e, 'row', { rowIndex });
                                  } else if (!isSelectColumn) {
                                    handleContextMenu(e, 'cell', { 
                                      columnId, 
                                      rowIndex, 
                                      value: String(cellValue) 
                                    });
                                  }
                                }}
                              >
                                {isEditing ? (
                                  <Input
                                    value={editingCell.value}
                                    onChange={(e) => setEditingCell({ ...editingCell, value: e.target.value })}
                                    onKeyDown={handleCellEditKeyDown}
                                    onBlur={handleCellEditSave}
                                    autoFocus
                                    className="h-8 text-sm"
                                  />
                                ) : (
                                  flexRender(
                                    cell.column.columnDef.cell,
                                    cell.getContext()
                                  )
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}
          {/* Pagination Controls */}
          {(previewData.length > 0 || loading) && (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Pág. {pagination.pageIndex + 1} / {pageCount.toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">
                {pagination.pageIndex * pagination.pageSize + 1} - {Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalRows)} de {totalRows.toLocaleString()} filas
              </p>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => table.setPageIndex(0)}
                  disabled={loading || !table.getCanPreviousPage()}
                >
                  <ChevronsLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => table.previousPage()}
                  disabled={loading || !table.getCanPreviousPage()}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => table.nextPage()}
                  disabled={loading || !table.getCanNextPage()}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 w-8 p-0"
                  onClick={() => table.setPageIndex(pageCount - 1)}
                  disabled={loading || !table.getCanNextPage()}
                >
                  <ChevronsRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Context Menu */}
      {contextMenu.show && (
        <div
          className="fixed z-50"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="bg-popover text-popover-foreground rounded-md border p-1 shadow-md min-w-[8rem]">
            {contextMenu.type === 'header' && contextMenu.target.columnId && (
              <>
                <button
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent w-full text-left"
                  onClick={() => {
                    handleColumnHeaderDoubleClick(contextMenu.target.columnId!);
                    closeContextMenu();
                  }}
                >
                  <Edit2 className="h-4 w-4" />
                  Renombrar columna
                </button>
                <button
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent w-full text-left"
                  onClick={() => {
                    handleDuplicateColumn(contextMenu.target.columnId!);
                    closeContextMenu();
                  }}
                >
                  <Copy className="h-4 w-4" />
                  Duplicar columna
                </button>
              </>
            )}
            
            {contextMenu.type === 'cell' && contextMenu.target.columnId && contextMenu.target.value && (
              <>
                <button
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent w-full text-left"
                  onClick={() => {
                    handleCellDoubleClick(contextMenu.target.rowIndex!, contextMenu.target.columnId!, contextMenu.target.value);
                    closeContextMenu();
                  }}
                >
                  <Edit2 className="h-4 w-4" />
                  Editar valor
                </button>
                <button
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-accent w-full text-left"
                  onClick={() => {
                    handleReplaceAllInColumn(contextMenu.target.columnId!, contextMenu.target.value!);
                    closeContextMenu();
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  Reemplazar todas las ocurrencias
                </button>
              </>
            )}
            
            {contextMenu.type === 'row' && contextMenu.target.rowIndex !== undefined && (
              <button
                className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-destructive/10 text-destructive w-full text-left"
                onClick={() => {
                  handleDeleteRow(contextMenu.target.rowIndex!);
                  closeContextMenu();
                }}
              >
                <Trash2 className="h-4 w-4" />
                Eliminar fila
              </button>
            )}
          </div>
        </div>
      )}

      {/* Advanced Operations Dialog */}
      <Dialog open={advancedDialogOpen} onOpenChange={setAdvancedDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Operaciones Avanzadas</DialogTitle>
            <DialogDescription>
              Realiza operaciones en lote sobre tus datos
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="replace" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="replace">Reemplazar</TabsTrigger>
              <TabsTrigger value="filter">Filtrar</TabsTrigger>
              <TabsTrigger value="columns">Columnas</TabsTrigger>
              <TabsTrigger value="delete">Eliminar</TabsTrigger>
            </TabsList>

            {/* Tab 1: Replace Values */}
            <TabsContent value="replace" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label>Reemplazos</Label>
                  {replacements.map((repl, idx) => (
                    <div key={idx} className="grid grid-cols-2 gap-4 mt-2">
                      <Input
                        placeholder="Valor a buscar"
                        value={repl.from}
                        onChange={(e) => {
                          const updated = [...replacements];
                          updated[idx].from = e.target.value;
                          setReplacements(updated);
                        }}
                      />
                      <Input
                        placeholder="Nuevo valor"
                        value={repl.to}
                        onChange={(e) => {
                          const updated = [...replacements];
                          updated[idx].to = e.target.value;
                          setReplacements(updated);
                        }}
                      />
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setReplacements([...replacements, {from: '', to: ''}])}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar reemplazo
                  </Button>
                </div>

                <div>
                  <Label>Columnas objetivo (opcional)</Label>
                  <div className="flex flex-wrap gap-2 mt-2 p-3 border rounded-md min-h-[60px]">
                    {previewColumns.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No hay columnas disponibles</p>
                    ) : (
                      previewColumns.map((col: string) => (
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
                      ? "Sin columnas seleccionadas - se aplicará a TODAS las columnas"
                      : `${replaceColumns.length} columna(s) seleccionada(s)`}
                  </p>
                </div>

                <Button onClick={handleReplaceData} disabled={operationLoading} className="w-full">
                  {operationLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                  Reemplazar Datos
                </Button>
              </div>
            </TabsContent>

            {/* Tab 2: Filter Data */}
            <TabsContent value="filter" className="space-y-4">
              <div className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <Label>Columna</Label>
                    <Select value={filterColumn} onValueChange={setFilterColumn}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Seleccionar" />
                      </SelectTrigger>
                      <SelectContent>
                        {previewColumns.map((col: string) => (
                          <SelectItem key={col} value={col}>{col}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Operación</Label>
                    <Select value={filterOperation} onValueChange={setFilterOperation}>
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="=">=</SelectItem>
                        <SelectItem value="!=">!=</SelectItem>
                        <SelectItem value=">">&gt;</SelectItem>
                        <SelectItem value="<">&lt;</SelectItem>
                        <SelectItem value=">=">&gt;=</SelectItem>
                        <SelectItem value="<=">&lt;=</SelectItem>
                        <SelectItem value="LIKE">LIKE</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Valor</Label>
                    <Input
                      value={filterValue}
                      onChange={(e) => setFilterValue(e.target.value)}
                      placeholder="Valor"
                      className="mt-1"
                    />
                  </div>
                </div>

                <Separator />

                <div className="space-y-3">
                  <Label className="text-base">Modo de filtrado:</Label>

                  <label className="flex items-start gap-3 p-3 border rounded-lg hover:bg-accent cursor-pointer">
                    <input
                      type="radio"
                      name="filterMode"
                      value="add_column"
                      checked={filterMode === 'add_column'}
                      onChange={(e) => setFilterMode(e.target.value as 'add_column' | 'delete_rows' | 'new_file')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">Agregar columna filtrada (Seguro)</div>
                      <div className="text-xs text-muted-foreground">
                        Crea una nueva columna con valores coincidentes, NULL para filas no coincidentes
                      </div>
                      {filterMode === 'add_column' && (
                        <Input
                          value={newFilterColumnName}
                          onChange={(e) => setNewFilterColumnName(e.target.value)}
                          placeholder="Nombre de nueva columna"
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
                      onChange={(e) => setFilterMode(e.target.value as 'add_column' | 'delete_rows' | 'new_file')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm">Crear archivo nuevo (Seguro)</div>
                      <div className="text-xs text-muted-foreground">
                        Crea un archivo nuevo con solo las filas coincidentes
                      </div>
                      {filterMode === 'new_file' && (
                        <Input
                          value={newFilterFileName}
                          onChange={(e) => setNewFilterFileName(e.target.value)}
                          placeholder="Nombre del archivo"
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
                      onChange={(e) => setFilterMode(e.target.value as 'add_column' | 'delete_rows' | 'new_file')}
                      className="mt-1"
                    />
                    <div className="flex-1">
                      <div className="font-medium text-sm text-destructive">Eliminar filas no coincidentes (Destructivo)</div>
                      <div className="text-xs text-muted-foreground">
                        Elimina permanentemente las filas que no coinciden
                      </div>
                    </div>
                  </label>
                </div>

                <Button onClick={handleFilterData} disabled={operationLoading} className="w-full">
                  {operationLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Filter className="mr-2 h-4 w-4" />}
                  Filtrar Datos
                </Button>
              </div>
            </TabsContent>

            {/* Tab 3: Column Operations */}
            <TabsContent value="columns" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label className="text-base">Duplicar columnas</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Selecciona columnas para duplicar
                  </p>
                  
                  {columnsToDuplicate.map((colDup, idx) => (
                    <div key={idx} className="grid grid-cols-[1fr_1fr_auto] gap-2 mt-2">
                      <Select
                        value={colDup.sourceColumn}
                        onValueChange={(value) => {
                          const updated = [...columnsToDuplicate];
                          updated[idx].sourceColumn = value;
                          setColumnsToDuplicate(updated);
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Columna origen" />
                        </SelectTrigger>
                        <SelectContent>
                          {previewColumns.map((col: string) => (
                            <SelectItem key={col} value={col}>{col}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Input
                        placeholder="Nombre nuevo (opcional)"
                        value={colDup.newName}
                        onChange={(e) => {
                          const updated = [...columnsToDuplicate];
                          updated[idx].newName = e.target.value;
                          setColumnsToDuplicate(updated);
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setColumnsToDuplicate(columnsToDuplicate.filter((_, i) => i !== idx));
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                  
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setColumnsToDuplicate([...columnsToDuplicate, {sourceColumn: '', newName: ''}])}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Agregar columna
                  </Button>
                </div>

                <Button onClick={handleDuplicateColumns} disabled={operationLoading || columnsToDuplicate.length === 0} className="w-full">
                  {operationLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Copy className="mr-2 h-4 w-4" />}
                  Duplicar Columnas
                </Button>
              </div>
            </TabsContent>

            {/* Tab 4: Delete Rows */}
            <TabsContent value="delete" className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label>Índices de filas a eliminar</Label>
                  <Input
                    value={rowIndicesToDelete}
                    onChange={(e) => setRowIndicesToDelete(e.target.value)}
                    placeholder="Ej: 0,5,10,15 (separados por comas, base 0)"
                    className="mt-1"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    Los índices son base 0 (la primera fila es 0)
                  </p>
                </div>

                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Esta operación es destructiva y no se puede deshacer. Las filas serán eliminadas permanentemente.
                  </AlertDescription>
                </Alert>

                <Button 
                  onClick={handleDeletePoints} 
                  disabled={operationLoading || !rowIndicesToDelete} 
                  variant="destructive"
                  className="w-full"
                >
                  {operationLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Eliminar Filas
                </Button>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DatasetInfoViewer;

