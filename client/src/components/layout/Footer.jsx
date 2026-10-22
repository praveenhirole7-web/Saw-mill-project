import React from 'react';
import { Link } from 'react-router-dom';
import { Trees } from 'lucide-react';
import { useLanguage } from '../../context/LanguageContext';
import './Footer.css';

const currentYear = new Date().getFullYear();

export default function Footer() {
  const { t } = useLanguage();
  return (
    <footer className="site-footer">
      <div className="container site-footer__main">
        <div className="site-footer__grid">
          <div className="site-footer__col site-footer__brand-col">
            <Link to="/" className="site-footer__logo" style={{ textDecoration: 'none' }}>
              <div className="site-footer__logo-icon"><Trees size={24} /></div>
              <div>
                <span className="site-footer__brand-name">TimberCraft</span>
                <span className="site-footer__brand-tag">Saw Mill</span>
              </div>
            </Link>
            <p className="site-footer__about-text">
              {t('footer.about')}
            </p>
          </div>
          <div className="site-footer__col">
            <h4 className="site-footer__col-title">{t('footer.browse')}</h4>
            <ul className="site-footer__links">
              <li><Link to="/">{t('nav.home')}</Link></li>
              <li><Link to="/about">{t('nav.about')}</Link></li>
              <li><Link to="/products">{t('footer.availableProducts')}</Link></li>
              <li><Link to="/services">{t('nav.services')}</Link></li>
            </ul>
          </div>
          <div className="site-footer__col">
            <h4 className="site-footer__col-title">{t('footer.getInTouch')}</h4>
            <ul className="site-footer__links">
              <li><Link to="/quote">{t('footer.askPrice')}</Link></li>
              <li><Link to="/contact">{t('nav.contact')}</Link></li>
              <li><Link to="/privacy">{t('footer.privacy')}</Link></li>
              <li><Link to="/terms">{t('footer.terms')}</Link></li>
            </ul>
          </div>
        </div>
      </div>
      <div className="site-footer__bottom">
        <div className="container site-footer__bottom-inner">
          <p className="site-footer__copyright">&copy; {currentYear} TimberCraft Saw Mill.</p>
        </div>
      </div>
    </footer>
  );
}
