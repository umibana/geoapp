import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Database, Info, Grid3x3, Calendar } from 'lucide-react';
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

const ROWS_PER_PAGE = 1000;

const DatasetInfoViewer: React.FC = () => {
  const selectedDataset = useBrushStore((state) => state.selectedDataset);
  const [previewData, setPreviewData] = useState<DataRow[]>([]);
  const [previewColumns, setPreviewColumns] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [totalRows, setTotalRows] = useState(0);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: ROWS_PER_PAGE,
  });
  const tableContainerRef = React.useRef<HTMLDivElement>(null);

  // Load paginated data
  useEffect(() => {
    if (!selectedDataset) return;

    const loadPreview = async () => {
      try {
        setLoading(true);
        setError(null);

        // Calculate offset based on current page
        const offset = pagination.pageIndex * pagination.pageSize;

        // Use the new getDatasetTableData endpoint for efficient pagination
        const response = await window.autoGrpc.getDatasetTableData({
          dataset_id: selectedDataset.id,
          limit: pagination.pageSize,
          offset: offset,
          columns: [] // Empty array means fetch ALL numeric columns
        });

        if (response.success && response.rows) {
          // Set column names from response
          setPreviewColumns(response.column_names);
          setTotalRows(response.total_rows);

          // Convert response rows to DataRow format
          const rows: DataRow[] = response.rows.map((row: { values: Record<string, number> }, index: number) => {
            const dataRow: DataRow = { rowNumber: offset + index + 1 };
            // Add all column values from the row
            for (const [colName, value] of Object.entries(row.values)) {
              dataRow[colName] = value as number;
            }
            return dataRow;
          });

          setPreviewData(rows);
        } else {
          setError(response.error_message || 'Error al cargar datos');
        }
      } catch (err) {
        console.error('Error loading preview:', err);
        setError('Error al cargar la vista previa');
      } finally {
        setLoading(false);
      }
    };

    loadPreview();
  }, [selectedDataset, pagination.pageIndex, pagination.pageSize]);

  // Define table columns dynamically based on preview columns
  const columns = useMemo<ColumnDef<DataRow>[]>(() => {
    const cols: ColumnDef<DataRow>[] = [
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
  }, [previewColumns]);

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
                          {mapping.column_type === 1 ? 'Num' : mapping.column_type === 2 ? 'Text' : 'Unused'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Data Preview */}
      <Card className="flex-shrink-0 mt-3">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Vista Previa</CardTitle>
          <CardDescription className="text-xs">
            {pagination.pageIndex * pagination.pageSize + 1} - {Math.min((pagination.pageIndex + 1) * pagination.pageSize, totalRows)} de {totalRows.toLocaleString()} filas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-2">
          {previewData.length === 0 && !loading ? (
            <div className="text-center py-8 text-muted-foreground">
              No se pudo cargar la vista previa
            </div>
          ) : (
            <div
              ref={tableContainerRef}
              className="h-[500px] overflow-auto border rounded"
            >
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-muted z-10">
                  {table.getHeaderGroups().map(headerGroup => (
                    <tr key={headerGroup.id}>
                      {headerGroup.headers.map((header, index) => (
                        <th
                          key={header.id}
                          className="px-6 py-3 text-left text-sm font-medium text-muted-foreground border-b whitespace-nowrap"
                          style={{ 
                            width: index === 0 ? '100px' : 'auto',
                            minWidth: index === 0 ? '100px' : '180px'
                          }}
                        >
                          {header.isPlaceholder
                            ? null
                            : flexRender(
                                header.column.columnDef.header,
                                header.getContext()
                              )}
                        </th>
                      ))}
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
                          {row.getVisibleCells().map((cell, index) => (
                            <td 
                              key={cell.id} 
                              className="px-6 py-3"
                              style={{ 
                                width: index === 0 ? '100px' : 'auto',
                                minWidth: index === 0 ? '100px' : '180px'
                              }}
                            >
                              {flexRender(
                                cell.column.columnDef.cell,
                                cell.getContext()
                              )}
                            </td>
                          ))}
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
    </div>
  );
};

export default DatasetInfoViewer;

