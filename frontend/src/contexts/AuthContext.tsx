import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { User } from '../types/api';
import { AuthContextType } from '../types/auth';
import { authService } from '../services/authService';
import { dashboardService } from '../services/dashboardService';

const STORAGE_KEY = 'updatepilot_auth_user';

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const cached = localStorage.getItem(STORAGE_KEY);
      return cached ? (JSON.parse(cached) as User) : null;
    } catch {
      return null;
    }
  });

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);

  // Check authentication status on mount by querying the protected dashboard endpoint
  const checkAuth = useCallback(async (): Promise<boolean> => {
    try {
      await dashboardService.getDashboard();
      setIsAuthenticated(true);
      // If we have a cached user in local storage, restore it
      const cached = localStorage.getItem(STORAGE_KEY);
      if (cached) {
        try {
          setUser(JSON.parse(cached) as User);
        } catch {
          // Ignore parse errors
        }
      }
      return true;
    } catch {
      setUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem(STORAGE_KEY);
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void checkAuth();
  }, [checkAuth]);

  // Listen for unauthorized 401 events dispatched from axios interceptor
  useEffect(() => {
    const handleUnauthorized = () => {
      setUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem(STORAGE_KEY);
    };

    window.addEventListener('auth:unauthorized', handleUnauthorized);
    return () => {
      window.removeEventListener('auth:unauthorized', handleUnauthorized);
    };
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    const response = await authService.login({ email, password });
    setUser(response.user);
    setIsAuthenticated(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(response.user));
  };

  const register = async (email: string, password: string): Promise<void> => {
    const response = await authService.register({ email, password });
    setUser(response.user);
    setIsAuthenticated(true);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(response.user));
  };

  const logout = async (): Promise<void> => {
    try {
      await authService.logout();
    } finally {
      setUser(null);
      setIsAuthenticated(false);
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated,
        login,
        register,
        logout,
        checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuthContext = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuthContext must be used within an AuthProvider');
  }
  return context;
};
