import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api, { DEMO_PASSWORD, TOKEN_KEY, USER_KEY, clearLegacySession, clearSession, readToken } from './api';

const AuthContext = createContext(null);

function storedUser() {
  clearLegacySession();
  try {
    return readToken() ? JSON.parse(sessionStorage.getItem(USER_KEY)) : null;
  } catch {
    return null;
  }
}

export function homeFor(role) {
  return { nominee: '/journey', admin: '/admin' }[role] ?? '/forensics';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(storedUser);
  const [switching, setSwitching] = useState(null);
  const navigate = useNavigate();

  // Clears every trace of the session and resets the URL, so the next sign-in never inherits this page.
  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    navigate('/', { replace: true });
  }, [navigate]);

  useEffect(() => {
    window.addEventListener('ps:session-expired', logout);
    return () => window.removeEventListener('ps:session-expired', logout);
  }, [logout]);

  // Revalidate a stored session once on load.
  useEffect(() => {
    if (!readToken()) return;
    api.get('/auth/me')
      .then(({ data }) => {
        sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
        setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    clearLegacySession();
    sessionStorage.setItem(TOKEN_KEY, data.token);
    sessionStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    // Every sign-in (form, register, demo button, account switch) starts on the role home page.
    navigate(homeFor(data.user.role), { replace: true });
    return data.user;
  }, [navigate]);

  const register = useCallback(async ({ name, email, password }) => {
    await api.post('/auth/register', { name, email, password });
    return login(email, password);
  }, [login]);

  const switchTo = useCallback(async (email) => {
    setSwitching(email);
    try {
      return await login(email, DEMO_PASSWORD);
    } finally {
      setSwitching(null);
    }
  }, [login]);

  const value = useMemo(() => ({ user, login, logout, register, switchTo, switching }),
    [user, login, logout, register, switchTo, switching]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
