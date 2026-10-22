import React from 'react';
import { PackageOpen } from 'lucide-react';
import './EmptyState.css';

export default function EmptyState({
  icon: Icon = PackageOpen,
  title = 'No records found',
  description = 'No records match your search. Try changing the filters or add a new record.',
  actionLabel,
  onAction,
  className = ''
}) {
  return (
    <div className={`admin-empty-state ${className}`}>
      <div className="admin-empty-state__icon-wrap">
        <Icon size={38} className="admin-empty-state__icon" />
      </div>
      <h3 className="admin-empty-state__title">{title}</h3>
      <p className="admin-empty-state__desc">{description}</p>
      {actionLabel && onAction && (
        <button
          type="button"
          className="admin-empty-state__action-btn"
          onClick={onAction}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}
