import axios from 'axios';

export const TOKEN_KEY = 'ps_token';
export const USER_KEY = 'ps_user';
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
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  response => response,
  (error) => {
    const isLogin = error.config?.url?.includes('/auth/login');
    if (error.response?.status === 401 && localStorage.getItem(TOKEN_KEY) && !isLogin) {
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
