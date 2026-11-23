import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import api, { DEMO_PASSWORD, TOKEN_KEY, USER_KEY } from './api';

const AuthContext = createContext(null);

function storedUser() {
  try {
    return localStorage.getItem(TOKEN_KEY) ? JSON.parse(localStorage.getItem(USER_KEY)) : null;
  } catch {
    return null;
  }
}

export function homeFor(role) {
  return { worker: '/forensics', nominee: '/journey', admin: '/admin' }[role] ?? '/directory';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(storedUser);
  const [switching, setSwitching] = useState(null);

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    setUser(null);
  }, []);

  useEffect(() => {
    window.addEventListener('ps:session-expired', logout);
    return () => window.removeEventListener('ps:session-expired', logout);
  }, [logout]);

  // Revalidate a stored session once on load.
  useEffect(() => {
    if (!localStorage.getItem(TOKEN_KEY)) return;
    api.get('/auth/me')
      .then(({ data }) => {
        localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        setUser(data.user);
      })
      .catch(() => {});
  }, []);

  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    localStorage.setItem(TOKEN_KEY, data.token);
    localStorage.setItem(USER_KEY, JSON.stringify(data.user));
    setUser(data.user);
    return data.user;
  }, []);

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
