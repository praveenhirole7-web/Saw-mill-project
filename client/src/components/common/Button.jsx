import React from 'react';
import './Button.css';

/**
 * Reusable Button component
 * @param {string} variant - 'primary' | 'wood' | 'outline' | 'white' | 'ghost'
 * @param {string} size - 'sm' | 'md' | 'lg'
 * @param {boolean} fullWidth - whether button takes 100% width
 * @param {React.ReactNode} icon - optional icon element
 * @param {string} href - if provided, renders an <a> anchor tag
 */
export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon = null,
  iconPosition = 'right',
  href,
  className = '',
  type = 'button',
  onClick,
  disabled = false,
  ...props
}) {
  const classNames = [
    'timber-btn',
    `timber-btn--${variant}`,
    `timber-btn--${size}`,
    fullWidth ? 'timber-btn--full' : '',
    disabled ? 'timber-btn--disabled' : '',
    className
  ].filter(Boolean).join(' ');

  const content = (
    <>
      {icon && iconPosition === 'left' && <span className="timber-btn__icon">{icon}</span>}
      <span className="timber-btn__text">{children}</span>
      {icon && iconPosition === 'right' && <span className="timber-btn__icon">{icon}</span>}
    </>
  );

  if (href) {
    return (
      <a 
        href={href} 
        className={classNames} 
        onClick={onClick} 
        {...props}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type={type}
      className={classNames}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {content}
    </button>
  );
}
