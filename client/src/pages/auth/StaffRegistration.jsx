import React, { useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  Trees,
  UserPlus,
  User,
  Phone,
  Mail,
  Briefcase,
  IdCard,
  Lock,
  Eye,
  EyeOff,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Shield,
  Layers,
  FileText,
  Clock
} from 'lucide-react';
import { apiRequest } from '../../services/apiClient';
import './StaffRegistration.css';

const DEPARTMENTS = [
  'Timber Yard & Log Ingestion',
  'Primary Sawing & Carriage Operations',
  'Resaw & Dimensional Planks Processing',
  'Wood Seasoning & Moisture Inspection',
  'Quality Grading & Finishing',
  'Wholesale Orders & Commercial Sales',
  'Customer Billing & GST Invoicing',
  'Fleet Logistics & Timber Delivery',
  'Saw Blade Filing & Equipment Maintenance',
  'Administrative & Yard Operations'
];

export default function StaffRegistration() {
  const [form, setForm] = useState({
    name: '',
    employeeId: '',
    phone: '',
    email: '',
    department: '',
    customDepartment: '',
    username: '',
    password: '',
    confirmPassword: '',
    acknowledgedTerms: false
  });

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [busy, setBusy] = useState(false);

  // Dynamic Password Strength Meter
  const passwordStrength = useMemo(() => {
    const pw = form.password;
    if (!pw) return { score: 0, label: 'None', className: '' };
    let score = 0;
    if (pw.length >= 12) score += 1;
    if (/[A-Z]/.test(pw)) score += 1;
    if (/[0-9]/.test(pw)) score += 1;
    if (/[^A-Za-z0-9]/.test(pw)) score += 1;

    if (score <= 1) return { score: 1, label: 'Weak', className: 'sr-strength-bar--weak' };
    if (score === 2 || score === 3) return { score: 2, label: 'Fair', className: 'sr-strength-bar--fair' };
    return { score: 3, label: 'Strong', className: 'sr-strength-bar--good' };
  }, [form.password]);

  const update = (key) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
    setForm((prev) => ({ ...prev, [key]: value }));
    if (error) setError('');
  };

  const finalDepartment = form.department === 'Other'
    ? form.customDepartment.trim()
    : form.department;

  const submit = async (event) => {
    event.preventDefault();
    setError('');

    if (!finalDepartment) {
      setError('Please select or specify your department.');
      return;
    }

    if (form.password.length < 12) {
      setError('Security requirement: Password must be at least 12 characters.');
      return;
    }

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match. Please verify your entries.');
      return;
    }

    setBusy(true);
    try {
      await apiRequest({
        url: '/api/v1/auth/staff-registration',
        method: 'POST',
        data: {
          name: form.name.trim(),
          employeeId: form.employeeId ? parseInt(form.employeeId, 10) : null,
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          department: finalDepartment,
          username: form.username.trim(),
          password: form.password
        },
        skipAuthRefresh: true
      });
      setSubmitted(true);
    } catch (e) {
      setError(
        e.response?.data?.error ||
        e.response?.data?.message ||
        e.message ||
        'Unable to complete registration. Please check your network connection.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="sr-enterprise-viewport">
      {/* ─────────────────────────────────────────────────────────────
          LEFT PANEL: Enterprise Sawmill Branding & Security Standards
         ───────────────────────────────────────────────────────────── */}
      <aside className="sr-brand-panel">
        <div className="sr-brand-top">
          <div className="sr-brand-badge">
            <Shield size={14} /> Sawmill Enterprise Portal
          </div>

          <div className="sr-brand-logo-row">
            <div className="sr-brand-logo-icon">
              <Trees size={26} />
            </div>
            <div className="sr-brand-logo-text">
              <h2>TimberCraft</h2>
              <p>Industrial Sawmill ERP</p>
            </div>
          </div>

          <div className="sr-brand-hero">
            <h1>Workforce Registration & Governance</h1>
            <p>
              Join the central operational hub for timber intake, volumetric sawing lines, commercial wholesale orders, and automated billing.
            </p>
          </div>

          <div className="sr-trust-list">
            <div className="sr-trust-item">
              <div className="sr-trust-icon-box">
                <ShieldCheck size={18} />
              </div>
              <div className="sr-trust-text">
                <h4>Role-Based Access Control</h4>
                <p>Isolated job authorizations prevent unauthorized access to sensitive financial and supplier ledgers.</p>
              </div>
            </div>

            <div className="sr-trust-item">
              <div className="sr-trust-icon-box">
                <Layers size={18} />
              </div>
              <div className="sr-trust-text">
                <h4>Dual-Tier Admin Verification</h4>
                <p>All newly provisioned credentials remain safely quarantined until formally approved by mill leadership.</p>
              </div>
            </div>

            <div className="sr-trust-item">
              <div className="sr-trust-icon-box">
                <FileText size={18} />
              </div>
              <div className="sr-trust-text">
                <h4>Immutable Audit Logging</h4>
                <p>Every operational transaction, stock movement, and cutting order maintains full chronological traceability.</p>
              </div>
            </div>
          </div>
        </div>

        <footer className="sr-brand-footer">
          <span>&copy; {new Date().getFullYear()} TimberCraft ERP Systems</span>
          <span>Security Standard v2.4</span>
        </footer>
      </aside>

      {/* ─────────────────────────────────────────────────────────────
          RIGHT PANEL: Refined Registration Form
         ───────────────────────────────────────────────────────────── */}
      <main className="sr-form-panel">
        <div className="sr-top-bar">
          <Link to="/login" className="sr-back-home">
            <ArrowLeft size={16} /> Back to Sign In Options
          </Link>
          <div className="sr-top-signin-cta">
            Already verified?
            <Link to="/staff/login" className="sr-top-signin-link">
              Staff Login
            </Link>
          </div>
        </div>

        <div className="sr-form-container">
          {submitted ? (
            /* Success Summary State */
            <div className="sr-success-container">
              <div className="sr-success-badge-icon">
                <CheckCircle2 size={36} />
              </div>
              <h1 className="sr-success-title">Registration Request Logged</h1>
              <p className="sr-success-desc">
                Your credentials have been securely provisioned in <strong>PENDING</strong> status. An administrator must verify your application before access is enabled.
              </p>

              <div className="sr-success-summary-card">
                <div className="sr-summary-row">
                  <span className="sr-summary-label">Employee Name</span>
                  <span className="sr-summary-value">{form.name}</span>
                </div>
                <div className="sr-summary-row">
                  <span className="sr-summary-label">Assigned Username</span>
                  <span className="sr-summary-value" style={{ fontFamily: 'monospace' }}>{form.username}</span>
                </div>
                <div className="sr-summary-row">
                  <span className="sr-summary-label">Operational Department</span>
                  <span className="sr-summary-value">{finalDepartment}</span>
                </div>
                <div className="sr-summary-row">
                  <span className="sr-summary-label">Account Status</span>
                  <span className="sr-status-pill-pending">
                    <Clock size={12} /> Pending Approval
                  </span>
                </div>
              </div>

              <div className="sr-success-actions">
                <Link to="/staff/login" className="sr-btn-primary">
                  Proceed to Staff Login <ArrowRight size={15} />
                </Link>
                <Link to="/login" className="sr-btn-secondary">
                  Back to Main Menu
                </Link>
              </div>
            </div>
          ) : (
            /* Main Form */
            <div>
              <header className="sr-form-header">
                <span className="sr-form-eyebrow">
                  <UserPlus size={14} /> Employee Self-Service Onboarding
                </span>
                <h1 className="sr-form-title">Staff Account Registration</h1>
                <p className="sr-form-subtitle">
                  Fill in your official mill identification and contact details to request internal ERP access.
                </p>
              </header>

              <div className="sr-notice-card">
                <ShieldCheck size={20} className="sr-notice-icon" />
                <div className="sr-notice-text">
                  <p>
                    <strong>Administrative Oversight:</strong> For compliance with sawmill accounting and security policies, new staff accounts are strictly prohibited from viewing company data until an authorized administrator assigns role permissions.
                  </p>
                </div>
              </div>

              <form onSubmit={submit} noValidate>
                <div className="sr-form-sections">
                  {/* Section 1: Identity & Contact */}
                  <div className="sr-section-block">
                    <div className="sr-section-heading">
                      <User size={15} /> 1. Identity & Contact Information
                    </div>

                    <div className="sr-row">
                      <div className="sr-field">
                        <label className="sr-label" htmlFor="sr-name">
                          Full Name <span className="sr-req">*</span>
                        </label>
                        <div className="sr-input-wrap">
                          <User size={16} className="sr-input-icon" />
                          <input
                            id="sr-name"
                            className="sr-input"
                            type="text"
                            required
                            placeholder="e.g. Rajesh Gowda"
                            value={form.name}
                            onChange={update('name')}
                            autoComplete="name"
                          />
                        </div>
                      </div>

                      <div className="sr-field">
                        <label className="sr-label" htmlFor="sr-phone">
                          Phone Number <span className="sr-req">*</span>
                        </label>
                        <div className="sr-input-wrap">
                          <Phone size={16} className="sr-input-icon" />
                          <input
                            id="sr-phone"
                            className="sr-input"
                            type="tel"
                            required
                            placeholder="+91 98450 12345"
                            value={form.phone}
                            onChange={update('phone')}
                            autoComplete="tel"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="sr-row">
                      <div className="sr-field">
                        <label className="sr-label" htmlFor="sr-email">
                          Work / Contact Email <span className="sr-opt">(Optional)</span>
                        </label>
                        <div className="sr-input-wrap">
                          <Mail size={16} className="sr-input-icon" />
                          <input
                            id="sr-email"
                            className="sr-input"
                            type="email"
                            placeholder="name@sawmill.com"
                            value={form.email}
                            onChange={update('email')}
                            autoComplete="email"
                          />
                        </div>
                      </div>

                      <div className="sr-field">
                        <label className="sr-label" htmlFor="sr-employeeId">
                          Employee Punch / HR ID <span className="sr-opt">(If Assigned)</span>
                        </label>
                        <div className="sr-input-wrap">
                          <IdCard size={16} className="sr-input-icon" />
                          <input
                            id="sr-employeeId"
                            className="sr-input"
                            type="number"
                            placeholder="e.g. 104"
                            value={form.employeeId}
                            onChange={update('employeeId')}
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Section 2: Operational Assignment */}
                  <div className="sr-section-block">
                    <div className="sr-section-heading">
                      <Briefcase size={15} /> 2. Operational Assignment
                    </div>

                    <div className="sr-row sr-row--single">
                      <div className="sr-field">
                        <label className="sr-label" htmlFor="sr-department">
                          Primary Department / Job Role <span className="sr-req">*</span>
                        </label>
                        <div className="sr-input-wrap">
                          <Briefcase size={16} className="sr-input-icon" />
                          <select
                            id="sr-department"
                            className="sr-input sr-select"
                            value={form.department}
                            onChange={update('department')}
                            required
                          >
                            <option value="">Select your operational department...</option>
                            {DEPARTMENTS.map((dept) => (
                              <option key={dept} value={dept}>
                                {dept}
                              </option>
                            ))}
                            <option value="Other">Other / Custom Job Function...</option>
                          </select>
                        </div>
                      </div>

                      {form.department === 'Other' && (
                        <div className="sr-field">
                          <label className="sr-label" htmlFor="sr-customDept">
                            Specify Job Title / Operational Function <span className="sr-req">*</span>
                          </label>
                          <input
                            id="sr-customDept"
                            className="sr-input"
                            type="text"
                            required
                            placeholder="e.g. Timber Yard Scaler & Log Grader"
                            value={form.customDepartment}
                            onChange={update('customDepartment')}
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Section 3: Credentials */}
                  <div className="sr-section-block">
                    <div className="sr-section-heading">
                      <Lock size={15} /> 3. System Credentials
                    </div>

                    <div className="sr-row sr-row--single">
                      <div className="sr-field">
                        <label className="sr-label" htmlFor="sr-username">
                          Desired Username <span className="sr-req">*</span>
                        </label>
                        <div className="sr-input-wrap">
                          <User size={16} className="sr-input-icon" />
                          <input
                            id="sr-username"
                            className="sr-input"
                            type="text"
                            required
                            placeholder="e.g. rajesh_timber"
                            value={form.username}
                            onChange={update('username')}
                            autoComplete="username"
                          />
                        </div>
                        <span className="sr-field-hint">Used for all subsequent terminal and mobile logins.</span>
                      </div>
                    </div>

                    <div className="sr-row">
                      <div className="sr-field">
                        <label className="sr-label" htmlFor="sr-pw">
                          Password <span className="sr-req">*</span>
                        </label>
                        <div className="sr-input-wrap">
                          <Lock size={16} className="sr-input-icon" />
                          <input
                            id="sr-pw"
                            className="sr-input sr-input--toggle"
                            type={showPassword ? 'text' : 'password'}
                            required
                            minLength={12}
                            placeholder="At least 12 characters"
                            value={form.password}
                            onChange={update('password')}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="sr-toggle-btn"
                            onClick={() => setShowPassword(!showPassword)}
                            tabIndex={-1}
                            aria-label={showPassword ? 'Hide password' : 'Show password'}
                          >
                            {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>

                        {/* Password Strength Indicator */}
                        {form.password && (
                          <div className="sr-strength-meter">
                            <div className="sr-strength-bars">
                              <div className={`sr-strength-bar ${passwordStrength.score >= 1 ? passwordStrength.className : ''}`} />
                              <div className={`sr-strength-bar ${passwordStrength.score >= 2 ? passwordStrength.className : ''}`} />
                              <div className={`sr-strength-bar ${passwordStrength.score >= 3 ? passwordStrength.className : ''}`} />
                            </div>
                            <span className="sr-strength-label">{passwordStrength.label}</span>
                          </div>
                        )}
                      </div>

                      <div className="sr-field">
                        <label className="sr-label" htmlFor="sr-confirm">
                          Confirm Password <span className="sr-req">*</span>
                        </label>
                        <div className="sr-input-wrap">
                          <Lock size={16} className="sr-input-icon" />
                          <input
                            id="sr-confirm"
                            className="sr-input sr-input--toggle"
                            type={showConfirmPassword ? 'text' : 'password'}
                            required
                            minLength={12}
                            placeholder="Re-enter password"
                            value={form.confirmPassword}
                            onChange={update('confirmPassword')}
                            autoComplete="new-password"
                          />
                          <button
                            type="button"
                            className="sr-toggle-btn"
                            onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                            tabIndex={-1}
                            aria-label={showConfirmPassword ? 'Hide password' : 'Show password'}
                          >
                            {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        {form.confirmPassword && form.password !== form.confirmPassword && (
                          <span className="sr-field-hint" style={{ color: '#ef4444' }}>
                            Passwords do not match.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Error Banner */}
                {error && (
                  <div className="sr-error-banner" role="alert">
                    <AlertCircle size={18} style={{ flexShrink: 0 }} />
                    <span>{error}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  className="sr-submit-btn"
                  disabled={busy}
                >
                  <UserPlus size={18} />
                  {busy ? 'Verifying & Submitting…' : 'Submit Registration for Verification'}
                </button>

                <div className="sr-footer-row">
                  Have an approved employee profile? <Link to="/staff/login">Log In to Staff Dashboard</Link>
                </div>
              </form>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
