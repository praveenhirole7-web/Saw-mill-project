import React from 'react';
import { NavLink, Link } from 'react-router-dom';
import {
  Trees,
  LayoutDashboard,
  Boxes,
  ShoppingCart,
  Users,
  Factory,
  Scissors,
  ClipboardList,
  Receipt,
  CreditCard,
  TrendingDown,
  HardHat,
  Truck,
  MessagesSquare,
  BarChart3,
  ShieldCheck,
  Settings,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  LogOut,
  X
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import './Sidebar.css';

const NAV_ITEMS = [
  { key: 'summary', path: '/admin', icon: LayoutDashboard, end: true },
  { key: 'stock', path: '/admin/inventory', icon: Boxes },
  { key: 'woodTypes', path: '/admin/wood-types', icon: Trees },
  { key: 'purchases', path: '/admin/purchases', icon: ShoppingCart },
  { key: 'customers', path: '/admin/customers', icon: Users },
  { key: 'sellers', path: '/admin/suppliers', icon: Factory },
  { key: 'cutting', path: '/admin/cutting-jobs', icon: Scissors },
  { key: 'orders', path: '/admin/sales-orders', icon: ClipboardList },
  { key: 'invoices', path: '/admin/invoices', icon: Receipt },
  { key: 'payments', path: '/admin/payments', icon: CreditCard },
  { key: 'costs', path: '/admin/expenses', icon: TrendingDown },
  { key: 'employees', path: '/admin/employees', icon: HardHat },
  { key: 'deliveries', path: '/admin/deliveries', icon: Truck },
  { key: 'enquiries', path: '/admin/enquiries', icon: MessagesSquare },
  { key: 'reports', path: '/admin/reports', icon: BarChart3 },
  { key: 'users', path: '/admin/users', icon: ShieldCheck },
  { key: 'settings', path: '/admin/settings', icon: Settings }
];

export default function Sidebar({
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile
}) {
  const { currentUser, logout } = useAuth();
  const { t } = useLanguage();

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div
          className="admin-sidebar-mobile-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside
        className={`admin-sidebar ${isCollapsed ? 'admin-sidebar--collapsed' : ''} ${
          isMobileOpen ? 'admin-sidebar--mobile-open' : ''
        }`}
        aria-label={t('admin.navigationLabel')}
      >
        {/* Brand Header */}
        <div className="admin-sidebar__header">
          <Link to="/admin" className="admin-sidebar__brand" onClick={onCloseMobile}>
            <div className="admin-sidebar__logo-box">
              <Trees size={22} className="admin-sidebar__logo-icon" />
            </div>
            {!isCollapsed && (
              <div className="admin-sidebar__brand-text">
                <span className="admin-sidebar__brand-title">TimberCraft</span>
                <span className="admin-sidebar__brand-badge">SAWMILL</span>
              </div>
            )}
          </Link>

          {/* Desktop Collapse Toggle */}
          <button
            type="button"
            className="admin-sidebar__collapse-toggle desktop-only"
            onClick={onToggleCollapse}
            aria-label={t(isCollapsed ? 'admin.expandSidebar' : 'admin.collapseSidebar')}
            title={t(isCollapsed ? 'admin.expandSidebar' : 'admin.collapseSidebar')}
          >
            {isCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>

          {/* Mobile Close Button */}
          <button
            type="button"
            className="admin-sidebar__close-mobile mobile-only"
            onClick={onCloseMobile}
            aria-label={t('admin.closeNavigation')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Navigation Links Scroll Container */}
        <nav className="admin-sidebar__nav">
          {!isCollapsed && (
            <div className="admin-sidebar__section-label">{t('admin.millWork')}</div>
          )}
          <ul className="admin-sidebar__menu">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              return (
                <li key={item.path} className="admin-sidebar__item">
                  <NavLink
                    to={item.path}
                    end={item.end}
                    className={({ isActive }) =>
                      `admin-sidebar__link ${isActive ? 'admin-sidebar__link--active' : ''}`
                    }
                    onClick={onCloseMobile}
                    title={isCollapsed ? t(`admin.${item.key}`) : undefined}
                  >
                    <Icon size={19} className="admin-sidebar__icon" />
                    {!isCollapsed && (
                      <span className="admin-sidebar__text">{t(`admin.${item.key}`)}</span>
                    )}
                    {!isCollapsed && item.badge && (
                      <span
                        className={`admin-sidebar__badge admin-sidebar__badge--${item.badgeType || 'neutral'}`}
                      >
                        {item.badge}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Sidebar Footer: User details, Website Link, Logout */}
        <div className="admin-sidebar__footer">
          {/* Public Website Link */}
          <Link
            to="/"
            className="admin-sidebar__public-link"
            title={t('admin.openCustomerWebsite')}
          >
            <ExternalLink size={16} />
            {!isCollapsed && <span>{t('admin.openWebsite')}</span>}
          </Link>

          {/* User Mini Card */}
          {currentUser && (
            <div className="admin-sidebar__user">
              {currentUser.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="admin-sidebar__user-avatar"
                />
              ) : (
                <div className="admin-sidebar__user-placeholder">
                  {currentUser.name.charAt(0)}
                </div>
              )}

              {!isCollapsed && (
                <div className="admin-sidebar__user-info">
                  <span className="admin-sidebar__user-name">{currentUser.name}</span>
                  <span className="admin-sidebar__user-role">{currentUser.role}</span>
                </div>
              )}

              {!isCollapsed && (
                <button
                  type="button"
                  className="admin-sidebar__logout-btn"
                  onClick={logout}
                  title={t('admin.logout')}
                  aria-label={t('admin.logout')}
                >
                  <LogOut size={16} />
                </button>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
