import React, { createContext, useContext, useState, useEffect } from 'react';
import axios from 'axios';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('accessToken') || null);
  const [loading, setLoading] = useState(true);

  // Setup Axios defaults
  useEffect(() => {
    if (token) {
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      localStorage.setItem('accessToken', token);
    } else {
      delete axios.defaults.headers.common['Authorization'];
      localStorage.removeItem('accessToken');
    }
  }, [token]);

  // Load user profile on mount if token exists
  useEffect(() => {
    const fetchProfile = async () => {
      if (!token) {
        setLoading(false);
        return;
      }
      try {
        const savedUser = localStorage.getItem('user');
        if (savedUser) {
          setUser(JSON.parse(savedUser));
        } else {
          // If token exists but no user info is saved, perform a logout to be safe
          logout();
        }
      } catch (err) {
        console.error("Error loading user profile", err);
        logout();
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, [token]);

  const login = async (username, password) => {
    setLoading(true);
    try {
      // Attempt API call
      const response = await axios.post('/api/auth/login', { username, password });
      
      if (response.data?.status === 'success') {
        const { user: userData, accessToken, refreshToken } = response.data.data;
        setToken(accessToken);
        setUser(userData);
        localStorage.setItem('user', JSON.stringify(userData));
        localStorage.setItem('refreshToken', refreshToken);
        return { success: true };
      }
      return { success: false, message: response.data?.message || 'Login failed' };
    } catch (err) {
      console.error("API login failed:", err);
      const errMsg = err.response?.data?.message || err.message || 'Invalid username or password';
      return { success: false, message: errMsg };
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    setToken(null);
    setUser(null);
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
  };

  const activeRole = user?.role || null;

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      login,
      logout,
      activeRole,
      isLoggedIn: !!token
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
