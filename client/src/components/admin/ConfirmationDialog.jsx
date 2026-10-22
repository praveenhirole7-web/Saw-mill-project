import React from 'react';
import { AlertTriangle, AlertCircle, Info } from 'lucide-react';
import Modal from './Modal';
import './ConfirmationDialog.css';

export default function ConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title = 'Confirm Action',
  message = 'Are you sure you want to proceed with this operation? This action may not be reversible.',
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger', // 'danger' | 'warning' | 'primary'
  isLoading = false
}) {
  const getIcon = () => {
    switch (variant) {
      case 'warning':
        return <AlertTriangle size={24} className="admin-confirm-dialog__icon admin-confirm-dialog__icon--warning" />;
      case 'primary':
        return <Info size={24} className="admin-confirm-dialog__icon admin-confirm-dialog__icon--primary" />;
      case 'danger':
      default:
        return <AlertCircle size={24} className="admin-confirm-dialog__icon admin-confirm-dialog__icon--danger" />;
    }
  };

  const footer = (
    <>
      <button
        type="button"
        className="btn btn-outline admin-confirm-dialog__btn-cancel"
        onClick={onClose}
        disabled={isLoading}
      >
        {cancelLabel}
      </button>
      <button
        type="button"
        className={`btn admin-confirm-dialog__btn-confirm admin-confirm-dialog__btn-confirm--${variant}`}
        onClick={onConfirm}
        disabled={isLoading}
      >
        {isLoading ? 'Processing...' : confirmLabel}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      size="sm"
      title={title}
      footer={footer}
      className="admin-confirm-dialog-modal"
    >
      <div className="admin-confirm-dialog__content">
        <div className="admin-confirm-dialog__icon-box">
          {getIcon()}
        </div>
        <p className="admin-confirm-dialog__message">{message}</p>
      </div>
    </Modal>
  );
}
