import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, ShieldCheck, HardHat, Trees, UserPlus } from 'lucide-react';
import './Login.css';

export default function LoginSelection() {
  return (
    <main className="login-selection-page">
      <div className="login-selection-shell">
        <header className="login-selection-header">
          <div className="admin-login-card__logo-box"><Trees size={30} className="admin-login-card__logo-icon" /></div>
          <p className="login-selection-eyebrow">TIMBERCRAFT SAW MILL</p>
          <h1>Welcome back</h1>
          <p>Choose the sign in that matches your role.</p>
        </header>
        <div className="login-selection-cards">
          <article className="login-selection-card">
            <div className="login-selection-icon"><ShieldCheck size={27} /></div>
            <h2>Admin Login</h2>
            <p>Manage your complete sawmill business.</p>
            <Link className="login-selection-button" to="/admin/login">Login as Admin <ArrowRight size={17} /></Link>
          </article>
          <article className="login-selection-card">
            <div className="login-selection-icon login-selection-icon--staff"><UserPlus size={27} /></div>
            <h2>Staff Registration</h2>
            <p>Request an individual staff account. Access starts after approval.</p>
            <Link className="login-selection-button" to="/staff/register">Request an account <ArrowRight size={17} /></Link>
          </article>
          <article className="login-selection-card">
            <div className="login-selection-icon login-selection-icon--staff"><HardHat size={27} /></div>
            <h2>Staff Login</h2>
            <p>Access your assigned work and daily operations.</p>
            <Link className="login-selection-button" to="/staff/login">Login as Staff <ArrowRight size={17} /></Link>
          </article>
        </div>
        <Link to="/" className="login-selection-home">Return to the public website</Link>
      </div>
    </main>
  );
}
