import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { L } from '../mapUtils.js';
import { api } from '../api.js';

const ALEPPO = [36.2, 37.13];

const EMPTY_FORM = {
  name: '', code: '', address: '', accountType: '', status: '', mapShow: true,
  category: '', shopClass: '', managerName: '', governate: '',
  phone: '', whatsapp: '', regionId: '', notes: '',
};

const EMPTY_VISIT = { repName: '', invoiceType: '', visitDay: '' };
const DAYS = ['السبت', 'الاحد', 'الاثنين', 'الثلاثاء', 'الاربعاء', 'الخميس', 'الجمعة'];

export default function StoreEdit() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();

  const [form, setForm] = useState(EMPTY_FORM);
  const [visits, setVisits] = useState([]);
  const [newVisit, setNewVisit] = useState(EMPTY_VISIT);
  const [pos, setPos] = useState(null);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const contextLayersRef = useRef(null);

  useEffect(() => {
    api.listRegions().then(setRegions).catch((e) => setError(e.message));
  }, []);

  // تحميل بيانات الزبون عند التعديل
  useEffect(() => {
    if (isNew) return;
    api.getStore(Number(id))
      .then((store) => {
        setForm({
          name: store.name || '',
          code: store.code ?? '',
          address: store.address || '',
          accountType: store.accountType || '',
          status: store.status || '',
          mapShow: !!store.mapShow,
          category: store.category || '',
          shopClass: store.shopClass || '',
          managerName: store.managerName || '',
          governate: store.governate || '',
          phone: store.phone || '',
          whatsapp: store.whatsapp || '',
          regionId: store.regionId || '',
          notes: store.notes || '',
        });
        setVisits(store.visits || []);
        if (store.lat != null && store.lng != null) {
          setPos([store.lat, store.lng]);
          mapInstanceRef.current?.setView([store.lat, store.lng], 15);
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  // تهيئة الخريطة — بعد انتهاء التحميل حتى تكون الحاوية مرسومة
  useEffect(() => {
    if (loading) return;
    const map = L.map(mapRef.current).setView(pos ?? ALEPPO, pos ? 15 : 12);
    mapInstanceRef.current = map;

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    contextLayersRef.current = L.layerGroup().addTo(map);

    map.on('click', (e) => {
      setPos([e.latlng.lat, e.latlng.lng]);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
      markerRef.current = null;
      contextLayersRef.current = null;
    };
  }, [loading]);

  // علامة موقع الزبون
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;
    if (markerRef.current) {
      map.removeLayer(markerRef.current);
      markerRef.current = null;
    }
    if (pos) {
      const marker = L.marker(pos, { draggable: true }).addTo(map);
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        setPos([p.lat, p.lng]);
      });
      markerRef.current = marker;
    }
  }, [pos]);

  // عرض زبائن المنطقة المحددة كنقاط للسياق
  useEffect(() => {
    const group = contextLayersRef.current;
    if (!group || !form.regionId) {
      group?.clearLayers();
      return;
    }
    api.listStores({ regionId: form.regionId })
      .then((stores) => {
        group.clearLayers();
        for (const s of stores) {
          if (String(s.id) === String(id)) continue;
          if (s.lat == null || s.lng == null) continue;
          L.circleMarker([s.lat, s.lng], {
            radius: 5,
            color: '#2563eb',
            fillOpacity: 0.6,
          })
            .bindTooltip(s.name)
            .addTo(group);
        }
      })
      .catch(() => {});
  }, [form.regionId, id]);

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const onSave = async (e) => {
    e.preventDefault();
    setError('');
    if (isNew && !pos) {
      setError('حدد موقع الزبون بالنقر على الخريطة');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        address: form.address || null,
        accountType: form.accountType || null,
        status: form.status || null,
        mapShow: form.mapShow,
        category: form.category || null,
        shopClass: form.shopClass || null,
        managerName: form.managerName || null,
        governate: form.governate || null,
        phone: form.phone || null,
        whatsapp: form.whatsapp || null,
        regionId: form.regionId ? Number(form.regionId) : null,
        notes: form.notes || null,
      };
      if (form.code !== '' && /^\d+$/.test(String(form.code))) payload.code = Number(form.code);
      if (pos) {
        payload.lat = pos[0];
        payload.lng = pos[1];
      } else if (isNew) {
        payload.lat = null;
        payload.lng = null;
      }
      if (isNew) {
        const created = await api.createStore(payload);
        navigate(`/stores/${created.id}/edit`);
      } else {
        await api.updateStore(Number(id), payload);
        navigate('/stores');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const onAddVisit = async (e) => {
    e.preventDefault();
    setError('');
    if (!newVisit.repName.trim()) {
      setError('اسم المندوب مطلوب لإضافة زيارة');
      return;
    }
    try {
      await api.addVisit(Number(id), {
        repName: newVisit.repName.trim(),
        invoiceType: newVisit.invoiceType || null,
        visitDay: newVisit.visitDay || null,
      });
      setNewVisit(EMPTY_VISIT);
      const store = await api.getStore(Number(id));
      setVisits(store.visits || []);
    } catch (err) {
      setError(err.message);
    }
  };

  const onDeleteVisit = async (visitId) => {
    if (!window.confirm('حذف هذه الزيارة؟')) return;
    setError('');
    try {
      await api.deleteVisit(visitId);
      setVisits(visits.filter((v) => v.id !== visitId));
    } catch (err) {
      setError(err.message);
    }
  };

  if (loading) return <p>جارٍ التحميل…</p>;

  return (
    <div>
      <h1>{isNew ? 'إضافة زبون جديد' : `تعديل الزبون: ${form.name}`}</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <form onSubmit={onSave}>
          <div className="form-grid">
            <div className="form-field">
              <label>اسم الزبون</label>
              <input type="text" value={form.name} onChange={set('name')} required />
            </div>
            <div className="form-field">
              <label>كود الزبون</label>
              <input type="text" value={form.code} onChange={set('code')} />
            </div>
            <div className="form-field">
              <label>المنطقة</label>
              <select value={form.regionId} onChange={set('regionId')}>
                <option value="">بدون منطقة</option>
                {regions.map((r) => (
                  <option key={r.id} value={r.id}>{r.name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>المحافظة</label>
              <input type="text" value={form.governate} onChange={set('governate')} />
            </div>
            <div className="form-field">
              <label>نوع الحساب</label>
              <input type="text" value={form.accountType} onChange={set('accountType')} />
            </div>
            <div className="form-field">
              <label>حالة الزبون</label>
              <select value={form.status} onChange={set('status')}>
                <option value="">فعّال</option>
                <option value="cancelled">cancelled</option>
              </select>
            </div>
            <div className="form-field">
              <label>طبيعة العمل</label>
              <input type="text" value={form.category} onChange={set('category')} />
            </div>
            <div className="form-field">
              <label>الفئة</label>
              <input type="text" value={form.shopClass} onChange={set('shopClass')} />
            </div>
            <div className="form-field">
              <label>اسم المسؤول</label>
              <input type="text" value={form.managerName} onChange={set('managerName')} />
            </div>
            <div className="form-field">
              <label>العنوان</label>
              <input type="text" value={form.address} onChange={set('address')} />
            </div>
            <div className="form-field">
              <label>رقم الموبايل</label>
              <input type="text" value={form.phone} onChange={set('phone')} />
            </div>
            <div className="form-field">
              <label>رقم الواتس</label>
              <input type="text" value={form.whatsapp} onChange={set('whatsapp')} />
            </div>
            <div className="form-field">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="checkbox"
                  checked={form.mapShow}
                  onChange={(e) => setForm({ ...form, mapShow: e.target.checked })}
                  style={{ width: 'auto' }}
                />
                يظهر في التطبيق (MapShow)
              </label>
            </div>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label>ملاحظات</label>
              <textarea rows="2" value={form.notes} onChange={set('notes')} />
            </div>
          </div>

          <p className="muted">
            انقر على الخريطة لتحديد موقع الزبون. النقاط الزرقاء هي زبائن المنطقة المحددة.
            {pos ? <> الموقع الحالي: {pos[0].toFixed(5)}, {pos[1].toFixed(5)}</> : <> لا يوجد موقع محدد — لن يظهر دبوس على الخريطة.</>}
          </p>
          <div ref={mapRef} className="map-container" style={{ marginBottom: 16 }} />

          <div className="btn-row">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : 'حفظ'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => navigate('/stores')}>
              إلغاء
            </button>
          </div>
        </form>
      </div>

      {!isNew && (
        <div className="card">
          <h2>زيارات المندوبين</h2>
          <table>
            <thead>
              <tr>
                <th>المندوب</th>
                <th>نوع الفاتورة</th>
                <th>يوم الزيارة</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {visits.map((v) => (
                <tr key={v.id}>
                  <td>{v.repName}</td>
                  <td>{v.invoiceType || '—'}</td>
                  <td>{v.visitDay || '—'}</td>
                  <td>
                    <button className="btn btn-danger btn-small" onClick={() => onDeleteVisit(v.id)}>حذف</button>
                  </td>
                </tr>
              ))}
              {visits.length === 0 && (
                <tr><td colSpan="4" className="muted">لا توجد زيارات مسجلة</td></tr>
              )}
            </tbody>
          </table>

          <form className="filters-row" onSubmit={onAddVisit} style={{ marginTop: 12 }}>
            <div className="form-field">
              <label>المندوب</label>
              <input
                type="text"
                value={newVisit.repName}
                onChange={(e) => setNewVisit({ ...newVisit, repName: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>نوع الفاتورة</label>
              <input
                type="text"
                value={newVisit.invoiceType}
                onChange={(e) => setNewVisit({ ...newVisit, invoiceType: e.target.value })}
              />
            </div>
            <div className="form-field">
              <label>يوم الزيارة</label>
              <select
                value={newVisit.visitDay}
                onChange={(e) => setNewVisit({ ...newVisit, visitDay: e.target.value })}
              >
                <option value="">—</option>
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <button className="btn btn-primary" type="submit">إضافة زيارة</button>
          </form>
        </div>
      )}
    </div>
  );
}
