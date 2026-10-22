import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import './Modal.css';

export default function Modal({
  isOpen,
  onClose,
  title,
  subtitle,
  children,
  footer,
  size = 'md', // 'sm' | 'md' | 'lg' | 'xl'
  closeOnEsc = true,
  closeOnBackdrop = true,
  className = ''
}) {
  const modalRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (closeOnEsc && e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Prevent body scroll when open
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = originalOverflow;
    };
  }, [isOpen, closeOnEsc, onClose]);

  if (!isOpen) return null;

  return (
    <div
      className="admin-modal-backdrop"
      onClick={closeOnBackdrop ? onClose : undefined}
      role="presentation"
    >
      <div
        className={`admin-modal admin-modal--${size} ${className}`}
        ref={modalRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="admin-modal__header">
          <div className="admin-modal__titles">
            <h2 id="admin-modal-title" className="admin-modal__title">
              {title}
            </h2>
            {subtitle && <p className="admin-modal__subtitle">{subtitle}</p>}
          </div>
          <button
            type="button"
            className="admin-modal__close-btn"
            onClick={onClose}
            aria-label="Close modal dialog"
          >
            <X size={20} />
          </button>
        </div>

        <div className="admin-modal__body">{children}</div>

        {footer && <div className="admin-modal__footer">{footer}</div>}
      </div>
    </div>
  );
}
