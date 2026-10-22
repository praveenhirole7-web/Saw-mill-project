import React from 'react';
import './Form.css';

export default function FormTextarea({
  id,
  name,
  label,
  value,
  onChange,
  onBlur,
  placeholder = '',
  rows = 4,
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

      <textarea
        id={id}
        name={name}
        rows={rows}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
        className="form-textarea"
        {...props}
      ></textarea>

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
