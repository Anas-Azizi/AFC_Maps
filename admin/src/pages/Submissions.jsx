import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Submissions() {
  const [tab, setTab] = useState('new'); // new | updates
  const [rows, setRows] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    const fetcher = tab === 'new' ? api.listSubmissions : api.listUpdates;
    fetcher(showArchived).then(setRows).catch((e) => setError(e.message));
  }, [tab, showArchived]);

  useEffect(load, [load]);

  const toggleArchive = async (row) => {
    setError('');
    try {
      const setter = tab === 'new' ? api.setSubmissionArchived : api.setUpdateArchived;
      await setter(row.id, !showArchived);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const switchTab = (t) => {
    setTab(t);
    setShowArchived(false);
  };

  return (
    <div>
      <h1>المحلات الميدانية</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="btn-row" style={{ marginBottom: '12px' }}>
          <button
            className={`btn btn-small ${tab === 'new' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => switchTab('new')}
          >
            محلات جديدة
          </button>
          <button
            className={`btn btn-small ${tab === 'updates' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => switchTab('updates')}
          >
            تحديثات المحلات
          </button>
          <span style={{ flex: 1 }} />
          <button
            className={`btn btn-small ${showArchived ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowArchived(!showArchived)}
          >
            {showArchived ? 'عرض الحالية' : 'عرض المؤرشفة'}
          </button>
        </div>

        {tab === 'new' ? (
          <table>
            <thead>
              <tr>
                <th>اسم المحل</th>
                <th>Latitude</th>
                <th>Longitude</th>
                <th>المستخدم</th>
                <th>التاريخ</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.name}</td>
                  <td dir="ltr">{Number(r.lat).toFixed(6)}</td>
                  <td dir="ltr">{Number(r.lng).toFixed(6)}</td>
                  <td>{r.userName}</td>
                  <td dir="ltr">{r.createdAt}</td>
                  <td>
                    <button className="btn btn-secondary btn-small" onClick={() => toggleArchive(r)}>
                      {showArchived ? 'إلغاء الأرشفة' : 'Archive'}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan="6" className="muted">
                    {showArchived ? 'لا توجد سجلات مؤرشفة' : 'لا توجد محلات مسجلة ميدانياً بعد'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        ) : (
          <table>
            <thead>
              <tr>
                <th>اسم المحل</th>
                <th>الموقع الجديد</th>
                <th>الملاحظة</th>
                <th>المستخدم</th>
                <th>التاريخ</th>
                <th>إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.storeName}</td>
                  <td dir="ltr">
                    {r.newLat != null ? `${Number(r.newLat).toFixed(6)}, ${Number(r.newLng).toFixed(6)}` : '—'}
                  </td>
                  <td>{r.note || '—'}</td>
                  <td>{r.userName}</td>
                  <td dir="ltr">{r.createdAt}</td>
                  <td>
                    <button className="btn btn-secondary btn-small" onClick={() => toggleArchive(r)}>
                      {showArchived ? 'إلغاء الأرشفة' : 'Archive'}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan="6" className="muted">
                    {showArchived ? 'لا توجد سجلات مؤرشفة' : 'لا توجد تحديثات بعد'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
