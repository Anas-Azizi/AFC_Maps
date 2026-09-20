import { useRef, useState } from 'react';
import { api } from '../api.js';

export default function Import() {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [mode, setMode] = useState('replace');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const onUpload = async (e) => {
    e.preventDefault();
    setError('');
    setResult(null);
    const file = fileRef.current?.files?.[0];
    if (!file) {
      setError('اختر ملف KMZ أولاً');
      return;
    }
    setBusy(true);
    try {
      const data = await api.uploadKmz(file);
      setPreview(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (!preview) return;
    const msg =
      mode === 'replace'
        ? 'سيتم مسح جميع البيانات الحالية (المناطق والمحلات) واستيراد البيانات الجديدة. هل أنت متأكد؟'
        : 'سيتم إضافة البيانات الجديدة دون مسح البيانات الحالية. هل أنت متأكد؟';
    if (!window.confirm(msg)) return;
    setError('');
    setBusy(true);
    try {
      const data = await api.confirmImport(preview.importId, mode);
      setResult(data.stats);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onCancel = () => {
    setPreview(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div>
      <h1>استيراد KMZ</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {result && (
        <div className="alert alert-success">
          تم الاستيراد بنجاح — المناطق: {result.regions}، المحلات: {result.stores}، المضلعات: {result.polygons}
        </div>
      )}

      {!preview && (
        <div className="card">
          <form onSubmit={onUpload}>
            <div className="form-field" style={{ maxWidth: 400, marginBottom: 14 }}>
              <label>ملف KMZ</label>
              <input ref={fileRef} type="file" accept=".kmz" />
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'جارٍ الرفع…' : 'رفع ومعاينة'}
            </button>
          </form>
        </div>
      )}

      {preview && (
        <>
          <div className="card">
            <h2>معاينة الاستيراد</h2>
            <div className="stats-grid" style={{ marginBottom: 16 }}>
              <div className="stat-card">
                <div className="stat-value">{preview.stats.regions}</div>
                <div className="stat-label">المناطق</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{preview.stats.stores}</div>
                <div className="stat-label">المحلات</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{preview.stats.polygons}</div>
                <div className="stat-label">المضلعات</div>
              </div>
            </div>

            {preview.stats.unmatchedPolygons?.length > 0 && (
              <div className="alert alert-warning">
                مضلعات بدون منطقة مطابقة: {preview.stats.unmatchedPolygons.join('، ')}
              </div>
            )}

            <table>
              <thead>
                <tr>
                  <th>المنطقة</th>
                  <th>عدد المحلات</th>
                  <th>المضلع</th>
                </tr>
              </thead>
              <tbody>
                {preview.regions.map((r) => (
                  <tr key={r.name}>
                    <td>{r.name}</td>
                    <td>{r.storeCount}</td>
                    <td>
                      <span className={`badge ${r.hasPolygon ? 'badge-green' : 'badge-gray'}`}>
                        {r.hasPolygon ? 'موجود' : 'غير موجود'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>طريقة الاستيراد</h2>
            <div className="form-field" style={{ marginBottom: 8 }}>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="replace"
                  checked={mode === 'replace'}
                  onChange={() => setMode('replace')}
                />{' '}
                استبدال — يمسح البيانات الحالية ويستورد من جديد
              </label>
            </div>
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label>
                <input
                  type="radio"
                  name="mode"
                  value="merge"
                  checked={mode === 'merge'}
                  onChange={() => setMode('merge')}
                />{' '}
                دمج — يضيف الجديد فقط دون مسح
              </label>
            </div>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>
                {busy ? 'جارٍ الاستيراد…' : 'تأكيد الاستيراد'}
              </button>
              <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
                إلغاء
              </button>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>ملاحظة: تنتهي صلاحية جلسة الاستيراد بعد 10 دقائق من رفع الملف.</p>
          </div>
        </>
      )}
    </div>
  );
}
