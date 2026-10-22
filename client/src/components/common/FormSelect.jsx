import React from 'react';
import './Form.css';

export default function FormSelect({
  id,
  name,
  label,
  value,
  onChange,
  onBlur,
  options = [],
  placeholder = 'Select an option...',
  required = false,
  error = '',
  helperText = '',
  disabled = false,
  className = '',
  ...props
}) {
  return (
    <div className={`form-group ${error ? 'form-group--error' : ''} ${className}`}>
      {label && (
        <label htmlFor={id} className="form-label">
          {label} {required && <span className="form-required" aria-hidden="true">*</span>}
        </label>
      )}

      <select
        id={id}
        name={name}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        required={required}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
        className="form-select"
        {...props}
      >
        {placeholder && (
          <option value="" disabled>
            {placeholder}
          </option>
        )}
        {options.map((opt, idx) => {
          const optValue = typeof opt === 'string' ? opt : opt.value;
          const optLabel = typeof opt === 'string' ? opt : opt.label;
          return (
            <option key={idx} value={optValue}>
              {optLabel}
            </option>
          );
        })}
      </select>

      {error ? (
        <span id={`${id}-error`} className="form-error" role="alert">
          {error}
        </span>
      ) : helperText ? (
        <span id={`${id}-helper`} className="form-helper">
          {helperText}
        </span>
      ) : null}
    </div>
  );
}
