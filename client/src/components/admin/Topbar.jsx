import React, { useState, useRef, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Menu,
  ChevronDown,
  User,
  Settings,
  LogOut,
  ExternalLink,
  ShieldCheck
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import SearchBar from './SearchBar';
import LanguageSelector from '../common/LanguageSelector';
import { useLanguage } from '../../context/LanguageContext';
import './Topbar.css';

export default function Topbar({ onOpenMobileSidebar }) {
  const { currentUser, logout } = useAuth();
  const { t } = useLanguage();
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const [logoutError, setLogoutError] = useState('');
  const [globalSearch, setGlobalSearch] = useState('');

  const userMenuRef = useRef(null);
  const navigate = useNavigate();

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSearchSubmit = (e) => {
    if (e.key === 'Enter' && globalSearch.trim()) {
      navigate(`/admin/inventory?search=${encodeURIComponent(globalSearch.trim())}`);
    }
  };

  const handleLogout = async () => {
    setLogoutError('');
    try {
      await logout();
      setIsUserMenuOpen(false);
    } catch (error) {
      setLogoutError(error.message || 'Could not log out. Please try again.');
    }
  };

  return (
    <header className="admin-topbar">
      <div className="admin-topbar__left">
        {/* Mobile Hamburger Button */}
        <button
          type="button"
          className="admin-topbar__hamburger mobile-only"
          onClick={onOpenMobileSidebar}
          aria-label={t('admin.openNavigation')}
        >
          <Menu size={22} />
        </button>

      </div>

      <div className="admin-topbar__center desktop-only">
        {/* Global Search Bar */}
        <div onKeyDown={handleSearchSubmit}>
          <SearchBar
            value={globalSearch}
            onChange={(e) => setGlobalSearch(e.target.value)}
            placeholder={t('admin.search')}
            className="admin-topbar__search"
          />
        </div>
      </div>

      <div className="admin-topbar__right">
        <LanguageSelector className="language-selector--admin" />
        {/* User Profile Menu */}
        {currentUser && (
          <div className="admin-topbar__user-menu" ref={userMenuRef}>
            <button
              type="button"
              className="admin-topbar__user-trigger"
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              aria-expanded={isUserMenuOpen}
            >
              {currentUser.avatar ? (
                <img
                  src={currentUser.avatar}
                  alt={currentUser.name}
                  className="admin-topbar__avatar"
                />
              ) : (
                <div className="admin-topbar__avatar-fallback">
                  {currentUser.name.charAt(0)}
                </div>
              )}
              <div className="admin-topbar__user-meta desktop-only">
                <span className="admin-topbar__user-name">{currentUser.name}</span>
                <span className="admin-topbar__user-role">{currentUser.role}</span>
              </div>
              <ChevronDown size={14} className="admin-topbar__chevron desktop-only" />
            </button>

            {isUserMenuOpen && (
              <div className="admin-topbar__dropdown">
                {logoutError && <p className="alert alert-error" role="alert">{logoutError}</p>}
                <div className="admin-topbar__dropdown-header">
                  <p className="admin-topbar__dropdown-name">{currentUser.name}</p>
                  <p className="admin-topbar__dropdown-email">{currentUser.email}</p>
                  <span className="admin-topbar__dropdown-role-badge">
                    <ShieldCheck size={12} /> {currentUser.role}
                  </span>
                </div>

                <div className="admin-topbar__dropdown-divider" />

                <Link
                  to="/admin/settings"
                  className="admin-topbar__dropdown-item"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <Settings size={16} />
                  <span>{t('admin.millSettings')}</span>
                </Link>

                <Link
                  to="/admin/users"
                  className="admin-topbar__dropdown-item"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <User size={16} />
                  <span>{t('admin.users')}</span>
                </Link>

                <Link
                  to="/"
                  className="admin-topbar__dropdown-item"
                  onClick={() => setIsUserMenuOpen(false)}
                >
                  <ExternalLink size={16} />
                  <span>{t('admin.openCustomerWebsite')}</span>
                </Link>

                <div className="admin-topbar__dropdown-divider" />

                <button
                  type="button"
                  className="admin-topbar__dropdown-item admin-topbar__dropdown-item--danger"
                  onClick={handleLogout}
                >
                  <LogOut size={16} />
                  <span>{t('admin.logout')}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
