import React from 'react';
import './LoadingSpinner.css';

export default function LoadingSpinner({
  size = 'md', // 'sm' | 'md' | 'lg'
  message = 'Loading sawmill data...',
  fullPage = false,
  className = ''
}) {
  const content = (
    <div className={`admin-spinner-wrap admin-spinner-wrap--${size} ${className}`} role="status">
      <div className="admin-spinner">
        <div className="admin-spinner__ring"></div>
        <div className="admin-spinner__ring-inner"></div>
      </div>
      {message && <p className="admin-spinner__message">{message}</p>}
      <span className="sr-only">Loading...</span>
    </div>
  );

  if (fullPage) {
    return <div className="admin-spinner-fullpage">{content}</div>;
  }

  return content;
}
