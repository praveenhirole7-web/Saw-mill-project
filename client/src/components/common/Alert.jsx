import React from 'react';
import { CheckCircle2, AlertTriangle, AlertCircle, Info, X } from 'lucide-react';
import './Form.css';

export default function Alert({
  type = 'info',
  title,
  message,
  onClose,
  className = ''
}) {
  const icons = {
    success: <CheckCircle2 size={20} className="alert-icon" />,
    warning: <AlertTriangle size={20} className="alert-icon" />,
    error: <AlertCircle size={20} className="alert-icon" />,
    info: <Info size={20} className="alert-icon" />
  };

  return (
    <div className={`timber-alert timber-alert--${type} ${className}`} role="alert">
      <div className="timber-alert__icon-box">
        {icons[type] || icons.info}
      </div>
      <div className="timber-alert__content">
        {title && <h4 className="timber-alert__title">{title}</h4>}
        <div className="timber-alert__msg">{message}</div>
      </div>
      {onClose && (
        <button 
          type="button" 
          onClick={onClose} 
          className="timber-alert__close" 
          aria-label="Dismiss alert"
        >
          <X size={16} />
        </button>
      )}
    </div>
  );
}
