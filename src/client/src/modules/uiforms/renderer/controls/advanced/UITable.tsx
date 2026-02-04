/**
 * UI Table - tabela danych
 */

import React, { useState, useMemo } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TablePagination,
  TableSortLabel,
  Checkbox,
  Paper,
  Box,
} from '@mui/material';
import { UIControlModel, UITableProperties, UITableColumn } from '../../../models';
import { useUIBinding } from '../../../binding';
import { registerControl, CONTROL_METADATA } from '../registry';

interface UITableProps {
  control: UIControlModel;
  children?: React.ReactNode;
}

type Order = 'asc' | 'desc';

export const UITable: React.FC<UITableProps> = ({ control }) => {
  const props = (control.properties || {}) as unknown as UITableProperties;

  // Binding do danych
  const { value: boundData } = useUIBinding<unknown[]>(
    props.dataBinding ? { field: props.dataBinding, mode: 'oneWay' } : undefined
  );

  const data = boundData ?? props.data ?? [];
  const columns = props.columns || [];

  // Stan paginacji
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState(props.pageSize ?? 10);

  // Stan sortowania
  const [orderBy, setOrderBy] = useState<string | null>(null);
  const [order, setOrder] = useState<Order>('asc');

  // Stan selekcji
  const [selected, setSelected] = useState<Set<number>>(new Set());

  // Sortowanie
  const sortedData = useMemo(() => {
    if (!orderBy || !props.sortable) return data;

    return [...data].sort((a, b) => {
      const aValue = (a as Record<string, unknown>)[orderBy];
      const bValue = (b as Record<string, unknown>)[orderBy];

      if (aValue === bValue) return 0;
      if (aValue === null || aValue === undefined) return 1;
      if (bValue === null || bValue === undefined) return -1;

      const comparison = aValue < bValue ? -1 : 1;
      return order === 'asc' ? comparison : -comparison;
    });
  }, [data, orderBy, order, props.sortable]);

  // Paginacja
  const paginatedData = useMemo(() => {
    if (!props.pagination) return sortedData;
    return sortedData.slice(page * rowsPerPage, page * rowsPerPage + rowsPerPage);
  }, [sortedData, page, rowsPerPage, props.pagination]);

  // Handlers
  const handleSort = (columnId: string) => {
    const column = columns.find(c => c.id === columnId);
    if (!column?.sortable && props.sortable !== true) return;

    const isAsc = orderBy === columnId && order === 'asc';
    setOrder(isAsc ? 'desc' : 'asc');
    setOrderBy(columnId);
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelected(new Set(data.map((_, i) => i)));
    } else {
      setSelected(new Set());
    }
  };

  const handleSelectRow = (index: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (props.selectMode === 'single') {
        next.clear();
        next.add(index);
      } else {
        if (next.has(index)) {
          next.delete(index);
        } else {
          next.add(index);
        }
      }
      return next;
    });
  };

  // Format wartości
  const formatValue = (value: unknown, column: UITableColumn): React.ReactNode => {
    if (value === null || value === undefined) return '-';

    switch (column.format) {
      case 'number':
        return typeof value === 'number' ? value.toLocaleString() : String(value);
      case 'date':
        if (value instanceof Date) return value.toLocaleDateString();
        if (typeof value === 'string') return new Date(value).toLocaleDateString();
        return String(value);
      case 'currency':
        return typeof value === 'number'
          ? value.toLocaleString('pl-PL', { style: 'currency', currency: 'PLN' })
          : String(value);
      case 'boolean':
        return value ? 'Tak' : 'Nie';
      default:
        return String(value);
    }
  };

  const getCellValue = (row: unknown, column: UITableColumn): unknown => {
    if (typeof row !== 'object' || row === null) return null;
    return (row as Record<string, unknown>)[column.field];
  };

  return (
    <Box sx={{ width: '100%' }}>
      <TableContainer component={Paper} variant="outlined">
        <Table size={props.size || 'medium'} stickyHeader={props.stickyHeader}>
          <TableHead>
            <TableRow>
              {props.selectable && (
                <TableCell padding="checkbox">
                  {props.selectMode !== 'single' && (
                    <Checkbox
                      indeterminate={selected.size > 0 && selected.size < data.length}
                      checked={data.length > 0 && selected.size === data.length}
                      onChange={handleSelectAll}
                    />
                  )}
                </TableCell>
              )}
              {columns.map((column) => (
                <TableCell
                  key={column.id}
                  align={column.align || 'left'}
                  style={{
                    width: column.width,
                    minWidth: column.minWidth,
                  }}
                >
                  {(column.sortable || props.sortable) ? (
                    <TableSortLabel
                      active={orderBy === column.id}
                      direction={orderBy === column.id ? order : 'asc'}
                      onClick={() => handleSort(column.id)}
                    >
                      {column.header}
                    </TableSortLabel>
                  ) : (
                    column.header
                  )}
                </TableCell>
              ))}
            </TableRow>
          </TableHead>
          <TableBody>
            {paginatedData.map((row, index) => {
              const actualIndex = props.pagination ? page * rowsPerPage + index : index;
              const isSelected = selected.has(actualIndex);

              return (
                <TableRow
                  key={actualIndex}
                  hover={props.hover !== false}
                  selected={isSelected}
                  onClick={props.selectable ? () => handleSelectRow(actualIndex) : undefined}
                  sx={{ cursor: props.selectable ? 'pointer' : undefined }}
                >
                  {props.selectable && (
                    <TableCell padding="checkbox">
                      <Checkbox checked={isSelected} />
                    </TableCell>
                  )}
                  {columns.map((column) => (
                    <TableCell key={column.id} align={column.align || 'left'}>
                      {formatValue(getCellValue(row, column), column)}
                    </TableCell>
                  ))}
                </TableRow>
              );
            })}
            {paginatedData.length === 0 && (
              <TableRow>
                <TableCell
                  colSpan={columns.length + (props.selectable ? 1 : 0)}
                  align="center"
                  sx={{ py: 4, color: 'text.secondary' }}
                >
                  Brak danych
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {props.pagination && (
        <TablePagination
          component="div"
          count={data.length}
          page={page}
          onPageChange={(_, newPage) => setPage(newPage)}
          rowsPerPage={rowsPerPage}
          onRowsPerPageChange={(e) => {
            setRowsPerPage(parseInt(e.target.value, 10));
            setPage(0);
          }}
          rowsPerPageOptions={props.pageSizeOptions || [5, 10, 25, 50]}
          labelRowsPerPage="Wierszy na stronę:"
          labelDisplayedRows={({ from, to, count }) => `${from}-${to} z ${count}`}
        />
      )}
    </Box>
  );
};

// Rejestracja
registerControl('table', UITable, CONTROL_METADATA.table);
