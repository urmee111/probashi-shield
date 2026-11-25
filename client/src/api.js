import axios from 'axios';

export const TOKEN_KEY = 'ps_token';
export const USER_KEY = 'ps_user';

// The session lives in sessionStorage: it survives F5 in the same tab, but a new tab or browser session starts
// at Login. Preferences (theme, language) stay in localStorage. Older builds kept the session in localStorage,
// so those keys are removed and never read.
export function readToken() {
  try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
}

export function clearSession() {
  for (const storage of [sessionStorage, localStorage]) {
    try {
      storage.removeItem(TOKEN_KEY);
      storage.removeItem(USER_KEY);
    } catch { /* storage may be blocked */ }
  }
}

export function clearLegacySession() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  } catch { /* storage may be blocked */ }
}
export const DEMO_PASSWORD = 'Password123!';

export const DEMO_ACCOUNTS = [
  {
    email: 'rahim@demo.com', name: 'Rahim Mia', role: 'worker', key: 'worker', label: 'Worker',
    blurb: 'Owns the Malaysia scam demo case and journey #1. Upload documents, run audits, and trigger the A07 rollback.',
  },
  {
    email: 'karim@demo.com', name: 'Karim Uddin', role: 'worker', key: 'worker2', label: 'Second worker',
    blurb: "A second worker for the isolation test. Tries to open Rahim's journey and receives 403.",
  },
  {
    email: 'fatema@demo.com', name: 'Fatema Begum', role: 'nominee', key: 'nominee', label: 'Nominee',
    blurb: "Rahim's nominee. Gets read-only milestones and alerts. Any write attempt is blocked with 403.",
  },
  {
    email: 'admin@demo.com', name: 'Caseworker Admin', role: 'admin', key: 'admin', label: 'Admin',
    blurb: 'Command center with live KPIs and the immutable audit and security log.',
  },
];

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || 'http://localhost:5000/api',
  timeout: 45000,
});

api.interceptors.request.use((config) => {
  const token = readToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  response => response,
  (error) => {
    const isLogin = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && readToken() && !isLogin) {
      window.dispatchEvent(new Event('ps:session-expired'));
    }
    return Promise.reject(error);
  },
);

// Normalizes axios failures into { status, message, data } for display.
export function apiError(error, fallback = 'The request failed.') {
  if (axios.isCancel(error)) return { status: null, message: 'cancelled', cancelled: true };
  const status = error?.response?.status ?? null;
  const data = error?.response?.data;
  let message = data?.error || fallback;
  if (!error?.response) {
    message = error?.code === 'ECONNABORTED'
      ? 'The server took too long to respond.'
      : 'Cannot reach the ProbashiShield API. Check that the server is running.';
  }
  return { status, message, data };
}

// Sends a request and returns the raw outcome (including 4xx) for the security proof cards.
export async function probe(method, url, data) {
  const startedAt = performance.now();
  try {
    const response = await api.request({ method, url, data });
    return { method, url, status: response.status, body: response.data, ms: Math.round(performance.now() - startedAt) };
  } catch (error) {
    return {
      method, url,
      status: error.response?.status ?? 0,
      body: error.response?.data ?? { error: apiError(error).message },
      ms: Math.round(performance.now() - startedAt),
    };
  }
}

export default api;
