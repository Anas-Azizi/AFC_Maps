import { useCallback, useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';

const FILTER_KEYS = [
  'q', 'code', 'name', 'address', 'managerName', 'phone',
  'regionId', 'governate', 'category', 'shopClass', 'accountType', 'status', 'mapShow',
  'repName', 'visitDay',
];

const TEXT_KEYS = ['q', 'code', 'name', 'address', 'managerName', 'phone'];

const EMPTY_FILTERS = Object.fromEntries(FILTER_KEYS.map((k) => [k, '']));

const ALL_COLUMNS = [
  { key: 'code', label: 'الكود' },
  { key: 'name', label: 'اسم الزبون' },
  { key: 'accountType', label: 'نوع الحساب' },
  { key: 'status', label: 'الحالة' },
  { key: 'mapShow', label: 'يظهر بالتطبيق' },
  { key: 'category', label: 'طبيعة العمل' },
  { key: 'shopClass', label: 'الفئة' },
  { key: 'managerName', label: 'اسم المسؤول' },
  { key: 'governate', label: 'المحافظة' },
  { key: 'region', label: 'المنطقة' },
  { key: 'address', label: 'العنوان' },
  { key: 'phone', label: 'الموبايل' },
  { key: 'whatsapp', label: 'الواتس' },
  { key: 'lat', label: 'Latitude' },
  { key: 'lng', label: 'Longitude' },
  { key: 'visits', label: 'الزيارات' },
  { key: 'actions', label: 'إجراءات' },
];

const DEFAULT_VISIBLE = ['code', 'name', 'region', 'visits', 'status', 'mapShow', 'actions'];

const PAGE_SIZES = [50, 100, 200, 500];

const BULK_FIELDS = [
  { key: 'mapShow', label: 'يظهر بالتطبيق' },
  { key: 'status', label: 'الحالة' },
  { key: 'regionId', label: 'المنطقة' },
  { key: 'governate', label: 'المحافظة' },
  { key: 'category', label: 'طبيعة العمل' },
  { key: 'shopClass', label: 'الفئة' },
  { key: 'managerName', label: 'اسم المسؤول' },
  { key: 'accountType', label: 'نوع الحساب' },
];

function loadVisibleCols() {
  try {
    const saved = JSON.parse(localStorage.getItem('stores_columns'));
    if (Array.isArray(saved) && saved.length) {
      const valid = saved.filter((k) => ALL_COLUMNS.some((c) => c.key === k));
      if (valid.length) return valid;
    }
  } catch {
    // تجاهل القيمة المحفوظة التالفة
  }
  return DEFAULT_VISIBLE;
}

export default function Stores() {
  const [searchParams, setSearchParams] = useSearchParams();

  const [filters, setFilters] = useState(() => {
    const f = { ...EMPTY_FILTERS };
    for (const k of FILTER_KEYS) f[k] = searchParams.get(k) || '';
    return f;
  });
  const [textValues, setTextValues] = useState(() => {
    const t = {};
    for (const k of TEXT_KEYS) t[k] = searchParams.get(k) || '';
    return t;
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  const [rows, setRows] = useState([]);
  const [total, setTotal] = useState(0);
  const [regions, setRegions] = useState([]);
  const [options, setOptions] = useState({ governates: [], categories: [], shopClasses: [], accountTypes: [], statuses: [], reps: [], visitDays: [] });
  const [visibleCols, setVisibleCols] = useState(loadVisibleCols);
  const [showColPicker, setShowColPicker] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);

  const [selected, setSelected] = useState(() => new Set());
  const [allFiltered, setAllFiltered] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkField, setBulkField] = useState('mapShow');
  const [bulkValue, setBulkValue] = useState('');
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    api.listRegions().then(setRegions).catch((e) => setError(e.message));
    api.filterOptions().then((o) => setOptions({ governates: [], categories: [], shopClasses: [], accountTypes: [], statuses: [], reps: [], visitDays: [], ...o })).catch(() => {});
  }, []);

  useEffect(() => {
    localStorage.setItem('stores_columns', JSON.stringify(visibleCols));
  }, [visibleCols]);

  // مزامنة q و regionId مع عنوان الصفحة لتعمل روابط التنقل العميق
  useEffect(() => {
    if ((searchParams.get('q') || '') === filters.q && (searchParams.get('regionId') || '') === filters.regionId) return;
    const params = {};
    if (filters.regionId) params.regionId = filters.regionId;
    if (filters.q) params.q = filters.q;
    setSearchParams(params, { replace: true });
  }, [filters.q, filters.regionId, searchParams, setSearchParams]);

  // تأخير بسيط لفلاتر النصوص أثناء الكتابة
  useEffect(() => {
    const timer = setTimeout(() => {
      setFilters((prev) => {
        const next = { ...prev };
        let changed = false;
        for (const k of TEXT_KEYS) {
          if (prev[k] !== textValues[k]) {
            next[k] = textValues[k];
            changed = true;
          }
        }
        if (changed) setPage(1);
        return changed ? next : prev;
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [textValues]);

  const load = useCallback(() => {
    setLoading(true);
    api.listStores({ ...filters, page, pageSize })
      .then((res) => {
        setRows(res.rows || []);
        setTotal(res.total || 0);
      })
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters, page, pageSize]);

  useEffect(load, [load]);

  const regionName = (id) => regions.find((r) => r.id === id)?.name || '—';

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
    setPage(1);
  };

  const activeFilters = () => {
    const out = {};
    for (const [k, v] of Object.entries(filters)) {
      if (v !== '' && v !== undefined && v !== null) out[k] = v;
    }
    return out;
  };

  const clearSelection = () => {
    setSelected(new Set());
    setAllFiltered(false);
  };

  const toggleRow = (id) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const pageIds = rows.map((s) => s.id);
  const allPageSelected = pageIds.length > 0 && pageIds.every((id) => selected.has(id));

  const togglePage = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allPageSelected) pageIds.forEach((id) => next.delete(id));
      else pageIds.forEach((id) => next.add(id));
      return next;
    });
  };

  const selectionCount = allFiltered ? total : selected.size;

  const buildBulkSet = () => {
    if (bulkField === 'mapShow') return { mapShow: bulkValue === '1' };
    if (bulkField === 'regionId') return { regionId: bulkValue === '' ? '' : Number(bulkValue) };
    return { [bulkField]: bulkValue };
  };

  const applyBulk = async () => {
    setError('');
    setSuccess('');
    if (bulkField === 'mapShow' && bulkValue === '') {
      setError('اختر قيمة للحقل');
      return;
    }
    if (!window.confirm(`سيتم تعديل ${selectionCount} زبوناً. هل أنت متأكد؟`)) return;
    setBulkBusy(true);
    try {
      const payload = {
        ...(allFiltered ? { allFiltered: true, filters: activeFilters() } : { ids: [...selected] }),
        set: buildBulkSet(),
      };
      const res = await api.bulkUpdateStores(payload);
      setSuccess(`تم تعديل ${res.updated} زبوناً بنجاح`);
      clearSelection();
      setBulkOpen(false);
      setBulkValue('');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBulkBusy(false);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`هل أنت متأكد من حذف الزبون «${s.name}»؟`)) return;
    setError('');
    setSuccess('');
    try {
      await api.deleteStore(s.id);
      setSelected((prev) => {
        const next = new Set(prev);
        next.delete(s.id);
        return next;
      });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const toggleMapShow = async (s) => {
    setError('');
    setSuccess('');
    const next = !s.mapShow;
    const prev = rows;
    setRows(rows.map((x) => (x.id === s.id ? { ...x, mapShow: next ? 1 : 0 } : x)));
    try {
      await api.updateStore(s.id, { mapShow: next });
    } catch (err) {
      setRows(prev);
      setError(err.message);
    }
  };

  const exportCsv = async () => {
    setError('');
    setSuccess('');
    setExporting(true);
    try {
      await api.exportStores(filters);
    } catch (err) {
      setError(err.message);
    } finally {
      setExporting(false);
    }
  };

  const toggleCol = (key) => {
    setVisibleCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const dash = (v) => (v === null || v === undefined || v === '' ? '—' : v);
  const coord = (v) => (v == null ? '—' : Number(v).toFixed(6));

  const visitsSummary = (s) =>
    (s.visits || [])
      .map((v) => [v.repName, v.invoiceType, v.visitDay].filter(Boolean).join(' - '))
      .join(' • ');

  const visitsTitle = (s) =>
    (s.visits || [])
      .map((v) => [v.repName, v.invoiceType, v.visitDay].filter(Boolean).join(' - '))
      .join('\n');

  const columns = ALL_COLUMNS.filter((c) => visibleCols.includes(c.key));

  const renderFilterCell = (col) => {
    switch (col.key) {
      case 'code':
      case 'name':
      case 'address':
      case 'managerName':
      case 'phone':
        return (
          <input
            type="text"
            value={textValues[col.key]}
            onChange={(e) => setTextValues({ ...textValues, [col.key]: e.target.value })}
          />
        );
      case 'region':
        return (
          <select value={filters.regionId} onChange={(e) => setFilter('regionId', e.target.value)}>
            <option value="">الكل</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        );
      case 'governate':
        return (
          <select value={filters.governate} onChange={(e) => setFilter('governate', e.target.value)}>
            <option value="">الكل</option>
            {options.governates.map((g) => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        );
      case 'category':
        return (
          <select value={filters.category} onChange={(e) => setFilter('category', e.target.value)}>
            <option value="">الكل</option>
            {options.categories.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        );
      case 'shopClass':
        return (
          <select value={filters.shopClass} onChange={(e) => setFilter('shopClass', e.target.value)}>
            <option value="">الكل</option>
            {options.shopClasses.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        );
      case 'accountType':
        return (
          <select value={filters.accountType} onChange={(e) => setFilter('accountType', e.target.value)}>
            <option value="">الكل</option>
            {options.accountTypes.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        );
      case 'status':
        return (
          <select value={filters.status} onChange={(e) => setFilter('status', e.target.value)}>
            <option value="">الكل</option>
            <option value="active">فعّال</option>
            {options.statuses.filter((s) => s).map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        );
      case 'mapShow':
        return (
          <select value={filters.mapShow} onChange={(e) => setFilter('mapShow', e.target.value)}>
            <option value="">الكل</option>
            <option value="1">نعم</option>
            <option value="0">لا</option>
          </select>
        );
      case 'visits':
        return (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <select value={filters.repName} onChange={(e) => setFilter('repName', e.target.value)}>
              <option value="">كل المناديب</option>
              {options.reps.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </select>
            <select value={filters.visitDay} onChange={(e) => setFilter('visitDay', e.target.value)}>
              <option value="">كل الأيام</option>
              {options.visitDays.map((d) => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        );
      default:
        return null;
    }
  };

  const renderCell = (s, col) => {
    switch (col.key) {
      case 'code': return dash(s.code);
      case 'name': return s.name;
      case 'accountType': return dash(s.accountType);
      case 'status':
        return s.status ? (
          <span className="badge badge-gray">{s.status}</span>
        ) : (
          <span className="badge badge-green">فعّال</span>
        );
      case 'mapShow':
        return (
          <input
            type="checkbox"
            checked={!!s.mapShow}
            onChange={() => toggleMapShow(s)}
            title="إظهار/إخفاء في التطبيق"
          />
        );
      case 'category': return dash(s.category);
      case 'shopClass': return dash(s.shopClass);
      case 'managerName': return dash(s.managerName);
      case 'governate': return dash(s.governate);
      case 'region': return regionName(s.regionId);
      case 'address': return dash(s.address);
      case 'phone': return dash(s.phone);
      case 'whatsapp': return dash(s.whatsapp);
      case 'lat': return coord(s.lat);
      case 'lng': return coord(s.lng);
      case 'visits': {
        const summary = visitsSummary(s);
        return (
          <div className="cell-visits" title={visitsTitle(s) || undefined}>
            {summary || '—'}
          </div>
        );
      }
      case 'actions':
        return (
          <div className="btn-row">
            <Link to={`/stores/${s.id}/edit`} className="btn btn-secondary btn-small">تعديل</Link>
            <button className="btn btn-danger btn-small" onClick={() => remove(s)}>حذف</button>
          </div>
        );
      default:
        return null;
    }
  };

  const renderBulkValueControl = () => {
    switch (bulkField) {
      case 'mapShow':
        return (
          <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
            <option value="">اختر…</option>
            <option value="1">نعم</option>
            <option value="0">لا</option>
          </select>
        );
      case 'status':
        return (
          <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
            <option value="">فعّال</option>
            <option value="cancelled">cancelled</option>
          </select>
        );
      case 'regionId':
        return (
          <select value={bulkValue} onChange={(e) => setBulkValue(e.target.value)}>
            <option value="">بدون منطقة</option>
            {regions.map((r) => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </select>
        );
      case 'managerName':
        return (
          <input
            type="text"
            value={bulkValue}
            onChange={(e) => setBulkValue(e.target.value)}
            placeholder="اتركه فارغاً للمسح"
          />
        );
      case 'governate':
      case 'category':
      case 'shopClass':
      case 'accountType': {
        const listId = `bulk-${bulkField}`;
        const values =
          bulkField === 'governate' ? options.governates :
          bulkField === 'category' ? options.categories :
          bulkField === 'shopClass' ? options.shopClasses :
          options.accountTypes;
        return (
          <>
            <input
              type="text"
              list={listId}
              value={bulkValue}
              onChange={(e) => setBulkValue(e.target.value)}
              placeholder="اتركه فارغاً للمسح"
            />
            <datalist id={listId}>
              {values.map((v) => (
                <option key={v} value={v} />
              ))}
            </datalist>
          </>
        );
      }
      default:
        return null;
    }
  };

  const isAll = pageSize === 'all';
  const totalPages = isAll ? 1 : Math.max(1, Math.ceil(total / pageSize));

  return (
    <div>
      <h1>الزبائن</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <div className="filters-row">
          <div className="form-field">
            <label>بحث بالاسم أو الكود</label>
            <input
              type="text"
              value={textValues.q}
              onChange={(e) => setTextValues({ ...textValues, q: e.target.value })}
            />
          </div>
          <div className="col-picker-wrap">
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowColPicker(!showColPicker)}
            >
              الأعمدة
            </button>
            {showColPicker && (
              <div className="col-picker">
                {ALL_COLUMNS.map((c) => (
                  <label key={c.key}>
                    <input
                      type="checkbox"
                      checked={visibleCols.includes(c.key)}
                      onChange={() => toggleCol(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={exportCsv}
            disabled={exporting}
          >
            {exporting ? 'جارٍ التصدير…' : 'تصدير Excel'}
          </button>
          <Link to="/stores/new" className="btn btn-primary">إضافة زبون جديد</Link>
        </div>

        <div className="filters-row" style={{ alignItems: 'center' }}>
          <div className="form-field" style={{ minWidth: 0 }}>
            <label>عدد الصفوف</label>
            <select
              value={pageSize}
              onChange={(e) => {
                setPageSize(e.target.value === 'all' ? 'all' : Number(e.target.value));
                setPage(1);
              }}
              style={{ width: 'auto' }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>{n}</option>
              ))}
              <option value="all">الكل</option>
            </select>
          </div>
          <span className="muted">إجمالي النتائج: {total}</span>
        </div>

        {selectionCount > 0 && (
          <div className="filters-row alert alert-warning" style={{ alignItems: 'center', marginBottom: 12 }}>
            {allFiltered ? (
              <span>محدد كل النتائج المفلترة ({total})</span>
            ) : (
              <>
                <span>محدد {selected.size} زبوناً</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  onClick={() => {
                    setAllFiltered(true);
                    setSelected(new Set());
                  }}
                >
                  تحديد كل النتائج ({total})
                </button>
              </>
            )}
            <button
              type="button"
              className="btn btn-primary btn-small"
              onClick={() => setBulkOpen(true)}
            >
              تعديل جماعي
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={clearSelection}>
              إلغاء التحديد
            </button>
          </div>
        )}

        {loading ? (
          <p>جارٍ التحميل…</p>
        ) : (
          <>
            <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>
                    <input
                      type="checkbox"
                      checked={allPageSelected}
                      onChange={togglePage}
                      title="تحديد/إلغاء تحديد صفوف هذه الصفحة"
                    />
                  </th>
                  {columns.map((c) => (
                    <th key={c.key}>{c.label}</th>
                  ))}
                </tr>
                <tr>
                  <th className="filter-cell"></th>
                  {columns.map((c) => (
                    <th key={c.key} className="filter-cell">{renderFilterCell(c)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <input
                        type="checkbox"
                        checked={allFiltered || selected.has(s.id)}
                        disabled={allFiltered}
                        onChange={() => toggleRow(s.id)}
                      />
                    </td>
                    {columns.map((c) => (
                      <td key={c.key}>{renderCell(s, c)}</td>
                    ))}
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr><td colSpan={columns.length + 1} className="muted">لا توجد نتائج</td></tr>
                )}
              </tbody>
            </table>
            </div>

            {!isAll && (
              <div className="filters-row" style={{ alignItems: 'center', marginTop: 12, marginBottom: 0 }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  السابق
                </button>
                <span className="muted">صفحة {page} من {totalPages}</span>
                <button
                  type="button"
                  className="btn btn-secondary btn-small"
                  disabled={page >= totalPages}
                  onClick={() => setPage(page + 1)}
                >
                  التالي
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {bulkOpen && (
        <div className="modal-overlay" onClick={() => !bulkBusy && setBulkOpen(false)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>تعديل جماعي — {selectionCount} زبوناً</h2>
            <div className="form-field" style={{ marginBottom: 12 }}>
              <label>الحقل</label>
              <select
                value={bulkField}
                onChange={(e) => {
                  setBulkField(e.target.value);
                  setBulkValue('');
                }}
              >
                {BULK_FIELDS.map((f) => (
                  <option key={f.key} value={f.key}>{f.label}</option>
                ))}
              </select>
            </div>
            <div className="form-field" style={{ marginBottom: 16 }}>
              <label>القيمة الجديدة</label>
              {renderBulkValueControl()}
            </div>
            <div className="btn-row">
              <button
                type="button"
                className="btn btn-primary"
                onClick={applyBulk}
                disabled={bulkBusy}
              >
                {bulkBusy ? 'جارٍ التنفيذ…' : 'تنفيذ'}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setBulkOpen(false)}
                disabled={bulkBusy}
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
