import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';
import MultiSelect from '../components/MultiSelect.jsx';

const emptyForm = { name: '', username: '', password: '', role: 'rep' };

const DEFAULT_PERMISSIONS = {
  reps: null,
  canFilterByRep: true,
  showPhone: true,
  showWhatsapp: true,
  showVisits: true,
  showCategory: true,
  showShopClass: true,
  showGovernate: true,
  showAddress: true,
  canAddNote: true,
  canDrawRoute: true,
  canShareLocation: true,
  canUpdateLocation: true,
  canUpdateBoth: true,
  canRename: true,
  forceRealGps: true,
  canAddStore: true,
  showServerAddress: true,
  canDownloadMaps: true,
};

const PERMISSION_FIELDS = [
  ['canFilterByRep', 'فلترة الدبابيس حسب المندوب'],
  ['showPhone', 'رؤية رقم الهاتف'],
  ['showWhatsapp', 'رؤية رقم الواتس'],
  ['showVisits', 'رؤية زيارات المندوبين'],
  ['showCategory', 'رؤية طبيعة العمل'],
  ['showShopClass', 'رؤية الفئة'],
  ['showGovernate', 'رؤية المحافظة'],
  ['showAddress', 'رؤية العنوان'],
  ['canAddNote', 'إضافة ملاحظة'],
  ['canDrawRoute', 'رسم المسار'],
  ['canShareLocation', 'مشاركة الموقع واتساب'],
  ['canUpdateLocation', 'تحديث الموقع'],
  ['canUpdateBoth', 'إلغاء نهائي'],
  ['canRename', 'تعديل اسم الزبون'],
  ['forceRealGps', 'إجبار استخدام موقع GPS الحقيقي'],
  ['canAddStore', 'تسجيل محل جديد'],
  ['showServerAddress', 'رؤية عنوان الخادم'],
  ['canDownloadMaps', 'تنزيل الخرائط أوفلاين'],
];

function isDefaultPermissions(perms) {
  if (!perms) return true;
  if (perms.reps != null && (!Array.isArray(perms.reps) || perms.reps.length)) return false;
  return PERMISSION_FIELDS.every(([key]) => perms[key] !== false);
}

function PermissionsEditor({ value, onChange, reps }) {
  const effective = { ...DEFAULT_PERMISSIONS, ...(value || {}) };
  const repOptions = reps.map((r) => ({ value: r, label: r }));

  const setKey = (key, checked) => onChange({ ...effective, [key]: checked });

  return (
    <div className="perms-editor">
      <h2>صلاحيات التطبيق</h2>
      <div className="perms-grid">
        {PERMISSION_FIELDS.map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={!!effective[key]}
              onChange={(e) => setKey(key, e.target.checked)}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="form-field" style={{ marginTop: 12, maxWidth: 420 }}>
        <label>تقييد الرؤية بمندوبين محددين</label>
        <MultiSelect
          options={repOptions}
          value={effective.reps ?? []}
          onChange={(arr) => onChange({ ...effective, reps: arr.length ? arr : null })}
          placeholder="كل المندوبين"
        />
        <span className="muted">فارغ = يرى زبائن كل المندوبين</span>
      </div>
      <div className="btn-row" style={{ marginTop: 8 }}>
        <button type="button" className="btn btn-secondary btn-small" onClick={() => onChange(null)}>
          إعادة للافتراضي
        </button>
        {value === null && <span className="muted">الصلاحيات حالياً على الوضع الافتراضي (كاملة)</span>}
      </div>
    </div>
  );
}

export default function Users() {
  const [users, setUsers] = useState([]);
  const [reps, setReps] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [perms, setPerms] = useState(null);
  const [editUser, setEditUser] = useState(null);
  const [editForm, setEditForm] = useState({ name: '', role: 'rep' });
  const [editPerms, setEditPerms] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.listUsers().then(setUsers).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    api.filterOptions().then((o) => setReps(o.reps || [])).catch(() => {});
  }, []);

  const onCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await api.createUser({ ...form, permissions: perms });
      setForm(emptyForm);
      setPerms(null);
      setSuccess('تم إنشاء المستخدم بنجاح');
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (u) => {
    setEditUser(u);
    setEditForm({ name: u.name, role: u.role });
    setEditPerms(isDefaultPermissions(u.permissions) ? null : u.permissions);
  };

  const onSaveEdit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await api.updateUser(editUser.id, {
        name: editForm.name,
        role: editForm.role,
        active: editUser.active,
        permissions: editPerms,
      });
      setSuccess('تم حفظ التعديلات بنجاح');
      setEditUser(null);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (u) => {
    setError('');
    try {
      await api.updateUser(u.id, { name: u.name, role: u.role, active: !u.active });
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  const resetPassword = async (u) => {
    const password = window.prompt(`كلمة المرور الجديدة للمستخدم «${u.name}»:`);
    if (!password) return;
    setError('');
    setSuccess('');
    try {
      await api.resetPassword(u.id, password);
      setSuccess('تم تغيير كلمة المرور');
    } catch (err) {
      setError(err.message);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`هل أنت متأكد من حذف المستخدم «${u.name}»؟`)) return;
    setError('');
    try {
      await api.deleteUser(u.id);
      load();
    } catch (err) {
      setError(err.message);
    }
  };

  return (
    <div>
      <h1>المستخدمون</h1>
      {error && <div className="alert alert-error">{error}</div>}
      {success && <div className="alert alert-success">{success}</div>}

      <div className="card">
        <h2>إضافة مستخدم جديد</h2>
        <form onSubmit={onCreate}>
          <div className="form-grid">
            <div className="form-field">
              <label>الاسم</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>اسم المستخدم</label>
              <input
                type="text"
                value={form.username}
                onChange={(e) => setForm({ ...form, username: e.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>كلمة المرور</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
              />
            </div>
            <div className="form-field">
              <label>الدور</label>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                <option value="rep">مندوب</option>
                <option value="admin">مدير</option>
              </select>
            </div>
          </div>
          <PermissionsEditor value={perms} onChange={setPerms} reps={reps} />
          <div style={{ marginTop: 16 }}>
            <button className="btn btn-primary" type="submit" disabled={busy}>إضافة</button>
          </div>
        </form>
      </div>

      <div className="card">
        <table>
          <thead>
            <tr>
              <th>الاسم</th>
              <th>اسم المستخدم</th>
              <th>الدور</th>
              <th>الحالة</th>
              <th>الصلاحيات</th>
              <th>إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td>
                <td>{u.username}</td>
                <td>{u.role === 'admin' ? 'مدير' : 'مندوب'}</td>
                <td>
                  <span className={`badge ${u.active ? 'badge-green' : 'badge-red'}`}>
                    {u.active ? 'فعّال' : 'معطّل'}
                  </span>
                </td>
                <td>
                  <span className={`badge ${isDefaultPermissions(u.permissions) ? 'badge-green' : 'badge-gray'}`}>
                    {isDefaultPermissions(u.permissions) ? 'كاملة' : 'مخصصة'}
                  </span>
                </td>
                <td>
                  <div className="btn-row">
                    <button className="btn btn-secondary btn-small" onClick={() => openEdit(u)}>
                      تعديل
                    </button>
                    <button className="btn btn-secondary btn-small" onClick={() => toggleActive(u)}>
                      {u.active ? 'تعطيل' : 'تفعيل'}
                    </button>
                    <button className="btn btn-secondary btn-small" onClick={() => resetPassword(u)}>
                      إعادة تعيين كلمة المرور
                    </button>
                    <button className="btn btn-danger btn-small" onClick={() => remove(u)}>حذف</button>
                  </div>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr><td colSpan="6" className="muted">لا يوجد مستخدمون</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editUser && (
        <div className="modal-overlay" onClick={() => !busy && setEditUser(null)}>
          <div className="modal-box" onClick={(e) => e.stopPropagation()}>
            <h2>تعديل المستخدم: {editUser.name}</h2>
            <form onSubmit={onSaveEdit}>
              <div className="form-field" style={{ marginBottom: 12 }}>
                <label>الاسم</label>
                <input
                  type="text"
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  required
                />
              </div>
              <div className="form-field" style={{ marginBottom: 12 }}>
                <label>الدور</label>
                <select
                  value={editForm.role}
                  onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                >
                  <option value="rep">مندوب</option>
                  <option value="admin">مدير</option>
                </select>
              </div>
              <PermissionsEditor value={editPerms} onChange={setEditPerms} reps={reps} />
              <div className="btn-row" style={{ marginTop: 16 }}>
                <button className="btn btn-primary" type="submit" disabled={busy}>
                  {busy ? 'جارٍ الحفظ…' : 'حفظ'}
                </button>
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => setEditUser(null)}
                  disabled={busy}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
