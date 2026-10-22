import React, { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';
import EmptyState from './EmptyState';
import './DataTable.css';

export default function DataTable({
  columns = [], // Array of { key, label, sortable, render, width, align }
  data = [],
  keyField = 'id',
  isLoading = false,
  emptyTitle = 'No records found',
  emptyMessage = 'There are no records matching your current query.',
  onRowClick,
  selectable = false,
  selectedKeys = [],
  onSelectionChange,
  className = ''
}) {
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Handle column header sort
  const handleSort = (columnKey) => {
    setSortConfig((prev) => {
      if (prev.key === columnKey) {
        if (prev.direction === 'asc') return { key: columnKey, direction: 'desc' };
        return { key: null, direction: 'asc' }; // Reset to unsorted
      }
      return { key: columnKey, direction: 'asc' };
    });
  };

  // Sort data if sortConfig.key is active
  const sortedData = useMemo(() => {
    if (!sortConfig.key) return data;

    return [...data].sort((a, b) => {
      const valA = a[sortConfig.key];
      const valB = b[sortConfig.key];

      if (valA === undefined || valA === null) return 1;
      if (valB === undefined || valB === null) return -1;

      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortConfig.direction === 'asc' ? valA - valB : valB - valA;
      }

      const strA = String(valA).toLowerCase();
      const strB = String(valB).toLowerCase();

      if (strA < strB) return sortConfig.direction === 'asc' ? -1 : 1;
      if (strA > strB) return sortConfig.direction === 'asc' ? 1 : -1;
      return 0;
    });
  }, [data, sortConfig]);

  // Handle Select All
  const isAllSelected = data.length > 0 && selectedKeys.length === data.length;
  const isPartiallySelected = selectedKeys.length > 0 && selectedKeys.length < data.length;

  const handleSelectAll = (e) => {
    if (!onSelectionChange) return;
    if (e.target.checked) {
      onSelectionChange(data.map((row) => row[keyField]));
    } else {
      onSelectionChange([]);
    }
  };

  const handleSelectRow = (e, rowKey) => {
    e.stopPropagation();
    if (!onSelectionChange) return;
    if (selectedKeys.includes(rowKey)) {
      onSelectionChange(selectedKeys.filter((k) => k !== rowKey));
    } else {
      onSelectionChange([...selectedKeys, rowKey]);
    }
  };

  if (isLoading) {
    return (
      <div className="admin-data-table-card">
        <LoadingSpinner message="Retrieving sawmill records..." />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="admin-data-table-card">
        <EmptyState title={emptyTitle} description={emptyMessage} />
      </div>
    );
  }

  return (
    <div className={`admin-data-table-card ${className}`}>
      <div className="admin-data-table-wrapper">
        <table className="admin-data-table">
          <thead>
            <tr>
              {selectable && (
                <th className="admin-data-table__th-select">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    ref={(el) => el && (el.indeterminate = isPartiallySelected)}
                    onChange={handleSelectAll}
                    aria-label="Select all rows"
                  />
                </th>
              )}

              {columns.map((col) => {
                const isSorted = sortConfig.key === col.key;
                return (
                  <th
                    key={col.key}
                    style={{ width: col.width, textAlign: col.align || 'left' }}
                    className={`admin-data-table__th ${col.sortable ? 'admin-data-table__th--sortable' : ''}`}
                    aria-sort={col.sortable ? (isSorted ? (sortConfig.direction === 'asc' ? 'ascending' : 'descending') : 'none') : undefined}
                  >
                    {col.sortable ? (
                      <button
                        type="button"
                        className="admin-data-table__sort-button"
                        style={{ justifyContent: col.align === 'right' ? 'flex-end' : 'flex-start' }}
                        onClick={() => handleSort(col.key)}
                        aria-label={`Sort by ${col.label}`}
                      >
                        <span>{col.label}</span>
                        <span className="admin-data-table__sort-icon">
                          {!isSorted && <ArrowUpDown size={13} opacity={0.4} />}
                          {isSorted && sortConfig.direction === 'asc' && (
                            <ArrowUp size={13} className="admin-data-table__sort-active" />
                          )}
                          {isSorted && sortConfig.direction === 'desc' && (
                            <ArrowDown size={13} className="admin-data-table__sort-active" />
                          )}
                        </span>
                      </button>
                    ) : (
                      <span>{col.label}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {sortedData.map((row, index) => {
              const rowKey = row[keyField] || index;
              const isSelected = selectedKeys.includes(rowKey);
              const isClickable = Boolean(onRowClick);

              return (
                <tr
                  key={rowKey}
                  className={`admin-data-table__tr ${isSelected ? 'admin-data-table__tr--selected' : ''} ${
                    isClickable ? 'admin-data-table__tr--clickable' : ''
                  }`}
                  onClick={isClickable ? () => onRowClick(row) : undefined}
                >
                  {selectable && (
                    <td className="admin-data-table__td-select">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => handleSelectRow(e, rowKey)}
                        onClick={(e) => e.stopPropagation()}
                        aria-label={`Select row ${rowKey}`}
                      />
                    </td>
                  )}

                  {columns.map((col) => (
                    <td
                      key={col.key}
                      style={{ textAlign: col.align || 'left' }}
                      className="admin-data-table__td"
                    >
                      {col.render ? col.render(row[col.key], row, index) : row[col.key] ?? '—'}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
