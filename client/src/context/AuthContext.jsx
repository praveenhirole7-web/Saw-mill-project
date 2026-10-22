import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { apiRequest } from '../services/apiClient';

/**
 * ==============================================================================
 * AUTHENTICATION CONTEXT & SESSION LIFECYCLE
 * ==============================================================================
 * Integrates directly with the Express backend authentication endpoints:
 *   • POST /api/v1/auth/login    - Authenticates credentials & establishes HttpOnly cookies
 *   • POST /api/v1/auth/logout   - Revokes server session & clears cookies
 *   • GET  /api/v1/auth/me       - Restores authenticated identity & permissions
 *   • POST /api/v1/auth/refresh  - Transparent token refresh on access token expiry
 * ==============================================================================
 */

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [currentUser, setCurrentUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [sessionExpired, setSessionExpired] = useState(false);

  useEffect(() => {
    const onExpired = () => {
      setCurrentUser(null);
      setSessionExpired(true);
    };
    window.addEventListener('sawmill:session-expired', onExpired);
    return () => window.removeEventListener('sawmill:session-expired', onExpired);
  }, []);

  /**
   * Check active session against the backend on mount.
   */
  const checkAuthStatus = useCallback(async () => {
    setIsLoading(true);
    try {
      const body = await apiRequest({ url: '/api/v1/auth/me' });
      if (body.success && body.data?.user) {
        setCurrentUser(body.data.user);
        setSessionExpired(false);
      } else {
        setCurrentUser(null);
      }
    } catch (error) {
      if (error.response?.status === 401) {
        setCurrentUser(null);
      } else {
        setAuthError(error.message);
      }
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkAuthStatus();
  }, [checkAuthStatus]);

  const login = async (email, password) => {
    setAuthError(null);
    setSessionExpired(false);

    try {
      const body = await apiRequest({
        url: '/api/v1/auth/login',
        method: 'POST',
        data: { email: email.trim(), password },
        skipAuthRefresh: true
      });

      if (body.success && body.data?.user) {
        const user = body.data.user;
        setCurrentUser(user);
        return { success: true, user };
      }

      const errorMsg = body.error || 'Authentication failed.';
      setAuthError(errorMsg);
      return { success: false, error: errorMsg, code: body.code };
    } catch (error) {
      const errMsg = error.response?.status === 429
        ? 'Too many login attempts. Please wait before trying again.'
        : error.message || 'Could not sign in. Please try again.';
      setAuthError(errMsg);
      return { success: false, error: errMsg };
    }
  };

  const logout = async () => {
    setAuthError(null);
    try {
      await apiRequest({ url: '/api/v1/auth/logout', method: 'POST', data: {}, skipAuthRefresh: true });
      setCurrentUser(null);
      setSessionExpired(false);
    } catch (error) {
      setAuthError(`Unable to sign out securely: ${error.message}`);
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isAuthenticated: Boolean(currentUser),
        isLoading,
        authError,
        sessionExpired,
        login,
        logout,
        checkAuthStatus,
        setAuthError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
