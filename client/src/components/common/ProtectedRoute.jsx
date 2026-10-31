import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

/**
 * ==============================================================================
 * PROTECTED ROUTE (FRONTEND LEVEL)
 * ==============================================================================
 * Evaluates current user authentication in client context.
 * If unauthenticated, safely redirects to /login preserving the intended target URL.
 *
 * NOTE: Frontend route protection is purely for UX and workflow control.
 * It is not an alternative to backend JWT authentication and ACL authorization.
 * ==============================================================================
 */
export default function ProtectedRoute({ children, role = 'admin', permission }) {
  const { isAuthenticated, currentUser, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <div className="app-route-loading" role="status">Checking your session…</div>;
  if (!isAuthenticated) {
    return <Navigate to={role === 'staff' ? '/staff/login' : '/admin/login'} state={{ from: location }} replace />;
  }

  if (role === 'admin' && !['admin', 'owner'].includes(currentUser?.role)) return <Navigate to="/staff/dashboard" replace />;
  if (role === 'staff' && ['admin', 'owner'].includes(currentUser?.role)) return <Navigate to="/admin" replace />;
  if (permission && !currentUser?.permissions?.includes(permission) &&
      !currentUser?.permissions?.includes(permission.replace(/^view_/, 'manage_'))) {
    return <Navigate to="/staff/dashboard" replace />;
  }

  return children;
}
