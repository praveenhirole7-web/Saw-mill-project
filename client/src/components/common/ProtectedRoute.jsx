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
export default function ProtectedRoute({ children }) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return children;
}
