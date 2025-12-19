import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, Calendar, Settings, Edit2, Copy, Trash2, RefreshCw, Filter, Plus, AlertCircle, CheckCircle, Loader2 } from 'lucide-react';
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
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { toast } from 'sonner';
import { ColumnType } from '@/generated/projects';

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

/**
 * Represents a pending cell edit that hasn't been applied yet
 */
interface PendingEdit {
  id: string;                    // Unique ID for the edit
  rowIndex: number;              // Row index in the current page
  actualRowIndex: number;        // Actual row index in the dataset (accounting for pagination)
  columnId: string;              // Column name
  oldValue: string;              // Original value before edit
  newValue: string;              // New value to apply
  timestamp: number;             // When the edit was made
}

/**
 * Types of batch operations that can be queued
 */
type BatchOperationType = 
  | 'replace'           // Find and replace values
  | 'duplicate_column'  // Duplicate columns
  | 'delete_column'     // Delete columns
  | 'add_filtered_column' // Add a filtered column
  | 'filter_delete_rows'  // Delete rows based on filter
  | 'filter_new_file';    // Create new file from filter

/**
 * Represents a pending batch operation
 */
interface PendingBatchOperation {
  id: string;
  type: BatchOperationType;
  description: string;           // Human-readable description
  timestamp: number;
  params: Record<string, unknown>; // Operation-specific parameters
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
  const setSelectedDataset = useBrushStore((state) => state.setSelectedDataset);
  const [previewData, setPreviewData] = useState<DataRow[]>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [totalRows, setTotalRows] = useState(0);
  
  // Pending edits queue - edits are queued until user clicks Apply
  const [pendingEdits, setPendingEdits] = useState<PendingEdit[]>([]);
  const [pendingBatchOperations, setPendingBatchOperations] = useState<PendingBatchOperation[]>([]);
  const [isApplyingEdits, setIsApplyingEdits] = useState(false);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: ROWS_PER_PAGE,
  });
  const tableContainerRef = React.useRef<HTMLDivElement>(null);
  const topScrollbarRef = React.useRef<HTMLDivElement>(null);
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
  const [columnsToDelete, setColumnsToDelete] = useState<string[]>([]);
  
  // Column header editing state
  const [editingColumnHeader, setEditingColumnHeader] = useState<string | null>(null);
  const [editingColumnName, setEditingColumnName] = useState('');

  // Row selection for deletion
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionStart, setSelectionStart] = useState<number | null>(null);

  // Track table scroll width for top scrollbar
  const [tableScrollWidth, setTableScrollWidth] = useState<number>(0);

  // Statistics state
  const [statistics, setStatistics] = useState<Array<{
    column_name: string,
    data_type: string,
    count?: number,
    null_count?: number,
    unique_count?: number,
    mean?: number,
    std?: number,
    min_value?: number,
    q25?: number,
    q50?: number,
    q75?: number,
    max?: number,
    min?: number,
    top_values?: string[],
    top_counts?: number[]
  }>>([]);
  const [loadingStatistics, setLoadingStatistics] = useState(false);
  const [selectedColumnName, setSelectedColumnName] = useState<string | null>(null);

  // Helper function to load statistics
  const loadStatistics = async () => {
    if (!selectedDataset) return;

    try {
      setLoadingStatistics(true);

      const response = await window.grpc.getFileStatistics({
        file_id: selectedDataset.file_id,
        columns: []
      });

      if (response.success && response.statistics) {
        setStatistics(response.statistics);
      }
    } catch (err) {
      console.error('Error loading statistics:', err);
    } finally {
      setLoadingStatistics(false);
    }
  };

  // Helper function to refresh dataset metadata from backend
  const refreshDatasetMetadata = async () => {
    if (!selectedDataset) return;

    try {
      // Fetch fresh file statistics to get updated column list
      const statsResponse = await window.grpc.getFileStatistics({
        file_id: selectedDataset.file_id,
        columns: []
      });

      if (statsResponse.success && statsResponse.statistics) {
        // Update statistics state
        setStatistics(statsResponse.statistics);

        // Rebuild column_mappings from the fresh statistics
        const updatedColumnMappings = statsResponse.statistics.map((stat: {
          column_name: string;
          data_type: string;
        }) => {
          // Find if this column existed before to preserve its mapping
          const existingMapping = selectedDataset.column_mappings?.find(
            m => m.column_name === stat.column_name
          );

          return {
            column_name: stat.column_name,
            column_type: stat.data_type === 'numeric' ? ColumnType.COLUMN_TYPE_NUMERIC : ColumnType.COLUMN_TYPE_CATEGORICAL,
            mapped_field: existingMapping?.mapped_field || '',
            is_coordinate: existingMapping?.is_coordinate || false
          };
        });

        // Create updated dataset with fresh column_mappings
        const updatedDataset = {
          ...selectedDataset,
          column_mappings: updatedColumnMappings
        };

        // Get current store state to maintain datasetData and globalColumns
        const currentState = useBrushStore.getState();

        // Force update the store
        if (currentState.datasetData && currentState.globalColumns) {
          console.log('🔄 Refreshing dataset - old columns:', selectedDataset.column_mappings?.length, 'new columns:', updatedColumnMappings.length);
          setSelectedDataset(updatedDataset, currentState.datasetData, currentState.globalColumns);
        }
      }
    } catch (err) {
      console.error('Error refreshing dataset metadata:', err);
    }
  };

  // Helper function to refresh data
  const refreshData = async () => {
    if (!selectedDataset) return;

    try {
      setLoading(true);

      const offset = pagination.pageIndex * pagination.pageSize;

      console.log('📊 [DatasetInfoViewer] Requesting table data for dataset:', selectedDataset.id);
      console.log('📊 [DatasetInfoViewer] Dataset column_mappings:', selectedDataset.column_mappings);

      const response = await window.grpc.getDatasetTableData({
        dataset_id: selectedDataset.id,
        limit: pagination.pageSize,
        offset: offset,
        columns: []
      });
      if (response.success && response.rows) {
        // Use actual column keys from first row data instead of response.column_names
        // This ensures we show ALL columns that have data, even if column_names is incomplete
        const actualColumnKeys = response.rows.length > 0
          ? Object.keys(response.rows[0].values)
          : response.column_names;

        setPreviewColumns(actualColumnKeys);
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
        toast.error(response.error_message || 'Error al cargar datos');
      }
    } catch {
      toast.error('Error al refrescar los datos');
    } finally {
      setLoading(false);
    }
  };

  // ========== Pending Edits Queue Functions ==========

  /**
   * Queue a cell edit (doesn't apply immediately)
   */
  const queueCellEdit = (rowIndex: number, columnId: string, oldValue: string, newValue: string) => {
    const actualRowIndex = pagination.pageIndex * pagination.pageSize + rowIndex;
    
    // Check if there's already a pending edit for this cell
    const existingEditIndex = pendingEdits.findIndex(
      e => e.rowIndex === rowIndex && e.columnId === columnId
    );
    
    const newEdit: PendingEdit = {
      id: `${rowIndex}-${columnId}-${Date.now()}`,
      rowIndex,
      actualRowIndex,
      columnId,
      oldValue: existingEditIndex >= 0 ? pendingEdits[existingEditIndex].oldValue : oldValue,
      newValue,
      timestamp: Date.now()
    };
    
    if (existingEditIndex >= 0) {
      // Update existing edit
      setPendingEdits(prev => {
        const updated = [...prev];
        // If new value equals original, remove the edit
        if (newValue === updated[existingEditIndex].oldValue) {
          updated.splice(existingEditIndex, 1);
        } else {
          updated[existingEditIndex] = newEdit;
        }
        return updated;
      });
    } else {
      // Add new edit
      setPendingEdits(prev => [...prev, newEdit]);
    }
    
    // Update local preview data immediately for visual feedback
    setPreviewData(prev => {
      const updated = [...prev];
      if (updated[rowIndex]) {
        updated[rowIndex] = { ...updated[rowIndex], [columnId]: parseFloat(newValue) || 0 };
      }
      return updated;
    });
  };

  /**
   * Apply all pending edits and batch operations to the backend
   */
  const applyPendingEdits = async () => {
    if (pendingEdits.length === 0 && pendingBatchOperations.length === 0) return;
    if (!selectedDataset) return;
    
    setIsApplyingEdits(true);
    let successCount = 0;
    let errorCount = 0;
    
    try {
      // First apply batch operations (they might affect structure)
      for (const op of pendingBatchOperations) {
        const success = await executeBatchOperation(op);
        if (success) {
          successCount++;
        } else {
          errorCount++;
        }
      }
      
      // Then apply individual cell edits
      for (const edit of pendingEdits) {
        try {
          const response = await window.grpc.updateCell({
            file_id: selectedDataset.file_id,
            row_index: edit.actualRowIndex,
            column_name: edit.columnId,
            new_value: edit.newValue
          });
          
          if (response.success) {
            successCount++;
          } else {
            errorCount++;
            console.error(`Failed to apply edit: ${response.error_message}`);
          }
        } catch (err) {
          errorCount++;
          console.error('Error applying edit:', err);
        }
      }
      
      // Clear all pending operations
      setPendingEdits([]);
      setPendingBatchOperations([]);
      
      // Refresh data and statistics
      await refreshData();
      await loadStatistics();
      await refreshDatasetMetadata();
      
      if (errorCount === 0) {
        toast.success(`${successCount} operación(es) aplicada(s)`);
      } else {
        toast.warning(`${successCount} aplicada(s), ${errorCount} error(es)`);
      }
    } catch (err) {
      toast.error('Error al aplicar cambios');
      console.error('Error applying edits:', err);
    } finally {
      setIsApplyingEdits(false);
    }
  };

  /**
   * Discard all pending edits and revert to original data
   */
  const discardPendingEdits = () => {
    if (pendingEdits.length === 0 && pendingBatchOperations.length === 0) return;
    
    setPendingEdits([]);
    setPendingBatchOperations([]);
    // Refresh data to revert visual changes
    refreshData();
    toast.info('Cambios descartados');
  };

  /**
   * Check if a cell has a pending edit
   */
  const hasPendingEdit = (rowIndex: number, columnId: string): boolean => {
    return pendingEdits.some(e => e.rowIndex === rowIndex && e.columnId === columnId);
  };

  /**
   * Queue a batch operation
   */
  const queueBatchOperation = (
    type: BatchOperationType,
    description: string,
    params: Record<string, unknown>
  ) => {
    const newOp: PendingBatchOperation = {
      id: `batch-${type}-${Date.now()}`,
      type,
      description,
      timestamp: Date.now(),
      params
    };
    setPendingBatchOperations(prev => [...prev, newOp]);
    toast.info(`Operación agregada: ${description}`);
  };

  /**
   * Remove a specific batch operation from the queue
   */
  const removeBatchOperation = (id: string) => {
    setPendingBatchOperations(prev => prev.filter(op => op.id !== id));
  };

  /**
   * Execute a single batch operation
   */
  const executeBatchOperation = async (op: PendingBatchOperation): Promise<boolean> => {
    if (!selectedDataset) return false;
    
    const fileId = selectedDataset.file_id;
    
    try {
      switch (op.type) {
        case 'replace': {
          const { replacements: reps, columns } = op.params as { 
            replacements: { from: string; to: string }[]; 
            columns: string[] 
          };
          const response = await window.grpc.replaceFileData({
            file_id: fileId,
            replacements: reps.map(r => ({ from_value: r.from, to_value: r.to })),
            columns
          });
          return response.success;
        }
        
        case 'duplicate_column': {
          const { columns: cols } = op.params as { 
            columns: { sourceColumn: string; newName: string }[] 
          };
          const response = await window.grpc.duplicateFileColumns({
            file_id: fileId,
            columns: cols.map(col => ({
              source_column: col.sourceColumn,
              new_column_name: col.newName
            }))
          });
          return response.success;
        }
        
        case 'delete_column': {
          const { columns: delCols } = op.params as { columns: string[] };
          const response = await window.grpc.deleteFileColumns({
            file_id: fileId,
            column_names: delCols
          });
          return response.success;
        }
        
        case 'add_filtered_column': {
          const { columnName, sourceColumn, operation, value } = op.params as {
            columnName: string;
            sourceColumn: string;
            operation: string;
            value: string;
          };
          const response = await window.grpc.addFilteredColumn({
            file_id: fileId,
            new_column_name: columnName,
            source_column: sourceColumn,
            operation,
            value
          });
          return response.success;
        }
        
        case 'filter_delete_rows': {
          const { column, operation, value } = op.params as {
            column: string;
            operation: string;
            value: string;
          };
          const response = await window.grpc.filterFileData({
            file_id: fileId,
            column,
            operation,
            value,
            create_new_file: false,
            new_file_name: ''
          });
          return response.success;
        }
        
        case 'filter_new_file': {
          const { column, operation, value, newFileName } = op.params as {
            column: string;
            operation: string;
            value: string;
            newFileName: string;
          };
          const response = await window.grpc.filterFileData({
            file_id: fileId,
            column,
            operation,
            value,
            create_new_file: true,
            new_file_name: newFileName
          });
          return response.success;
        }
        
        default:
          return false;
      }
    } catch (err) {
      console.error(`Error executing batch operation ${op.type}:`, err);
      return false;
    }
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

  const handleCellEditSave = () => {
    if (!editingCell || !selectedDataset) return;

    const row = previewData[editingCell.rowIndex];
    const oldValue = String(row[editingCell.columnId]);
    const newValue = editingCell.value;

    if (oldValue === newValue) {
      setEditingCell(null);
      return;
    }

    // Queue the edit instead of applying immediately
    queueCellEdit(editingCell.rowIndex, editingCell.columnId, oldValue, newValue);
    setEditingCell(null);
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

      const response = await window.grpc.renameFileColumn({
        file_id: fileId,
        column_renames: { [oldName]: newName }
      });

      if (response.success) {
        toast.success(`Columna renombrada: ${oldName} → ${newName}`);
        await refreshData();
        await refreshDatasetMetadata(); // Refresh column list
      } else {
        toast.error(response.error_message || 'Error al renombrar columna');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido');
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

      const response = await window.grpc.duplicateFileColumns({
        file_id: fileId,
        columns: [{ source_column: columnName, new_column_name: '' }] // Empty string lets backend auto-generate name
      });

      if (response.success) {
        toast.success(`Columna duplicada: ${columnName} → ${response.duplicated_columns.join(', ')}`);
        await refreshData();
      } else {
        toast.error(response.error_message || 'Error al duplicar columna');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOperationLoading(false);
    }
  };

  const handleDeleteColumn = async (columnName: string) => {
    if (!selectedDataset) return;

    const confirmed = window.confirm(
      `¿Estás seguro de que deseas eliminar la columna "${columnName}"?\n\nEsta operación es permanente y no se puede deshacer.`
    );
    
    if (!confirmed) return;

    const fileId = selectedDataset.file_id;

    try {
      setOperationLoading(true);

      const response = await window.grpc.deleteFileColumns({
        file_id: fileId,
        column_names: [columnName]
      });

      if (response.success) {
        toast.success(`Columna eliminada: ${columnName}`);
        await refreshData();
        await refreshDatasetMetadata(); // Refresh column list
      } else {
        toast.error(response.error_message || 'Error al eliminar columna');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido');
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

      const response = await window.grpc.replaceFileData({
        file_id: fileId,
        replacements: [{ from_value: oldValue, to_value: newValue }],
        columns: [columnName]
      });

      if (response.success) {
        toast.success(`Reemplazadas ${response.rows_affected} celdas`);
        await refreshData();
      } else {
        toast.error(response.error_message || 'Error al reemplazar');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido');
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

  const startRangeSelection = (rowIndex: number) => {
    setIsSelecting(true);
    setSelectionStart(rowIndex);
    // Toggle the clicked row
    toggleRowSelection(rowIndex);
  };

  const continueRangeSelection = (rowIndex: number) => {
    if (!isSelecting || selectionStart === null) return;

    // Select all rows between start and current
    const start = Math.min(selectionStart, rowIndex);
    const end = Math.max(selectionStart, rowIndex);
    
    const newSelection = new Set(selectedRows);
    for (let i = start; i <= end; i++) {
      if (i < previewData.length) {
        newSelection.add(i);
      }
    }
    setSelectedRows(newSelection);
  };

  const endRangeSelection = () => {
    setIsSelecting(false);
    setSelectionStart(null);
  };

  const clearRowSelection = () => {
    setSelectedRows(new Set());
  };

  const selectAllVisibleRows = () => {
    const allRowIndices = new Set(previewData.map((_, index) => index));
    setSelectedRows(allRowIndices);
  };

  // Handle mouse up globally to end selection
  useEffect(() => {
    const handleMouseUp = () => {
      if (isSelecting) {
        endRangeSelection();
      }
    };

    document.addEventListener('mouseup', handleMouseUp);
    return () => document.removeEventListener('mouseup', handleMouseUp);
  }, [isSelecting]);

  // Synchronize horizontal scrollbars (top and table container)
  useEffect(() => {
    const tableContainer = tableContainerRef.current;
    const topScrollbar = topScrollbarRef.current;

    if (!tableContainer || !topScrollbar) return;

    // Update scroll width whenever it changes
    const updateScrollWidth = () => {
      setTableScrollWidth(tableContainer.scrollWidth);
    };

    const handleTableScroll = () => {
      topScrollbar.scrollLeft = tableContainer.scrollLeft;
    };

    const handleTopScroll = () => {
      tableContainer.scrollLeft = topScrollbar.scrollLeft;
    };

    // Set initial scroll width
    updateScrollWidth();

    tableContainer.addEventListener('scroll', handleTableScroll);
    topScrollbar.addEventListener('scroll', handleTopScroll);

    // Use ResizeObserver to detect table width changes
    const resizeObserver = new ResizeObserver(updateScrollWidth);
    resizeObserver.observe(tableContainer);

    return () => {
      tableContainer.removeEventListener('scroll', handleTableScroll);
      topScrollbar.removeEventListener('scroll', handleTopScroll);
      resizeObserver.disconnect();
    };
  }, [previewData, previewColumns]);

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

      const response = await window.grpc.deleteFilePoints({
        file_id: fileId,
        row_indices: actualIndices
      });

      if (response.success) {
        toast.success(`${response.rows_deleted} fila(s) eliminada(s). ${response.rows_remaining} filas restantes`);
        clearRowSelection();
        await refreshData();
      } else {
        toast.error(response.error_message || 'Error al eliminar filas');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido');
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

      const response = await window.grpc.deleteFilePoints({
        file_id: fileId,
        row_indices: [actualIndex]
      });

      if (response.success) {
        toast.success(`Fila eliminada. ${response.rows_remaining} filas restantes`);
        await refreshData();
      } else {
        toast.error(response.error_message || 'Error al eliminar fila');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error desconocido');
    } finally {
      setOperationLoading(false);
    }
  };

  // Advanced operations - Replace values (queued)
  const handleReplaceData = () => {
    if (!selectedDataset) return;

    const validReplacements = replacements.filter(r => r.from);
    if (validReplacements.length === 0) {
      toast.error('Proporciona al menos un reemplazo');
      return;
    }

    const columnsText = replaceColumns.length > 0 
      ? `en ${replaceColumns.join(', ')}` 
      : 'en todas las columnas';
    const description = `Reemplazar ${validReplacements.length} valor(es) ${columnsText}`;

    queueBatchOperation('replace', description, {
      replacements: validReplacements,
      columns: replaceColumns
    });

    // Reset form
    setReplacements([{from: '', to: ''}]);
    setReplaceColumns([]);
    setAdvancedDialogOpen(false);
  };

  // Advanced operations - Filter data (queued)
  const handleFilterData = () => {
    if (!selectedDataset || !filterColumn || !filterValue) {
      toast.error('Selecciona columna y valor para filtrar');
      return;
    }

    if (filterMode === 'add_column' && !newFilterColumnName) {
      toast.error('Ingresa un nombre para la columna filtrada');
      return;
    }

    if (filterMode === 'new_file' && !newFilterFileName) {
      toast.error('Ingresa un nombre para el archivo nuevo');
      return;
    }

    if (filterMode === 'add_column') {
      const description = `Crear columna "${newFilterColumnName}" (${filterColumn} ${filterOperation} ${filterValue})`;
      queueBatchOperation('add_filtered_column', description, {
        columnName: newFilterColumnName,
        sourceColumn: filterColumn,
        operation: filterOperation,
        value: filterValue
      });
      setNewFilterColumnName('');
    } else if (filterMode === 'delete_rows') {
      const description = `Filtrar filas donde ${filterColumn} ${filterOperation} ${filterValue}`;
      queueBatchOperation('filter_delete_rows', description, {
        column: filterColumn,
        operation: filterOperation,
        value: filterValue
      });
    } else if (filterMode === 'new_file') {
      const description = `Crear archivo "${newFilterFileName}" (${filterColumn} ${filterOperation} ${filterValue})`;
      queueBatchOperation('filter_new_file', description, {
        column: filterColumn,
        operation: filterOperation,
        value: filterValue,
        newFileName: newFilterFileName
      });
      setNewFilterFileName('');
    }

    // Reset filter form
    setFilterColumn('');
    setFilterValue('');
    setAdvancedDialogOpen(false);
  };

  // Advanced operations - Duplicate columns (queued)
  const handleDuplicateColumns = () => {
    if (!selectedDataset || columnsToDuplicate.length === 0) {
      toast.error('Selecciona columnas para duplicar');
      return;
    }

    const colNames = columnsToDuplicate.map(c => c.sourceColumn).join(', ');
    const description = `Duplicar ${columnsToDuplicate.length} columna(s): ${colNames}`;

    queueBatchOperation('duplicate_column', description, {
      columns: columnsToDuplicate
    });

    setColumnsToDuplicate([]);
    setAdvancedDialogOpen(false);
  };

  // Advanced operations - Delete columns (queued)
  const handleDeleteColumns = () => {
    if (!selectedDataset || columnsToDelete.length === 0) {
      toast.error('Selecciona columnas para eliminar');
      return;
    }

    const description = `Eliminar ${columnsToDelete.length} columna(s): ${columnsToDelete.join(', ')}`;

    queueBatchOperation('delete_column', description, {
      columns: columnsToDelete
    });

    setColumnsToDelete([]);
    setAdvancedDialogOpen(false);
  };


  // Copy column statistics to clipboard
  const copyStatisticsToClipboard = (columnStat: typeof statistics[0]) => {
    if (!selectedDataset || !columnStat) return;

    let text = `Dataset: "${selectedDataset.file_name}"\n`;
    text += `Columna: "${columnStat.column_name}"\n`;
    text += `Tipo: ${columnStat.data_type === 'numeric' ? 'Numérica' : 'Categórica'}\n`;
    text += `Valores: ${columnStat.count?.toLocaleString() ?? 'N/A'}\n`;
    text += `Nulos: ${columnStat.null_count?.toLocaleString() ?? 'N/A'}\n`;
    text += `Únicos: ${columnStat.unique_count?.toLocaleString() ?? 'N/A'}\n`;

    if (columnStat.data_type === 'numeric') {
      text += `Media: ${columnStat.mean?.toFixed(3) ?? 'N/A'}\n`;
      text += `Desv. Est.: ${columnStat.std?.toFixed(3) ?? 'N/A'}\n`;
      text += `Mínimo: ${columnStat.min?.toFixed(3) ?? 'N/A'}\n`;
      text += `Q25: ${columnStat.q25?.toFixed(3) ?? 'N/A'}\n`;
      text += `Mediana (Q50): ${columnStat.q50?.toFixed(3) ?? 'N/A'}\n`;
      text += `Q75: ${columnStat.q75?.toFixed(3) ?? 'N/A'}\n`;
      text += `Máximo: ${columnStat.max?.toFixed(3) ?? 'N/A'}\n`;
    }

    if (columnStat.data_type === 'categorical' && columnStat.top_values && columnStat.top_values.length > 0) {
      text += `\n--- Valores Más Frecuentes ---\n`;
      columnStat.top_values.slice(0, 5).forEach((value, i) => {
        text += `${value}: ${columnStat.top_counts?.[i]?.toLocaleString() ?? 'N/A'}\n`;
      });
    }

    navigator.clipboard.writeText(text).then(() => {
      toast.success('Estadísticas copiadas al portapapeles');
    }).catch((err) => {
      console.error('Error copying to clipboard:', err);
      toast.error('Error al copiar al portapapeles');
    });
  };

  // Load paginated data and statistics
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
      // Reset selected column when dataset changes
      setSelectedColumnName(null);
      // Load statistics on dataset change
      loadStatistics();
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
          <div
            onMouseDown={() => startRangeSelection(row.index)}
            onMouseEnter={() => continueRangeSelection(row.index)}
            className="flex items-center justify-center h-full"
          >
            <input
              type="checkbox"
              className="cursor-pointer pointer-events-none"
              checked={selectedRows.has(row.index)}
              readOnly
            />
          </div>
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
        // Use accessorFn instead of accessorKey to handle column names with dots
        // TanStack Table converts dots to underscores in accessorKey, breaking our column names
        id: colName,
        accessorFn: (row) => row[colName],
        header: colName,
        cell: info => {
          const value = info.getValue();

          // Handle null, undefined, NaN, and non-finite numbers
          if (value === null || value === undefined) {
            return <span className="text-muted-foreground">—</span>;
          }
          if (typeof value === 'number') {
            if (!Number.isFinite(value)) {
              return <span className="text-muted-foreground">—</span>;
            }
            return value.toFixed(4);
          }
          return String(value);
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
        </div>
        <p className="text-sm text-muted-foreground">
          Información y vista previa del dataset
        </p>
      </div>


      {/* Metadata and Column Statistics Card */}
      <Card className="flex-shrink-0">
        <CardContent className="pt-4 space-y-4">
          {/* Dataset Metadata - Single Row */}
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">Archivo:</span>
              <span className="font-medium truncate max-w-[200px]">{selectedDataset.original_filename}</span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-muted-foreground">Creado:</span>
              <span className="font-medium">{formatDate(selectedDataset.created_at)}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">ID:</span>
              <span className="font-mono text-xs bg-muted px-2 py-0.5 rounded truncate max-w-[180px]">{selectedDataset.id}</span>
            </div>
          </div>

          <Separator />

          {/* Column Selection */}
          <div className="flex items-center gap-3">
            <Label htmlFor="column-select" className="text-sm font-semibold flex items-center whitespace-nowrap">
              {/* <Grid3x3 className="mr-1.5 h-4 w-4" /> */}
              Estadisticas por columna ({selectedDataset.column_mappings?.length || 0})
            </Label>
            <Select
              value={selectedColumnName || ''}
              onValueChange={(value) => setSelectedColumnName(value)}
            >
              <SelectTrigger id="column-select" className="w-[280px]">
                <SelectValue placeholder="Seleccionar columna..." />
              </SelectTrigger>
              <SelectContent>
                {selectedDataset.column_mappings?.map((mapping, index) => (
                  <SelectItem key={index} value={mapping.column_name}>
                    <div className="flex items-center gap-2">
                      <span>{mapping.column_name}</span>
                      {mapping.is_coordinate && (
                        <Badge variant="secondary" className="text-xs px-1 py-0">
                          {mapping.mapped_field?.toUpperCase()}
                        </Badge>
                      )}
                      <Badge variant="outline" className="text-xs px-1 py-0">
                        {String(mapping.column_type) === "COLUMN_TYPE_NUMERIC" ? 'Num' : String(mapping.column_type) === "COLUMN_TYPE_CATEGORICAL" ? 'Text' : 'Unused'}
                      </Badge>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {loadingStatistics && (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
            )}
          </div>

          {/* Selected Column Statistics */}
          {selectedColumnName ? (
                  (() => {
                    const columnStat = statistics.find(s => s.column_name === selectedColumnName);
                    const mapping = selectedDataset.column_mappings?.find(m => m.column_name === selectedColumnName);
                    
                    if (!columnStat) {
                      return (
                        <div className="border rounded-lg p-4 text-center text-muted-foreground">
                          {loadingStatistics ? (
                            <div className="flex items-center justify-center">
                              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                              Cargando estadísticas...
                            </div>
                          ) : (
                            'No hay estadísticas disponibles para esta columna'
                          )}
                        </div>
                      );
                    }

                    return (
                      <div className="border rounded-lg p-4 space-y-3">
                        {/* Column Header */}
                        <div className="flex items-center justify-between">
                          <h4 className="font-semibold">{columnStat.column_name}</h4>
                          <div className="flex items-center gap-2">
                            {mapping?.is_coordinate && (
                              <Badge variant="secondary" className="text-xs">
                                Coordenada {mapping.mapped_field?.toUpperCase()}
                              </Badge>
                            )}
                            <Badge variant={columnStat.data_type === 'numeric' ? 'default' : 'secondary'}>
                              {columnStat.data_type === 'numeric' ? 'Numérica' : 'Categórica'}
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0"
                              onClick={() => copyStatisticsToClipboard(columnStat)}
                              title="Copiar estadísticas"
                              aria-label="Copiar estadísticas al portapapeles"
                            >
                              <Copy className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </div>

                        {/* Basic Stats */}
                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div className="bg-muted/50 rounded p-2">
                            <p className="text-muted-foreground text-xs">Valores</p>
                            <p className="font-medium">{columnStat.count?.toLocaleString()}</p>
                          </div>
                          <div className="bg-muted/50 rounded p-2">
                            <p className="text-muted-foreground text-xs">Nulos</p>
                            <p className="font-medium">{columnStat.null_count?.toLocaleString()}</p>
                          </div>
                          <div className="bg-muted/50 rounded p-2">
                            <p className="text-muted-foreground text-xs">Únicos</p>
                            <p className="font-medium">{columnStat.unique_count?.toLocaleString()}</p>
                          </div>
                        </div>

                        {/* Numeric Stats */}
                        {columnStat.data_type === 'numeric' && (
                          <>
                            <Separator />
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 text-sm">
                              <div>
                                <p className="text-muted-foreground text-xs">Media</p>
                                <p className="font-medium font-mono">{columnStat.mean?.toFixed(3)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">Desv. Est.</p>
                                <p className="font-medium font-mono">{columnStat.std?.toFixed(3)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">Mínimo</p>
                                <p className="font-medium font-mono">{columnStat.min?.toFixed(3)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">Máximo</p>
                                <p className="font-medium font-mono">{columnStat.max?.toFixed(3)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">Q25</p>
                                <p className="font-medium font-mono">{columnStat.q25?.toFixed(3)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">Mediana (Q50)</p>
                                <p className="font-medium font-mono">{columnStat.q50?.toFixed(3)}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground text-xs">Q75</p>
                                <p className="font-medium font-mono">{columnStat.q75?.toFixed(3)}</p>
                              </div>
                            </div>
                          </>
                        )}

                        {/* Categorical Stats */}
                        {columnStat.data_type === 'categorical' && columnStat.top_values && columnStat.top_values.length > 0 && (
                          <>
                            <Separator />
                            <div className="text-sm">
                              <p className="text-muted-foreground text-xs mb-2">Valores más frecuentes</p>
                              <div className="space-y-1.5">
                                {columnStat.top_values.slice(0, 5).map((value, i) => (
                                  <div key={i} className="flex justify-between items-center bg-muted/30 rounded px-2 py-1">
                                    <span className="truncate max-w-[250px] font-mono text-xs">{value}</span>
                                    <Badge variant="outline" className="text-xs shrink-0 ml-2">
                                      {columnStat.top_counts?.[i]?.toLocaleString()}
                                    </Badge>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()
                ) : (
                  <div className="border rounded-lg p-4 text-center text-muted-foreground text-sm">
                    Selecciona una columna para ver sus estadísticas
                  </div>
                )}
        </CardContent>
      </Card>

      {/* Data Preview */}
      <Card className="flex-shrink-0 mt-3">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                Datos
                {(pendingEdits.length > 0 || pendingBatchOperations.length > 0) && (
                  <Badge variant="secondary" className="text-xs">
                    {pendingEdits.length + pendingBatchOperations.length} operación(es) pendiente(s)
                  </Badge>
                )}
              </CardTitle>
              <CardDescription className="text-xs">
                Doble clic para editar, clic derecho para más opciones
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {/* Apply/Discard buttons - only show when there are pending operations */}
              {(pendingEdits.length > 0 || pendingBatchOperations.length > 0) && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={discardPendingEdits}
                    disabled={isApplyingEdits}
                  >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Descartar
                  </Button>
                  <Button
                    size="sm"
                    onClick={applyPendingEdits}
                    disabled={isApplyingEdits}
                  >
                    {isApplyingEdits ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <CheckCircle className="mr-2 h-4 w-4" />
                    )}
                    Aplicar ({pendingEdits.length + pendingBatchOperations.length})
                  </Button>
                </>
              )}
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
          </div>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          {operationLoading && (
            <div className="flex items-center justify-center py-2 text-sm text-muted-foreground">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Procesando operación...
            </div>
          )}

          {/* Pending Batch Operations List */}
          {pendingBatchOperations.length > 0 && (
            <div className="border border-yellow-300 dark:border-yellow-700 bg-yellow-50 dark:bg-yellow-900/20 rounded-md p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-yellow-800 dark:text-yellow-200">
                  Operaciones pendientes ({pendingBatchOperations.length})
                </h4>
              </div>
              <div className="space-y-1">
                {pendingBatchOperations.map((op) => (
                  <div
                    key={op.id}
                    className="flex items-center justify-between text-sm bg-white dark:bg-gray-800 rounded px-2 py-1.5 border"
                  >
                    <span className="text-gray-700 dark:text-gray-300">{op.description}</span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 w-6 p-0 text-gray-500 hover:text-red-600"
                      onClick={() => removeBatchOperation(op.id)}
                      title="Quitar operación"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
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
            <>
              {/* Top horizontal scrollbar */}
              <div
                ref={topScrollbarRef}
                className="overflow-x-auto overflow-y-hidden border-t border-x rounded-t"
                style={{ height: '17px' }}
              >
                <div style={{ width: `${tableScrollWidth}px`, height: '1px' }} />
              </div>

              {/* Table container */}
              <div
                ref={tableContainerRef}
                className="h-[500px] overflow-auto border rounded-b border-t-0"
                style={{ userSelect: isSelecting ? 'none' : 'auto' }}
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
                            const isPending = hasPendingEdit(rowIndex, columnId);
                            
                            return (
                              <td 
                                key={cell.id} 
                                className={`px-6 py-3 cursor-pointer hover:bg-accent/50 ${
                                  isPending ? 'bg-yellow-100 dark:bg-yellow-900/30 border-l-2 border-yellow-500' : ''
                                }`}
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
                                title={isPending ? 'Cambio pendiente (no guardado)' : undefined}
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
            </>
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
                <button
                  className="flex items-center gap-2 rounded-sm px-2 py-1.5 text-sm hover:bg-destructive/10 text-destructive w-full text-left"
                  onClick={() => {
                    handleDeleteColumn(contextMenu.target.columnId!);
                    closeContextMenu();
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                  Eliminar columna
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
            <TabsList className="grid w-full grid-cols-3">
              <TabsTrigger value="replace">Reemplazar</TabsTrigger>
              <TabsTrigger value="filter">Filtrar</TabsTrigger>
              <TabsTrigger value="columns">Columnas</TabsTrigger>
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
              <div className="space-y-6">
                {/* Duplicate Columns Section */}
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

                <Separator />

                {/* Delete Columns Section */}
                <div>
                  <Label className="text-base">Eliminar columnas</Label>
                  <p className="text-sm text-muted-foreground mb-3">
                    Selecciona columnas para eliminar
                  </p>
                  
                  <div className="flex flex-wrap gap-2 mt-2 p-3 border rounded-md min-h-[60px]">
                    {previewColumns.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No hay columnas disponibles</p>
                    ) : (
                      previewColumns.map((col: string) => (
                        <Badge
                          key={col}
                          variant={columnsToDelete.includes(col) ? "destructive" : "outline"}
                          className="cursor-pointer"
                          onClick={() => {
                            if (columnsToDelete.includes(col)) {
                              setColumnsToDelete(columnsToDelete.filter(c => c !== col));
                            } else {
                              setColumnsToDelete([...columnsToDelete, col]);
                            }
                          }}
                        >
                          {col}
                        </Badge>
                      ))
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {columnsToDelete.length === 0
                      ? "Sin columnas seleccionadas"
                      : `${columnsToDelete.length} columna(s) seleccionada(s) para eliminar`}
                  </p>
                </div>

                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Esta operación es destructiva y no se puede deshacer. Las columnas serán eliminadas permanentemente.
                  </AlertDescription>
                </Alert>

                <Button 
                  onClick={handleDeleteColumns} 
                  disabled={operationLoading || columnsToDelete.length === 0} 
                  variant="destructive"
                  className="w-full"
                >
                  {operationLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Eliminar Columnas Seleccionadas
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

