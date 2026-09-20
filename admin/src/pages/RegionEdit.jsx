import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { L } from '../mapUtils.js';
import 'leaflet-draw';
import { api } from '../api.js';

const ALEPPO = [36.2, 37.13];

// تعريب أزرار الرسم
L.drawLocal.draw.toolbar.buttons.polygon = 'رسم حدود المنطقة';
L.drawLocal.draw.handlers.polygon.tooltip.start = 'انقر لبدء رسم الحدود';
L.drawLocal.draw.handlers.polygon.tooltip.cont = 'انقر لمتابعة الرسم';
L.drawLocal.draw.handlers.polygon.tooltip.end = 'انقر على النقطة الأولى لإنهاء الرسم';
L.drawLocal.edit.toolbar.buttons.edit = 'تعديل الشكل';
L.drawLocal.edit.toolbar.buttons.editDisabled = 'لا يوجد شكل للتعديل';
L.drawLocal.edit.toolbar.buttons.remove = 'حذف الشكل';
L.drawLocal.edit.toolbar.buttons.removeDisabled = 'لا يوجد شكل للحذف';
L.drawLocal.edit.handlers.edit.tooltip.text = 'اسحب النقاط لتعديل الشكل';
L.drawLocal.edit.handlers.remove.tooltip.text = 'انقر على الشكل لحذفه';
L.drawLocal.draw.toolbar.undo.text = 'حذف آخر نقطة';
L.drawLocal.draw.toolbar.actions.text = 'إلغاء';
L.drawLocal.draw.toolbar.finish.text = 'إنهاء';

function layerToPolygonArray(layer) {
  const latlngs = layer.getLatLngs();
  const ring = Array.isArray(latlngs[0]) ? latlngs[0] : latlngs;
  return ring.map((p) => [p.lat, p.lng]);
}

export default function RegionEdit() {
  const { id } = useParams();
  const isNew = !id;
  const navigate = useNavigate();

  const [name, setName] = useState('');
  const [color, setColor] = useState('#3388ff');
  const [labelPos, setLabelPos] = useState(null);
  const [hasPolygon, setHasPolygon] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const mapRef = useRef(null);
  const drawnItemsRef = useRef(null);
  const labelMarkerRef = useRef(null);

  // تحميل بيانات المنطقة عند التعديل
  useEffect(() => {
    if (isNew) return;
    api.listRegions()
      .then((regions) => {
        const region = regions.find((r) => r.id === Number(id));
        if (!region) {
          setError('المنطقة غير موجودة');
          return;
        }
        setName(region.name);
        if (region.color) setColor(region.color);
        if (region.labelLat != null && region.labelLng != null) {
          setLabelPos([region.labelLat, region.labelLng]);
        }
        if (region.polygon && drawnItemsRef.current) {
          const layer = L.polygon(region.polygon);
          drawnItemsRef.current.clearLayers();
          drawnItemsRef.current.addLayer(layer);
          setHasPolygon(true);
          mapRef.current?.fitBounds(layer.getBounds(), { padding: [20, 20] });
        }
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id, isNew]);

  // تهيئة الخريطة
  useEffect(() => {
    const map = L.map(mapRef.current).setView(ALEPPO, 12);
    mapRef.current = map;

    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
    }).addTo(map);

    const drawnItems = new L.FeatureGroup();
    drawnItemsRef.current = drawnItems;
    map.addLayer(drawnItems);

    const drawControl = new L.Control.Draw({
      position: 'topleft',
      draw: {
        polygon: { allowIntersection: false, showArea: true },
        polyline: false,
        rectangle: false,
        circle: false,
        circlemarker: false,
        marker: false,
      },
      edit: {
        featureGroup: drawnItems,
        edit: true,
        remove: true,
      },
    });
    map.addControl(drawControl);

    map.on(L.Draw.Event.CREATED, (e) => {
      drawnItems.clearLayers();
      drawnItems.addLayer(e.layer);
      setHasPolygon(true);
    });
    map.on(L.Draw.Event.DELETED, () => {
      setHasPolygon(drawnItems.getLayers().length > 0);
    });

    map.on('click', (e) => {
      setLabelPos([e.latlng.lat, e.latlng.lng]);
    });

    return () => {
      map.remove();
      mapRef.current = null;
      drawnItemsRef.current = null;
      labelMarkerRef.current = null;
    };
  }, []);

  // تحديث لون المضلع المرسوم عند تغيير اللون
  useEffect(() => {
    drawnItemsRef.current?.eachLayer((layer) => layer.setStyle?.({ color }));
  }, [color]);

  // علامة موقع التسمية
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (labelMarkerRef.current) {
      map.removeLayer(labelMarkerRef.current);
      labelMarkerRef.current = null;
    }
    if (labelPos) {
      const marker = L.marker(labelPos, { draggable: true }).addTo(map);
      marker.bindTooltip('موقع اسم المنطقة').openTooltip();
      marker.on('dragend', () => {
        const p = marker.getLatLng();
        setLabelPos([p.lat, p.lng]);
      });
      labelMarkerRef.current = marker;
    }
  }, [labelPos]);

  const onSave = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const layers = drawnItemsRef.current?.getLayers() || [];
      const polygonLayer = layers.find((l) => typeof l.getLatLngs === 'function');
      const polygon = polygonLayer ? layerToPolygonArray(polygonLayer) : null;
      const payload = {
        name,
        color,
        polygon,
        labelLat: labelPos ? labelPos[0] : null,
        labelLng: labelPos ? labelPos[1] : null,
      };
      if (isNew) await api.createRegion(payload);
      else await api.updateRegion(Number(id), payload);
      navigate('/regions');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return <p>جارٍ التحميل…</p>;

  return (
    <div>
      <h1>{isNew ? 'إضافة منطقة جديدة' : `تعديل المنطقة: ${name}`}</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <form onSubmit={onSave}>
          <div className="form-grid">
            <div className="form-field">
              <label>اسم المنطقة</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} required />
            </div>
            <div className="form-field">
              <label>اللون</label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
            </div>
          </div>

          <p className="muted">
            استخدم أداة الرسم في الخريطة لرسم حدود المنطقة. انقر في أي مكان على الخريطة لتحديد موقع اسم المنطقة (التسمية).
          </p>
          <p className="muted">
            الحدود: {hasPolygon ? 'مرسومة' : 'غير مرسومة'}
            {labelPos && <> — موقع التسمية: {labelPos[0].toFixed(5)}, {labelPos[1].toFixed(5)}</>}
          </p>

          <div ref={mapRef} className="map-container" style={{ marginBottom: 16 }} />

          <div className="btn-row">
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? 'جارٍ الحفظ…' : 'حفظ'}
            </button>
            <button className="btn btn-secondary" type="button" onClick={() => navigate('/regions')}>
              إلغاء
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
