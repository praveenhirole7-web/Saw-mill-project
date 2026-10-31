import React, { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { Trees, Lock, Mail, ShieldCheck, ArrowRight, AlertCircle, Clock, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLanguage } from '../../context/LanguageContext';
import LanguageSelector from '../../components/common/LanguageSelector';
import './Login.css';

export default function Login() {
  const isAdminLogin = useLocation().pathname === '/admin/login';
  const expectedRole = isAdminLogin ? 'admin' : 'staff';
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const { login, sessionExpired } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const location = useLocation();

  // Redirect to original attempted page or admin home
  const from = location.state?.from?.pathname || (isAdminLogin ? '/admin' : '/staff/dashboard');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setIsSubmitting(true);

    try {
      const result = await login(identifier, password, expectedRole);
      if (result.success) {
        navigate(['admin', 'owner'].includes(result.user.role) ? from : '/staff/dashboard', { replace: true });
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
          <p className="admin-login-card__subtitle">{isAdminLogin ? 'Administrator access' : 'Staff access'}</p>
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
            <strong>{isAdminLogin ? 'Administrator access' : 'Staff access'}</strong>
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
              {isAdminLogin ? 'Username or email' : 'Employee ID or username'}
            </label>
            <div className="admin-login-form__input-wrap">
              <Mail size={16} className="admin-login-form__input-icon" />
              <input
                id="login-email"
                type="text"
                className="admin-login-form__input"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={isAdminLogin ? 'Username or email' : 'Employee ID or username'}
                required
                autoComplete="username"
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
                type={showPassword ? 'text' : 'password'}
                className="admin-login-form__input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
                autoComplete="current-password"
              />
              <button type="button" className="admin-login-password-toggle" aria-label={showPassword ? 'Hide password' : 'Show password'} onClick={() => setShowPassword(value => !value)}>
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
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
          <Link to="/login" className="admin-login-card__back-link">
            &larr; Choose login type
          </Link>
        </div>
      </div>
    </div>
  );
}
