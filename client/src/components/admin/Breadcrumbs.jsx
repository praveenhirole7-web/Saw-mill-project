import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Home } from 'lucide-react';
import './Breadcrumbs.css';

const ROUTE_LABELS = {
  admin: 'Business Summary',
  inventory: 'Wood Stock',
  purchases: 'Wood Purchases',
  customers: 'Customers',
  suppliers: 'Wood Sellers',
  'cutting-jobs': 'Wood Cutting Work',
  'sales-orders': 'Customer Orders',
  invoices: 'Invoices',
  payments: 'Payments',
  expenses: 'Business Costs',
  employees: 'Employees',
  deliveries: 'Delivery Details',
  reports: 'Business Reports',
  users: 'Manage Users',
  settings: 'Settings'
};

export default function Breadcrumbs({ customCrumbs }) {
  const location = useLocation();

  if (customCrumbs && customCrumbs.length > 0) {
    return (
      <nav aria-label="Breadcrumb" className="breadcrumbs-nav">
        <ol className="breadcrumbs-list">
          <li className="breadcrumb-item">
            <Link to="/admin" className="breadcrumb-link breadcrumb-home">
              <Home size={14} />
            </Link>
          </li>
          {customCrumbs.map((crumb, idx) => {
            const isLast = idx === customCrumbs.length - 1;
            return (
              <li key={idx} className="breadcrumb-item">
                <ChevronRight size={13} className="breadcrumb-separator" />
                {isLast || !crumb.path ? (
                  <span className="breadcrumb-current" aria-current="page">
                    {crumb.label}
                  </span>
                ) : (
                  <Link to={crumb.path} className="breadcrumb-link">
                    {crumb.label}
                  </Link>
                )}
              </li>
            );
          })}
        </ol>
      </nav>
    );
  }

  // Derive automatically from URL segments
  const pathSegments = location.pathname.split('/').filter(Boolean);
  // Example: ['admin', 'cutting-jobs']

  return (
    <nav aria-label="Breadcrumb" className="breadcrumbs-nav">
      <ol className="breadcrumbs-list">
        <li className="breadcrumb-item">
          <Link to="/admin" className="breadcrumb-link breadcrumb-home" title="Sawmill Admin Home">
            <Home size={14} />
            <span>Business Summary</span>
          </Link>
        </li>

        {pathSegments.slice(1).map((segment, idx) => {
          const isLast = idx === pathSegments.length - 2;
          const label = ROUTE_LABELS[segment] || segment.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
          const targetPath = '/' + pathSegments.slice(0, idx + 2).join('/');

          return (
            <li key={segment} className="breadcrumb-item">
              <ChevronRight size={13} className="breadcrumb-separator" />
              {isLast ? (
                <span className="breadcrumb-current" aria-current="page">
                  {label}
                </span>
              ) : (
                <Link to={targetPath} className="breadcrumb-link">
                  {label}
                </Link>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
