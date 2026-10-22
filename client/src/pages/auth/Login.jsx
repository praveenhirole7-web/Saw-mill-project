import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Trees, Lock, Mail, ShieldCheck, ArrowRight, AlertCircle, Clock } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import LanguageSelector from '../../components/common/LanguageSelector';
import './Login.css';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { login, sessionExpired } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to original attempted page or admin home
  const from = location.state?.from?.pathname || '/admin';

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const result = await login(email, password);
      if (result.success) {
        navigate(from, { replace: true });
      } else {
        setErrorMessage(result.error || t('login.loginFailed'));
      }
    } catch {
      setErrorMessage(t('login.networkError'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="admin-login-page">
      <div className="admin-login-card">
        <div className="admin-login-card__language"><LanguageSelector /></div>
        {/* Brand Header */}
        <div className="admin-login-card__header">
          <div className="admin-login-card__logo-box">
            <Trees size={32} className="admin-login-card__logo-icon" />
          </div>
          <h1 className="admin-login-card__title">TimberCraft</h1>
          <p className="admin-login-card__subtitle">{t('login.subtitle')}</p>
        </div>

        {/* Session Expired Alert */}
        {sessionExpired && (
          <div className="admin-login-card__warning-alert" role="alert" style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            padding: '10px 14px',
            marginBottom: '16px',
            borderRadius: '6px',
            background: 'rgba(234, 179, 8, 0.15)',
            border: '1px solid rgba(234, 179, 8, 0.4)',
            color: '#ca8a04',
            fontSize: '13px',
            fontWeight: 500,
          }}>
            <Clock size={16} />
            <span>{t('login.sessionExpired')}</span>
          </div>
        )}

        {/* Security / Architecture Notice */}
        <div className="admin-login-card__security-notice" role="note">
          <ShieldCheck size={18} className="admin-login-card__security-icon" />
          <div>
            <strong>Authorized staff</strong>
            <p>
              Sign in with the account issued by your sawmill administrator.
            </p>
          </div>
        </div>

        <p className="admin-login-card__setup-hint">
          First time setting up the system? An administrator account must be created on the server before staff can sign in. See <code>server/ADMIN_SETUP.md</code>.
        </p>

        {errorMessage && (
          <div className="admin-login-card__error-alert" role="alert">
            <AlertCircle size={16} />
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form className="admin-login-form" onSubmit={handleSubmit}>
          <div className="admin-login-form__group">
            <label htmlFor="login-email" className="admin-login-form__label">
              {t('login.email')}
            </label>
            <div className="admin-login-form__input-wrap">
              <Mail size={16} className="admin-login-form__input-icon" />
              <input
                id="login-email"
                type="email"
                className="admin-login-form__input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@timbercraft.com"
                required
                autoComplete="email"
              />
            </div>
          </div>

          <div className="admin-login-form__group">
            <label htmlFor="login-password" className="admin-login-form__label">
              {t('login.password')}
            </label>
            <div className="admin-login-form__input-wrap">
              <Lock size={16} className="admin-login-form__input-icon" />
              <input
                id="login-password"
                type="password"
                className="admin-login-form__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
            </div>
          </div>

          <button
            type="submit"
            className="admin-login-form__submit-btn"
            disabled={isSubmitting}
          >
            {isSubmitting ? t('login.signingIn') : t('login.signIn')}
            <ArrowRight size={16} />
          </button>
        </form>

        {/* Back to Public Website link */}
        <div className="admin-login-card__footer">
          <Link to="/" className="admin-login-card__back-link">
            &larr; {t('login.returnPublic')}
          </Link>
        </div>
      </div>
    </div>
  );
}
