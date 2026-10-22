import React from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import './PageHeader.css';

export default function PageHeader({ 
  eyebrow, 
  title, 
  subtitle, 
  breadcrumbs = [],
  badge = null 
}) {
  return (
    <div className="page-header">
      <div className="container page-header__inner">
        
        {/* Breadcrumb Navigation */}
        <nav className="breadcrumbs" aria-label="Breadcrumbs">
          <Link to="/" className="breadcrumb-item">Home</Link>
          {breadcrumbs.map((crumb, idx) => (
            <React.Fragment key={idx}>
              <ChevronRight size={14} className="breadcrumb-separator" />
              {crumb.link ? (
                <Link to={crumb.link} className="breadcrumb-item">{crumb.label}</Link>
              ) : (
                <span className="breadcrumb-item breadcrumb-item--active" aria-current="page">
                  {crumb.label}
                </span>
              )}
            </React.Fragment>
          ))}
        </nav>

        {/* Header Content */}
        <div className="page-header__content">
          {eyebrow && <span className="page-header__eyebrow">{eyebrow}</span>}
          {badge && <span className="page-header__badge">{badge}</span>}
          <h1 className="page-header__title">{title}</h1>
          {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
        </div>

      </div>
    </div>
  );
}
