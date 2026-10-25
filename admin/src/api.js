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

  listStores: (filters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, value);
    }
    const qs = params.toString();
    return request(`/api/admin/stores${qs ? `?${qs}` : ''}`);
  },
  filterOptions: () => request('/api/admin/stores/filter-options'),
  exportStores: async (filters = {}) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, value);
    }
    const qs = params.toString();
    const base = import.meta.env.BASE_URL.replace(/\/$/, '');
    const token = getToken();
    const res = await fetch(`${base}/api/admin/stores/export${qs ? `?${qs}` : ''}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) {
      let data = null;
      try {
        data = await res.json();
      } catch {
        // استجابة غير JSON
      }
      throw new ApiError(data?.error || `خطأ في التصدير (${res.status})`, res.status);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'customers.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
  reportDimensions: () => request('/api/admin/reports/dimensions'),
  pivotReport: ({ rows, cols, metric, ...filters } = {}) => {
    const params = new URLSearchParams();
    if (rows) params.set('rows', rows);
    if (cols) params.set('cols', cols);
    if (metric) params.set('metric', metric);
    for (const [key, value] of Object.entries(filters)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, value);
    }
    return request(`/api/admin/reports/pivot?${params.toString()}`);
  },
  bulkUpdateStores: (payload) => request('/api/admin/stores/bulk-update', { method: 'POST', body: payload }),
  getStore: (id) => request(`/api/admin/stores/${id}`),
  createStore: (s) => request('/api/admin/stores', { method: 'POST', body: s }),
  updateStore: (id, s) => request(`/api/admin/stores/${id}`, { method: 'PUT', body: s }),
  deleteStore: (id) => request(`/api/admin/stores/${id}`, { method: 'DELETE' }),

  addVisit: (storeId, v) => request(`/api/admin/stores/${storeId}/visits`, { method: 'POST', body: v }),
  updateVisit: (id, v) => request(`/api/admin/visits/${id}`, { method: 'PUT', body: v }),
  deleteVisit: (id) => request(`/api/admin/visits/${id}`, { method: 'DELETE' }),

  uploadImportFiles: (kmzFile, customersFile, routesFile) => {
    const fd = new FormData();
    fd.append('kmz', kmzFile);
    fd.append('customers', customersFile);
    fd.append('routes', routesFile);
    return request('/api/admin/import/files', { method: 'POST', formData: fd });
  },
  confirmImport: (importId) => request('/api/admin/import/confirm', { method: 'POST', body: { importId } }),

  listSubmissions: (archived = false) => request(`/api/admin/submissions${archived ? '?archived=1' : ''}`),
  setSubmissionArchived: (id, archived) => request(`/api/admin/submissions/${id}/archive`, { method: 'POST', body: { archived } }),

  listUpdates: (archived = false) => request(`/api/admin/updates${archived ? '?archived=1' : ''}`),
  setUpdateArchived: (id, archived) => request(`/api/admin/updates/${id}/archive`, { method: 'POST', body: { archived } }),
};
