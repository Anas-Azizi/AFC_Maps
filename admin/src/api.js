const TOKEN_KEY = 'admin_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(path, { method = 'GET', body, formData } = {}) {
  const headers = {};
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const base = import.meta.env.BASE_URL.replace(/\/$/, '');
  const res = await fetch(base + path, {
    method,
    headers,
    body: formData ? formData : body !== undefined ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // استجابة غير JSON
  }
  if (!res.ok) {
    throw new ApiError(data?.error || `خطأ في الطلب (${res.status})`, res.status);
  }
  return data;
}

export const api = {
  login: (username, password) => request('/api/auth/login', { method: 'POST', body: { username, password } }),
  me: () => request('/api/auth/me'),
  snapshot: () => request('/api/data/snapshot'),

  listUsers: () => request('/api/admin/users'),
  createUser: (u) => request('/api/admin/users', { method: 'POST', body: u }),
  updateUser: (id, u) => request(`/api/admin/users/${id}`, { method: 'PUT', body: u }),
  resetPassword: (id, password) => request(`/api/admin/users/${id}/reset-password`, { method: 'POST', body: { password } }),
  deleteUser: (id) => request(`/api/admin/users/${id}`, { method: 'DELETE' }),

  listRegions: () => request('/api/admin/regions'),
  createRegion: (r) => request('/api/admin/regions', { method: 'POST', body: r }),
  updateRegion: (id, r) => request(`/api/admin/regions/${id}`, { method: 'PUT', body: r }),
  deleteRegion: (id) => request(`/api/admin/regions/${id}`, { method: 'DELETE' }),

  listStores: ({ regionId, q } = {}) => {
    const params = new URLSearchParams();
    if (regionId) params.set('regionId', regionId);
    if (q) params.set('q', q);
    const qs = params.toString();
    return request(`/api/admin/stores${qs ? `?${qs}` : ''}`);
  },
  createStore: (s) => request('/api/admin/stores', { method: 'POST', body: s }),
  updateStore: (id, s) => request(`/api/admin/stores/${id}`, { method: 'PUT', body: s }),
  deleteStore: (id) => request(`/api/admin/stores/${id}`, { method: 'DELETE' }),

  uploadKmz: (file) => {
    const fd = new FormData();
    fd.append('file', file);
    return request('/api/admin/import/kmz', { method: 'POST', formData: fd });
  },
  confirmImport: (importId, mode) => request('/api/admin/import/confirm', { method: 'POST', body: { importId, mode } }),
};
