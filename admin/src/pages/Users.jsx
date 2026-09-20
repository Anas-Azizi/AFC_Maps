import { useCallback, useEffect, useState } from 'react';
import { api } from '../api.js';

const emptyForm = { name: '', username: '', password: '', role: 'rep' };

export default function Users() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.listUsers().then(setUsers).catch((e) => setError(e.message));
  }, []);

  useEffect(load, [load]);

  const onCreate = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    setBusy(true);
    try {
      await api.createUser(form);
      setForm(emptyForm);
      setSuccess('تم إنشاء المستخدم بنجاح');
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
          <button className="btn btn-primary" type="submit" disabled={busy}>إضافة</button>
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
                  <div className="btn-row">
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
              <tr><td colSpan="5" className="muted">لا يوجد مستخدمون</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
