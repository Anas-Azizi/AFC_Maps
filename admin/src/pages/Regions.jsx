import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';

export default function Regions() {
  const [polygons, setPolygons] = useState([]);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    api.listPolygons().then(setPolygons).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const remove = async (p) => {
    if (!window.confirm(`هل أنت متأكد من حذف المضلع «${p.name}»؟`)) return;
    setError('');
    try {
      await api.deletePolygon(p.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>المضلعات</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div style={{ marginBottom: 16 }}>
          <Link to="/regions/new" className="btn btn-primary">إضافة مضلع جديد</Link>
        </div>
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>اللون</th>
              <th>الحدود</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {polygons.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td>
                  {p.color ? (
                    <span className="color-swatch" style={{ background: p.color }} title={p.color} />
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
                <td>
                  <span className={`badge ${p.polygon ? 'badge-green' : 'badge-gray'}`}>
                    {p.polygon ? 'مرسومة' : 'غير مرسومة'}
                  </span>
                </td>
                <td>
                  <div className="btn-row">
                    <Link to={`/regions/${p.id}/edit`} className="btn btn-secondary btn-small">تعديل</Link>
                    <button className="btn btn-danger btn-small" onClick={() => remove(p)}>حذف</button>
                  </div>
                </td>
              </tr>
            ))}
            {polygons.length === 0 && (
              <tr><td colSpan="4" className="muted">لا توجد مضلعات</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
