import React, { useState, useEffect, useRef } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { 
  Trees, 
  Menu, 
  X, 
  FileText, 
  ChevronRight,
  LogIn
} from 'lucide-react';
import Button from '../common/Button';
import LanguageSelector from '../common/LanguageSelector';
import { useLanguage } from '../../context/LanguageContext';
import './Header.css';

export default function Header() {
  const { t } = useLanguage();
  const [isScrolled, setIsScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const location = useLocation();
  const mobileToggleRef = useRef(null);
  const mobileDrawerRef = useRef(null);
  const wasMobileMenuOpen = useRef(false);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 30);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile drawer on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [location.pathname]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      if (wasMobileMenuOpen.current) mobileToggleRef.current?.focus();
      wasMobileMenuOpen.current = false;
      return undefined;
    }

    wasMobileMenuOpen.current = true;
    mobileDrawerRef.current?.querySelector('button')?.focus();
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setMobileMenuOpen(false);
      if (event.key === 'Tab') {
        const focusable = mobileDrawerRef.current?.querySelectorAll('a[href], button:not([disabled]), select:not([disabled])');
        if (!focusable?.length) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const navLinks = [
    { key: 'home', path: '/' },
    { key: 'about', path: '/about' },
    { key: 'products', path: '/products' },
    { key: 'services', path: '/services' },
    { key: 'quote', path: '/quote' },
    { key: 'contact', path: '/contact' }
  ];

  return (
    <>
      {/* Main Sticky Header */}
      <header className={`site-header ${isScrolled ? 'site-header--scrolled' : ''}`}>
        <div className="container site-header__inner">
          
          {/* Brand Logo & Name */}
          <Link to="/" className="site-logo">
            <div className="site-logo__icon-box">
              <Trees size={26} className="site-logo__icon" />
            </div>
            <div className="site-logo__text">
              <span className="site-logo__title">TimberCraft</span>
              <span className="site-logo__subtitle">Saw Mill</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="desktop-nav" aria-label={t('nav.main')}>
            <ul className="desktop-nav__list">
              {navLinks.map((link) => (
                <li key={link.key} className="desktop-nav__item">
                  <NavLink 
                    to={link.path} 
                    className={({ isActive }) => 
                      `desktop-nav__link ${isActive ? 'desktop-nav__link--active' : ''}`
                    }
                    end={link.path === '/'}
                  >
                    {t(`nav.${link.key}`)}
                  </NavLink>
                </li>
              ))}
            </ul>
          </nav>

          {/* Header Action Button */}
          <div className="site-header__actions">
            <LanguageSelector className="language-selector--header" />
            <Link to="/login" className="site-header__staff-link">
              <LogIn size={16} aria-hidden="true" />
              <span>{t('nav.staffLogin')}</span>
            </Link>
            <Link to="/quote">
              <Button 
                variant="wood" 
                size="sm" 
                icon={<FileText size={16} />}
                className="site-header__quote-btn"
              >
                {t('nav.quote')}
              </Button>
            </Link>

            {/* Mobile Toggle Button */}
            <button
              type="button"
              className="mobile-toggle"
              ref={mobileToggleRef}
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label={mobileMenuOpen ? t('nav.closeMenu') : t('nav.openMenu')}
              aria-expanded={mobileMenuOpen}
            >
              {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
            </button>
          </div>

        </div>
      </header>

      {/* Mobile Drawer Navigation */}
      <button
        type="button"
        className={`mobile-drawer-backdrop ${mobileMenuOpen ? 'mobile-drawer-backdrop--open' : ''}`}
        onClick={() => setMobileMenuOpen(false)}
        aria-label={t('nav.closeNavigation')}
        tabIndex={-1}
      />
      <aside
        ref={mobileDrawerRef}
        className={`mobile-drawer ${mobileMenuOpen ? 'mobile-drawer--open' : ''}`}
        role="dialog"
        aria-label={t('nav.mobile')}
        aria-modal={mobileMenuOpen ? 'true' : undefined}
        aria-hidden={!mobileMenuOpen}
        inert={!mobileMenuOpen}
      >
        <div className="mobile-drawer__header">
          <div className="site-logo">
            <div className="site-logo__icon-box">
              <Trees size={22} className="site-logo__icon" />
            </div>
            <div className="site-logo__text">
              <span className="site-logo__title">TimberCraft</span>
              <span className="site-logo__subtitle">Saw Mill</span>
            </div>
          </div>
          <button 
            type="button"
            className="mobile-drawer__close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label={t('admin.closeNavigation')}
          >
            <X size={20} />
          </button>
        </div>

        <nav className="mobile-nav" aria-label="Mobile Navigation">
          <ul className="mobile-nav__list">
            {navLinks.map((link) => (
              <li key={link.key} className="mobile-nav__item">
                <NavLink 
                  to={link.path} 
                  className={({ isActive }) => 
                    `mobile-nav__link ${isActive ? 'mobile-nav__link--active' : ''}`
                  }
                  end={link.path === '/'}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span>{t(`nav.${link.key}`)}</span>
                  <ChevronRight size={18} opacity={0.5} />
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="mobile-drawer__footer">
          <LanguageSelector className="language-selector--mobile" />
          <Link to="/login" className="site-header__staff-link site-header__staff-link--mobile" onClick={() => setMobileMenuOpen(false)}>
            <LogIn size={16} aria-hidden="true" />
            <span>{t('nav.staffLogin')}</span>
          </Link>
          <Link to="/quote" onClick={() => setMobileMenuOpen(false)}>
            <Button 
              variant="wood" 
              size="md" 
              fullWidth
              icon={<FileText size={18} />}
            >
              {t('nav.quote')}
            </Button>
          </Link>

        </div>
      </aside>
    </>
  );
}
