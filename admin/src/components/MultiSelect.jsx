import { useEffect, useRef, useState } from 'react';

/**
 * قائمة منسدلة متعددة التحديد.
 * options: [{ value, label }] — value: array of selected values — onChange(newArray)
 */
export default function MultiSelect({ options, value, onChange, placeholder = 'الكل' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, [open]);

  const toggle = (v) => {
    onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v]);
  };

  let buttonLabel = placeholder;
  if (value.length === 1) {
    buttonLabel = options.find((o) => o.value === value[0])?.label ?? value[0];
  } else if (value.length > 1) {
    buttonLabel = `${value.length} محدد`;
  }

  return (
    <div className="multi-select" ref={ref}>
      <button
        type="button"
        className={`multi-select-btn${value.length ? ' multi-select-active' : ''}`}
        onClick={() => setOpen(!open)}
      >
        <span className="multi-select-label">{buttonLabel}</span>
        <span className="multi-select-arrow">▾</span>
      </button>
      {open && (
        <div className="multi-select-panel">
          {options.map((o) => (
            <label key={o.value}>
              <input
                type="checkbox"
                checked={value.includes(o.value)}
                onChange={() => toggle(o.value)}
              />
              {o.label}
            </label>
          ))}
          {options.length === 0 && <span className="muted">لا خيارات</span>}
        </div>
      )}
    </div>
  );
}
