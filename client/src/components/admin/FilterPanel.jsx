import React, { useState } from 'react';
import { Filter, X, RotateCcw } from 'lucide-react';
import './FilterPanel.css';

export default function FilterPanel({
  filters = [], // Array of { key, label, options: [{ label, value }], value, onChange }
  onReset,
  className = '',
  totalResults
}) {
  const [isOpen, setIsOpen] = useState(false);

  const activeCount = filters.filter(
    (f) => f.value && f.value !== '' && f.value !== 'all' && f.value !== 'All'
  ).length;

  return (
    <div className={`admin-filter-panel ${className}`}>
      <div className="admin-filter-panel__bar">
        <button
          type="button"
          className={`admin-filter-panel__toggle ${isOpen ? 'admin-filter-panel__toggle--open' : ''} ${
            activeCount > 0 ? 'admin-filter-panel__toggle--active' : ''
          }`}
          onClick={() => setIsOpen(!isOpen)}
          aria-expanded={isOpen}
        >
          <Filter size={15} />
          <span>Filters</span>
          {activeCount > 0 && (
            <span className="admin-filter-panel__badge">{activeCount}</span>
          )}
        </button>

        {activeCount > 0 && (
          <button
            type="button"
            className="admin-filter-panel__reset"
            onClick={onReset}
            title="Reset all filters"
          >
            <RotateCcw size={13} />
            <span>Reset</span>
          </button>
        )}

        {totalResults !== undefined && (
          <span className="admin-filter-panel__results">
            {totalResults} {totalResults === 1 ? 'record' : 'records'} found
          </span>
        )}
      </div>

      {isOpen && (
        <div className="admin-filter-panel__dropdown-container">
          <div className="admin-filter-panel__grid">
            {filters.map((filter) => (
              <div key={filter.key} className="admin-filter-panel__group">
                <label className="admin-filter-panel__label">{filter.label}</label>
                <select
                  className="admin-filter-panel__select"
                  value={filter.value}
                  onChange={(e) => filter.onChange(e.target.value)}
                >
                  {filter.options.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          <div className="admin-filter-panel__footer">
            <span className="admin-filter-panel__hint">
              Filters apply dynamically to table records
            </span>
            <button
              type="button"
              className="admin-filter-panel__close-btn"
              onClick={() => setIsOpen(false)}
            >
              <X size={14} /> Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
