import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-title">دليل المندوب</div>
        <nav>
          <NavLink to="/" end>لوحة التحكم</NavLink>
          <NavLink to="/users">المستخدمون</NavLink>
          <NavLink to="/regions">المناطق</NavLink>
          <NavLink to="/stores">المحلات</NavLink>
          <NavLink to="/submissions">المحلات الميدانية</NavLink>
          <NavLink to="/import">استيراد KMZ</NavLink>
        </nav>
        <div className="sidebar-footer">
          <span className="sidebar-user">{user?.name}</span>
          <button className="btn btn-secondary" onClick={handleLogout}>تسجيل الخروج</button>
        </div>
      </aside>
      <main className="content">
        <Outlet />
      </main>
    </div>
  );
}
