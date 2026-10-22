import React from 'react';
import './Form.css';

export default function FormInput({
  id,
  name,
  label,
  type = 'text',
  value,
  onChange,
  onBlur,
  placeholder = '',
  required = false,
  error = '',
  helperText = '',
  disabled = false,
  min,
  max,
  step,
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

      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        onBlur={onBlur}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        aria-invalid={!!error}
        aria-describedby={error ? `${id}-error` : helperText ? `${id}-helper` : undefined}
        className="form-input"
        {...props}
      />

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
