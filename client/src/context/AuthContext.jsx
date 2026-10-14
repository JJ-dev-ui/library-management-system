import { createContext, useContext, useEffect, useState } from 'react';
import api from '../api';
import { applyTheme, DEFAULT_THEME } from '../utils/theme';

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Restore session from the stored token
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }
    api.get('/auth/me')
      .then((res) => setUser(res.data.user))
      .catch(() => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  // The theme saved on the server wins (index.html already applied the last one from this browser).
  // Runs when the user logs in, or saves a new theme in Settings.
  const savedTheme = user?.preferences?.theme;
  useEffect(() => {
    if (savedTheme) applyTheme(savedTheme);
  }, [savedTheme]);

  const login = async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
  };

  const register = async (name, email, password) => {
    const { data } = await api.post('/auth/register', { name, email, password });
    localStorage.setItem('token', data.token);
    setUser(data.user);
  };

  const logout = () => {
    localStorage.removeItem('token');
    applyTheme(DEFAULT_THEME); // the next person on this computer starts with the default colours
    setUser(null);
  };

  // After a password change the server sends a NEW token (the old ones stop working)
  const replaceToken = (token) => localStorage.setItem('token', token);

  return (
    <AuthContext.Provider value={{ user, setUser, loading, login, register, logout, replaceToken, isAdmin: user?.role === 'admin' }}>
      {children}
    </AuthContext.Provider>
  );
}
