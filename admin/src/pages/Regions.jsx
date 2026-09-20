import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Regions() {
  const [regions, setRegions] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.listRegions().then(setRegions).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const remove = async (r) => {
    if (!window.confirm(`هل أنت متأكد من حذف المنطقة «${r.name}»؟`)) return;
    setError('');
    try {
      await api.deleteRegion(r.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>المناطق</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div style={{ marginBottom: 16 }}>
          <Link to="/regions/new" className="btn btn-primary">إضافة منطقة جديدة</Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>عدد المحلات</th>
              <th>اللون</th>
              <th>الحدود</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {regions.map((r) => (
              <tr key={r.id}>
                <td>{r.name}</td>
                <td>{r.storeCount}</td>
                <td>
                  {r.color ? (
                    <span className="color-swatch" style={{ background: r.color }} title={r.color} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${r.polygon ? 'badge-green' : 'badge-gray'}`}>
                    {r.polygon ? 'مرسومة' : 'غير مرسومة'}
                  </span>
                </td>
                <td>
                  <div className="btn-row">
                    <Link to={`/regions/${r.id}/edit`} className="btn btn-secondary btn-small">تعديل</Link>
                    <button className="btn btn-danger btn-small" onClick={() => remove(r)}>حذف</button>
                  </div>
                </td>
              </tr>
            ))}
            {regions.length === 0 && (
              <tr><td colSpan="5" className="muted">لا توجد مناطق</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
