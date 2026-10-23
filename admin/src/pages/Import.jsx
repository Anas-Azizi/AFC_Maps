import { useRef, useState } from 'react';
import { api } from '../api.js';

export default function Import() {
  const kmzRef = useRef(null);
  const customersRef = useRef(null);
  const routesRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const clearInputs = () => {
    if (kmzRef.current) kmzRef.current.value = '';
    if (customersRef.current) customersRef.current.value = '';
    if (routesRef.current) routesRef.current.value = '';
  };

  const onUpload = async (e) => {
    e.preventDefault();
    setError('');
    setDone(false);
    const kmz = kmzRef.current?.files?.[0];
    const customers = customersRef.current?.files?.[0];
    const routes = routesRef.current?.files?.[0];
    if (!kmz || !customers || !routes) {
      setError('اختر الملفات الثلاثة معاً: KMZ + الزبائن + المسارات');
      return;
    }
    setBusy(true);
    try {
      const data = await api.uploadImportFiles(kmz, customers, routes);
      setPreview(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onConfirm = async () => {
    if (!preview) return;
    if (!window.confirm('سيتم مسح جميع البيانات الحالية (المناطق والزبائن والزيارات والمعالم) واستيراد البيانات الجديدة. هل أنت متأكد؟')) return;
    setError('');
    setBusy(true);
    try {
      await api.confirmImport(preview.importId);
      setDone(true);
      setPreview(null);
      clearInputs();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onCancel = () => {
    setPreview(null);
    clearInputs();
  };

  return (
    <div>
      <h1>تحديث البيانات</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {done && (
        <div className="alert alert-success">
          تم الاستيراد بنجاح — أصبحت البيانات الجديدة فعالة، وستصل للأجهزة عند المزامنة القادمة.
        </div>
      )}

      {!preview && (
        <div className="card">
          <form onSubmit={onUpload}>
            <div className="form-field" style={{ maxWidth: 400, marginBottom: 14 }}>
              <label>ملف KMZ (حدود المناطق وأسماؤها والمعالم — من Google Earth)</label>
              <input ref={kmzRef} type="file" accept=".kmz" />
            </div>
            <div className="form-field" style={{ maxWidth: 400, marginBottom: 14 }}>
              <label>ملف الزبائن Excel (Qry_Upload_Guid_Customers)</label>
              <input ref={customersRef} type="file" accept=".xlsx" />
            </div>
            <div className="form-field" style={{ maxWidth: 400, marginBottom: 14 }}>
              <label>ملف المسارات Excel (Qry_Upload_Guide_Routes)</label>
              <input ref={routesRef} type="file" accept=".xlsx" />
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
                <div className="stat-value">{preview.stats.stores}</div>
                <div className="stat-label">الزبائن</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{preview.stats.mapShown}</div>
                <div className="stat-label">ظاهرون في التطبيق</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{preview.stats.visits}</div>
                <div className="stat-label">الزيارات</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{preview.stats.regions}</div>
                <div className="stat-label">المناطق</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{preview.stats.landmarks}</div>
                <div className="stat-label">المعالم</div>
              </div>
            </div>

            <div className="alert alert-warning" style={{ marginBottom: 8 }}>
              تعيين المناطق: {preview.stats.assignedByPolygon} مكانياً (داخل المضلع) + {preview.stats.assignedByName} بمطابقة الاسم
              {preview.stats.noRegion > 0 && ` — ${preview.stats.noRegion} بلا منطقة`}
            </div>
            {preview.stats.cancelled > 0 && (
              <div className="alert alert-warning" style={{ marginBottom: 8 }}>
                {preview.stats.cancelled} زبون ملغى (cancelled) — سيُستوردون لكن لن يظهروا في التطبيق إلا إذا كان MapShow مفعلاً.
              </div>
            )}
            {preview.stats.storesNoCoords > 0 && (
              <div className="alert alert-warning" style={{ marginBottom: 8 }}>
                تنبيه: {preview.stats.storesNoCoords} زبوناً بلا إحداثيات صالحة — سيظهرون في البحث والقوائم دون دبوس على الخريطة.
              </div>
            )}
            {preview.stats.orphanVisits > 0 && (
              <div className="alert alert-error">
                تجاهل {preview.stats.orphanVisits} زيارة لأكواد زبائن غير موجودة في ملف الزبائن.
              </div>
            )}

            <table>
              <thead>
                <tr>
                  <th>المنطقة</th>
                  <th>عدد الزبائن</th>
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
                        {r.hasPolygon ? 'موجود' : 'بدون حدود'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>تأكيد الاستيراد</h2>
            <p className="muted" style={{ marginBottom: 16 }}>
              سيستبدل هذا الإجراء كل المناطق والزبائن والزيارات والمعالم الحالية بالبيانات الجديدة.
            </p>
            <div className="btn-row">
              <button className="btn btn-primary" onClick={onConfirm} disabled={busy}>
                {busy ? 'جارٍ الاستيراد…' : 'تأكيد الاستيراد'}
              </button>
              <button className="btn btn-secondary" onClick={onCancel} disabled={busy}>
                إلغاء
              </button>
            </div>
            <p className="muted" style={{ marginTop: 12 }}>ملاحظة: تنتهي صلاحية جلسة الاستيراد بعد 10 دقائق من رفع الملفات.</p>
          </div>
        </>
      )}
    </div>
  );
}
