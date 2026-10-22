import React from 'react';
import { Search, X } from 'lucide-react';
import './SearchBar.css';

export default function SearchBar({
  value = '',
  onChange,
  placeholder = 'Search logs, orders, cut jobs...',
  className = '',
  autoFocus = false,
  id = 'admin-search-bar'
}) {
  const handleClear = () => {
    if (onChange) {
      onChange({ target: { value: '' } });
    }
  };

  return (
    <div className={`admin-search-bar ${className}`}>
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <Search size={16} className="admin-search-bar__icon" />
      <input
        id={id}
        type="text"
        className="admin-search-bar__input"
        placeholder={placeholder}
        value={value}
        onChange={onChange}
        autoFocus={autoFocus}
      />
      {value && (
        <button
          type="button"
          className="admin-search-bar__clear"
          onClick={handleClear}
          aria-label="Clear search input"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
