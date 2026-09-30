import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

export default function Submissions() {
  const [rows, setRows] = useState([]);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    setError('');
    api.listSubmissions(showArchived).then(setRows).catch((e) => setError(e.message));
  }, [showArchived]);

  useEffect(load, [load]);

  const toggleArchive = async (row) => {
    setError('');
    try {
      await api.setSubmissionArchived(row.id, !showArchived);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>المحلات الميدانية</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="btn-row" style={{ marginBottom: '12px' }}>
          <button
            className={`btn btn-small ${showArchived ? 'btn-secondary' : 'btn-primary'}`}
            onClick={() => setShowArchived(false)}
          >
            الحالية
          </button>
          <button
            className={`btn btn-small ${showArchived ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setShowArchived(true)}
          >
            المؤرشفة
          </button>
        </div>

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
      </div>
    </div>
  );
}
