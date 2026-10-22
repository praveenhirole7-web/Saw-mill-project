import React from 'react';
import { Settings } from 'lucide-react';
import './AdminPages.css';

export default function SettingsPage() {
  return (
    <div className="admin-subpage">
      <div className="admin-subpage-header">
        <div className="admin-subpage-header__left">
          <h1 className="admin-subpage-title">Mill Settings</h1>
          <p className="admin-subpage-subtitle">
            Configuration changes are unavailable until the server provides a persistent settings API.
          </p>
        </div>
      </div>
      <div className="card" role="status">
        <div className="dashboard-card__header">
          <div className="dashboard-card__title-wrap">
            <Settings size={18} className="text-forest" />
            <h2 className="dashboard-card__title">Server configuration unavailable</h2>
          </div>
        </div>
        <p>
          No changes have been saved. Tax rates and other business rules must be configured through an
          authorized server-side workflow; this page will not store temporary browser-only values.
        </p>
      </div>
    </div>
  );
}
