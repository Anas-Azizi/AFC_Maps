import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';

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

function dimToFilter(dimKey, label, regions) {
  if (!label || label === '(فارغ)') return null;
  switch (dimKey) {
    case 'region': {
      const r = regions.find((x) => x.name === label);
      return r ? { regionId: String(r.id) } : null;
    }
    case 'status':
      return { status: label === 'فعّال' ? 'active' : label };
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
  const [rowsDim, setRowsDim] = useState('region');
  const [colsDim, setColsDim] = useState('');
  const [metric, setMetric] = useState('stores');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.reportDimensions().then(setDimensions).catch((e) => setError(e.message));
    api.listRegions().then(setRegions).catch(() => {});
  }, []);

  useEffect(() => {
    if (!rowsDim) return;
    setLoading(true);
    setError('');
    api.pivotReport({ rows: rowsDim, cols: colsDim || undefined, metric })
      .then(setData)
      .catch((e) => {
        setData(null);
        setError(e.message);
      })
      .finally(() => setLoading(false));
  }, [rowsDim, colsDim, metric]);

  const applyPreset = (p) => {
    setRowsDim(p.rows);
    setColsDim(p.cols);
    setMetric(p.metric);
  };

  const cellValue = (rowLabel, colLabel) =>
    data?.cells?.[`${rowLabel}||${colLabel}`] ?? 0;

  const onCellClick = (rowLabel, colLabel) => {
    const rowFilter = dimToFilter(rowsDim, rowLabel, regions);
    const colFilter = colsDim ? dimToFilter(colsDim, colLabel, regions) : null;
    if (rowFilter === null || (colsDim && colFilter === null)) return;
    const params = new URLSearchParams({ ...rowFilter, ...(colFilter || {}) });
    navigate(`/stores?${params.toString()}`);
  };

  const isCellClickable = (rowLabel, colLabel) =>
    dimToFilter(rowsDim, rowLabel, regions) !== null &&
    (!colsDim || dimToFilter(colsDim, colLabel, regions) !== null);

  const dimLabel = (key) => dimensions.find((d) => d.key === key)?.label || key;

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
                    <td className="pivot-total">{rowTotals[i]}</td>
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
                      <td key={i} className="pivot-total">{t}</td>
                    ))}
                    <td className="pivot-total">{grandTotal}</td>
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
