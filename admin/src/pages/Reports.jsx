import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import MultiSelect from '../components/MultiSelect.jsx';

const METRICS = [
  { key: 'stores', label: 'عدد الزبائن' },
  { key: 'visits', label: 'عدد الزيارات' },
];

const PRESETS = [
  { label: 'الزبائن حسب المنطقة', rows: 'region', cols: '', metric: 'stores' },
  { label: 'الزبائن حسب المندوب ويوم الزيارة', rows: 'repName', cols: 'visitDay', metric: 'visits' },
  { label: 'الملغون حسب المنطقة', rows: 'region', cols: 'status', metric: 'stores' },
  { label: 'بلا إحداثيات حسب المنطقة', rows: 'region', cols: 'hasCoords', metric: 'stores' },
  { label: 'بلا زيارات حسب المنطقة', rows: 'region', cols: 'hasVisits', metric: 'stores' },
];

const MULTI_KEYS = ['regionId', 'governate', 'category', 'shopClass', 'accountType', 'status', 'repName', 'visitDay'];
const SINGLE_KEYS = ['mapShow', 'hasCoords', 'hasVisits'];

const FILTER_LABELS = {
  regionId: 'المنطقة',
  governate: 'المحافظة',
  status: 'الحالة',
  mapShow: 'يظهر بالتطبيق',
  category: 'طبيعة العمل',
  shopClass: 'الفئة',
  accountType: 'نوع الحساب',
  repName: 'المندوب',
  visitDay: 'يوم الزيارة',
  hasCoords: 'الإحداثيات',
  hasVisits: 'الزيارات',
};

const EMPTY_REPORT_FILTERS = {
  ...Object.fromEntries(SINGLE_KEYS.map((k) => [k, ''])),
  ...Object.fromEntries(MULTI_KEYS.map((k) => [k, []])),
};

const EMPTY_OPT = { value: '__empty__', label: '(فارغ)' };

function dimToFilter(dimKey, label, regions) {
  if (!label || label === '(فارغ)') return null;
  switch (dimKey) {
    case 'region': {
      const r = regions.find((x) => x.name === label);
      return r ? { regionId: String(r.id) } : null;
    }
    case 'status':
      return { status: label === 'فعّال' ? '__empty__' : label };
    case 'mapShow':
      return { mapShow: label === 'نعم' ? '1' : '0' };
    case 'hasCoords':
      return { hasCoords: label === 'بإحداثيات' ? '1' : '0' };
    case 'repName':
      return { repName: label };
    case 'visitDay':
      return { visitDay: label };
    case 'governate':
      return { governate: label };
    case 'category':
      return { category: label };
    case 'shopClass':
      return { shopClass: label };
    case 'managerName':
      return { managerName: label };
    default:
      return null;
  }
}

export default function Reports() {
  const navigate = useNavigate();
  const [dimensions, setDimensions] = useState([]);
  const [regions, setRegions] = useState([]);
  const [options, setOptions] = useState({ governates: [], categories: [], shopClasses: [], accountTypes: [], statuses: [], reps: [], visitDays: [] });
  const [rowsDim, setRowsDim] = useState('region');
  const [colsDim, setColsDim] = useState('');
  const [metric, setMetric] = useState('stores');
  const [filters, setFilters] = useState(EMPTY_REPORT_FILTERS);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.reportDimensions().then(setDimensions).catch((e) => setError(e.message));
    api.listRegions().then(setRegions).catch(() => {});
    api.filterOptions().then((o) => setOptions({ governates: [], categories: [], shopClasses: [], accountTypes: [], statuses: [], reps: [], visitDays: [], ...o })).catch(() => {});
  }, []);

  const activeFilters = () => {
    const out = {};
    for (const [k, v] of Object.entries(filters)) {
      if (Array.isArray(v)) {
        if (v.length) out[k] = v.join(',');
      } else if (v !== '' && v !== undefined && v !== null) {
        out[k] = v;
      }
    }
    return out;
  };

  useEffect(() => {
    if (!rowsDim) return;
    setLoading(true);
    setError('');
    api.pivotReport({ rows: rowsDim, cols: colsDim || undefined, metric, ...activeFilters() })
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowsDim, colsDim, metric, filters]);

  const applyPreset = (p) => {
    setRowsDim(p.rows);
    setColsDim(p.cols);
    setMetric(p.metric);
  };

  const setFilter = (key, value) => setFilters((prev) => ({ ...prev, [key]: value }));

  const cellValue = (rowLabel, colLabel) =>
    data?.cells?.[`${rowLabel}||${colLabel}`] ?? 0;

  const navigateWith = (extra) => {
    const params = new URLSearchParams({ ...activeFilters(), ...extra });
    navigate(`/stores?${params.toString()}`);
  };

  const onCellClick = (rowLabel, colLabel) => {
    const rowFilter = dimToFilter(rowsDim, rowLabel, regions);
    const colFilter = colsDim ? dimToFilter(colsDim, colLabel, regions) : null;
    if (rowFilter === null || (colsDim && colFilter === null)) return;
    navigateWith({ ...rowFilter, ...(colFilter || {}) });
  };

  const onRowTotalClick = (rowLabel) => {
    const rowFilter = dimToFilter(rowsDim, rowLabel, regions);
    if (rowFilter === null) return;
    navigateWith(rowFilter);
  };

  const onColTotalClick = (colLabel) => {
    if (!colsDim) return;
    const colFilter = dimToFilter(colsDim, colLabel, regions);
    if (colFilter === null) return;
    navigateWith(colFilter);
  };

  const isCellClickable = (rowLabel, colLabel) =>
    dimToFilter(rowsDim, rowLabel, regions) !== null &&
    (!colsDim || dimToFilter(colsDim, colLabel, regions) !== null);

  const isRowTotalClickable = (rowLabel) => dimToFilter(rowsDim, rowLabel, regions) !== null;

  const isColTotalClickable = (colLabel) =>
    !!colsDim && dimToFilter(colsDim, colLabel, regions) !== null;

  const valueLabel = (key, v) => {
    if (v === '__empty__') return key === 'status' ? 'فعّال' : '(فارغ)';
    if (key === 'regionId') return regions.find((r) => String(r.id) === String(v))?.name || v;
    if (key === 'mapShow') return v === '1' ? 'نعم' : 'لا';
    if (key === 'hasCoords') return v === '1' ? 'بإحداثيات' : 'بلا إحداثيات';
    if (key === 'hasVisits') return v === '1' ? 'له زيارات' : 'بلا زيارات';
    return v;
  };

  const filterEntryLabel = ([k, v]) =>
    `${FILTER_LABELS[k]}=${(Array.isArray(v) ? v : [v]).map((x) => valueLabel(k, x)).join('،')}`;

  const activeFilterEntries = Object.entries(filters).filter(([, v]) =>
    Array.isArray(v) ? v.length > 0 : v !== ''
  );

  const dimLabel = (key) => dimensions.find((d) => d.key === key)?.label || key;

  const regionOptions = [EMPTY_OPT, ...regions.map((r) => ({ value: String(r.id), label: r.name }))];
  const governateOptions = [EMPTY_OPT, ...options.governates.map((g) => ({ value: g, label: g }))];
  const categoryOptions = [EMPTY_OPT, ...options.categories.map((c) => ({ value: c, label: c }))];
  const shopClassOptions = [EMPTY_OPT, ...options.shopClasses.map((c) => ({ value: c, label: c }))];
  const accountTypeOptions = [EMPTY_OPT, ...options.accountTypes.map((t) => ({ value: t, label: t }))];
  const statusOptions = [
    { value: '__empty__', label: 'فعّال' },
    ...options.statuses.filter(Boolean).map((s) => ({ value: s, label: s })),
  ];
  const repOptions = options.reps.map((r) => ({ value: r, label: r }));
  const visitDayOptions = options.visitDays.map((d) => ({ value: d, label: d }));

  const colLabels = data ? (data.colLabels?.length ? data.colLabels : ['(الكل)']) : [];
  const rowLabels = data?.rowLabels || [];
  const rowTotals = rowLabels.map((rl) => colLabels.reduce((sum, cl) => sum + cellValue(rl, cl), 0));
  const colTotals = colLabels.map((cl) => rowLabels.reduce((sum, rl) => sum + cellValue(rl, cl), 0));
  const grandTotal = rowTotals.reduce((a, b) => a + b, 0);

  return (
    <div>
      <h1>التقارير</h1>
      {error && <div className="alert alert-error">{error}</div>}

      <div className="card">
        <div className="btn-row" style={{ marginBottom: 16 }}>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => applyPreset(p)}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="filters-row">
          <div className="form-field">
            <label>الصفوف</label>
            <select value={rowsDim} onChange={(e) => setRowsDim(e.target.value)}>
              {dimensions.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>الأعمدة</label>
            <select value={colsDim} onChange={(e) => setColsDim(e.target.value)}>
              <option value="">بدون</option>
              {dimensions.map((d) => (
                <option key={d.key} value={d.key}>{d.label}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>القيمة</label>
            <select value={metric} onChange={(e) => setMetric(e.target.value)}>
              {METRICS.map((m) => (
                <option key={m.key} value={m.key}>{m.label}</option>
              ))}
            </select>
          </div>
        </div>

        <h2>فلاتر التقرير</h2>
        <div className="filters-row">
          <div className="form-field">
            <label>المنطقة</label>
            <MultiSelect options={regionOptions} value={filters.regionId} onChange={(v) => setFilter('regionId', v)} />
          </div>
          <div className="form-field">
            <label>المحافظة</label>
            <MultiSelect options={governateOptions} value={filters.governate} onChange={(v) => setFilter('governate', v)} />
          </div>
          <div className="form-field">
            <label>الحالة</label>
            <MultiSelect options={statusOptions} value={filters.status} onChange={(v) => setFilter('status', v)} />
          </div>
          <div className="form-field">
            <label>يظهر بالتطبيق</label>
            <select value={filters.mapShow} onChange={(e) => setFilter('mapShow', e.target.value)}>
              <option value="">الكل</option>
              <option value="1">نعم</option>
              <option value="0">لا</option>
            </select>
          </div>
          <div className="form-field">
            <label>طبيعة العمل</label>
            <MultiSelect options={categoryOptions} value={filters.category} onChange={(v) => setFilter('category', v)} />
          </div>
          <div className="form-field">
            <label>الفئة</label>
            <MultiSelect options={shopClassOptions} value={filters.shopClass} onChange={(v) => setFilter('shopClass', v)} />
          </div>
          <div className="form-field">
            <label>نوع الحساب</label>
            <MultiSelect options={accountTypeOptions} value={filters.accountType} onChange={(v) => setFilter('accountType', v)} />
          </div>
          <div className="form-field">
            <label>المندوب</label>
            <MultiSelect options={repOptions} value={filters.repName} onChange={(v) => setFilter('repName', v)} />
          </div>
          <div className="form-field">
            <label>يوم الزيارة</label>
            <MultiSelect options={visitDayOptions} value={filters.visitDay} onChange={(v) => setFilter('visitDay', v)} />
          </div>
          <div className="form-field">
            <label>الإحداثيات</label>
            <select value={filters.hasCoords} onChange={(e) => setFilter('hasCoords', e.target.value)}>
              <option value="">الكل</option>
              <option value="1">بإحداثيات</option>
              <option value="0">بلا إحداثيات</option>
            </select>
          </div>
          <div className="form-field">
            <label>الزيارات</label>
            <select value={filters.hasVisits} onChange={(e) => setFilter('hasVisits', e.target.value)}>
              <option value="">الكل</option>
              <option value="1">له زيارات</option>
              <option value="0">بلا زيارات</option>
            </select>
          </div>
        </div>

        {activeFilterEntries.length > 0 && (
          <div className="filters-row" style={{ alignItems: 'center' }}>
            <span className="muted">
              فلاتر: {activeFilterEntries.map(filterEntryLabel).join('، ')}
            </span>
            <button
              type="button"
              className="btn btn-secondary btn-small"
              onClick={() => setFilters(EMPTY_REPORT_FILTERS)}
            >
              مسح الفلاتر
            </button>
          </div>
        )}
      </div>

      <div className="card">
        {loading ? (
          <p>جارٍ التحميل…</p>
        ) : !data ? null : (
          <div className="table-wrap">
            <table className="pivot-table">
              <thead>
                <tr>
                  <th>{data.rowsLabel || dimLabel(rowsDim)}</th>
                  {colLabels.map((cl) => (
                    <th key={cl}>{cl}</th>
                  ))}
                  <th>الإجمالي</th>
                </tr>
              </thead>
              <tbody>
                {rowLabels.map((rl, i) => (
                  <tr key={rl}>
                    <th>{rl}</th>
                    {colLabels.map((cl) => {
                      const clickable = isCellClickable(rl, cl);
                      const value = cellValue(rl, cl);
                      return (
                        <td
                          key={cl}
                          className={clickable ? 'cell-link' : undefined}
                          onClick={clickable ? () => onCellClick(rl, cl) : undefined}
                          title={clickable ? 'عرض الزبائن المطابقين' : undefined}
                        >
                          {value === 0 ? '—' : value}
                        </td>
                      );
                    })}
                    <td
                      className={isRowTotalClickable(rl) ? 'pivot-total cell-link' : 'pivot-total'}
                      onClick={isRowTotalClickable(rl) ? () => onRowTotalClick(rl) : undefined}
                      title={isRowTotalClickable(rl) ? 'عرض زبائن هذا الصف' : undefined}
                    >
                      {rowTotals[i]}
                    </td>
                  </tr>
                ))}
                {rowLabels.length === 0 && (
                  <tr><td colSpan={colLabels.length + 2} className="muted">لا توجد بيانات</td></tr>
                )}
              </tbody>
              {rowLabels.length > 0 && (
                <tfoot>
                  <tr>
                    <th>الإجمالي</th>
                    {colTotals.map((t, i) => (
                      <td
                        key={i}
                        className={isColTotalClickable(colLabels[i]) ? 'pivot-total cell-link' : 'pivot-total'}
                        onClick={isColTotalClickable(colLabels[i]) ? () => onColTotalClick(colLabels[i]) : undefined}
                        title={isColTotalClickable(colLabels[i]) ? 'عرض زبائن هذا العمود' : undefined}
                      >
                        {t}
                      </td>
                    ))}
                    <td
                      className="pivot-total cell-link"
                      onClick={() => navigateWith({})}
                      title="عرض كل الزبائن المطابقين للفلاتر"
                    >
                      {grandTotal}
                    </td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
