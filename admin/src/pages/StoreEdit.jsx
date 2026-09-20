import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { L } from '../mapUtils.js';
import { api } from '../api.js';

const ALEPPO = [36.2, 37.13];

export default function StoreEdit() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    ownerName: '',
    phone: '',
    regionId: '',
    notes: '',
  });
  const [pos, setPos] = useState(null);
  const [regions, setRegions] = useState([]);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const mapRef = useRef(null);
  const mapInstanceRef = useRef(null);
  const markerRef = useRef(null);
  const contextLayersRef = useRef(null);

  // تحميل المناطق
  useEffect(() => {
    api.listRegions().then(setRegions).catch((e) => setError(e.message));
  }, []);

  // تحميل بيانات المحل عند التعديل
  useEffect(() => {
    if (isNew) return;
    // لا يوجد endpoint لمحل واحد؛ نبحث ضمن القائمة
    api.listStores({})
      .then(async (stores) => {
        let store = stores.find((s) => s.id === Number(id));
        if (!store) {
          // قد لا يظهر ضمن أول 500 — نجلب snapshot الكامل
          const snap = await api.snapshot();
          store = snap.stores.find((s) => s.id === Number(id));
        }
        if (!store) {
          setError('المحل غير موجود');
          return;
        }
        setForm({
          name: store.name || '',
          ownerName: store.ownerName || '',
          phone: store.phone || '',
          regionId: store.regionId || '',
          notes: store.notes || '',
        });
        setPos([store.lat, store.lng]);
        mapInstanceRef.current?.setView([store.lat, store.lng], 15);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  // تهيئة الخريطة
  useEffect(() => {
    const map = L.map(mapRef.current).setView(ALEPPO, 12);
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
  }, []);

  // علامة موقع المحل
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

  // عرض محلات المنطقة المحددة كنقاط للسياق
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
    if (!pos) {
      setError('حدد موقع المحل بالنقر على الخريطة');
      return;
    }
    setBusy(true);
    try {
      const payload = {
        name: form.name,
        ownerName: form.ownerName || null,
        phone: form.phone || null,
        lat: pos[0],
        lng: pos[1],
        regionId: form.regionId ? Number(form.regionId) : null,
        notes: form.notes || null,
      };
      if (isNew) await api.createStore(payload);
      else await api.updateStore(Number(id), payload);
      navigate('/stores');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p>جارٍ التحميل…</p>;

  return (
    <div>
      <h1>{isNew ? 'إضافة محل جديد' : `تعديل المحل: ${form.name}`}</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <form onSubmit={onSave}>
          <div className="form-grid">
            <div className="form-field">
              <label>اسم المحل</label>
              <input type="text" value={form.name} onChange={set('name')} required />
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
              <label>اسم المالك</label>
              <input type="text" value={form.ownerName} onChange={set('ownerName')} />
            </div>
            <div className="form-field">
              <label>الهاتف</label>
              <input type="text" value={form.phone} onChange={set('phone')} />
            </div>
            <div className="form-field" style={{ gridColumn: '1 / -1' }}>
              <label>ملاحظات</label>
              <textarea rows="2" value={form.notes} onChange={set('notes')} />
            </div>
          </div>

          <p className="muted">
            انقر على الخريطة لتحديد موقع المحل. النقاط الزرقاء هي محلات المنطقة المحددة.
            {pos && <> الموقع الحالي: {pos[0].toFixed(5)}, {pos[1].toFixed(5)}</>}
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
    </div>
  );
}
