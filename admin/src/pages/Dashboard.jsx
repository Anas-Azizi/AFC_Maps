import { useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([api.listRegions(), api.listUsers(), api.snapshot()])
      .then(([regions, users, snapshot]) => {
        setStats({
          regions: regions.length,
          stores: snapshot.stores.length,
          users: users.length,
        });
      })
      .catch((e) => setError(e.message));
  }, []);

  return (
    <div>
      <h1>لوحة التحكم</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {!stats && !error && <p>جارٍ التحميل…</p>}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.regions}</div>
            <div className="stat-label">المناطق</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.stores}</div>
            <div className="stat-label">المحلات</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{stats.users}</div>
            <div className="stat-label">المستخدمون</div>
          </div>
        </div>
      )}
    </div>
  );
}
