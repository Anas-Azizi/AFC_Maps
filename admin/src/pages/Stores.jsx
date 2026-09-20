import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

export default function Stores() {
  const [stores, setStores] = useState([]);
  const [regions, setRegions] = useState([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const regionId = searchParams.get('regionId') || '';
  const q = searchParams.get('q') || '';
  const [qInput, setQInput] = useState(q);

  useEffect(() => {
    api.listRegions().then(setRegions).catch((e) => setError(e.message));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    api.listStores({ regionId: regionId || undefined, q: q || undefined })
      .then(setStores)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [regionId, q]);

  useEffect(load, [load]);

  const regionName = (id) => regions.find((r) => r.id === id)?.name || '—';

  const applyFilters = (e) => {
    e.preventDefault();
    const params = {};
    if (regionId) params.regionId = regionId;
    if (qInput) params.q = qInput;
    setSearchParams(params);
  };

  const remove = async (s) => {
    if (!window.confirm(`هل أنت متأكد من حذف المحل «${s.name}»؟`)) return;
    setError('');
    try {
      await api.deleteStore(s.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>المحلات</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <form className="filters-row" onSubmit={applyFilters}>
          <div className="form-field">
            <label>المنطقة</label>
            <select
              value={regionId}
              onChange={(e) => {
                const params = {};
                if (e.target.value) params.regionId = e.target.value;
                if (q) params.q = q;
                setSearchParams(params);
              }}
            >
              <option value="">كل المناطق</option>
              {regions.map((r) => (
                <option key={r.id} value={r.id}>{r.name}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>بحث بالاسم</label>
            <input type="text" value={qInput} onChange={(e) => setQInput(e.target.value)} />
          </div>
          <button className="btn btn-secondary" type="submit">بحث</button>
          <Link to="/stores/new" className="btn btn-primary">إضافة محل جديد</Link>
        </form>

        {loading ? (
          <p>جارٍ التحميل…</p>
        ) : (
          <>
            <p className="muted">عدد النتائج: {stores.length}{stores.length >= 500 ? ' (الحد الأقصى 500 — استخدم البحث للتضييق)' : ''}</p>
            <table>
              <thead>
                <tr>
                  <th>الاسم</th>
                  <th>المنطقة</th>
                  <th>المالك</th>
                  <th>الهاتف</th>
                  <th>إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s) => (
                  <tr key={s.id}>
                    <td>{s.name}</td>
                    <td>{regionName(s.regionId)}</td>
                    <td>{s.ownerName || '—'}</td>
                    <td>{s.phone || '—'}</td>
                    <td>
                      <div className="btn-row">
                        <Link to={`/stores/${s.id}/edit`} className="btn btn-secondary btn-small">تعديل</Link>
                        <button className="btn btn-danger btn-small" onClick={() => remove(s)}>حذف</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {stores.length === 0 && (
                  <tr><td colSpan="5" className="muted">لا توجد نتائج</td></tr>
                )}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
