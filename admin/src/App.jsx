import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import Login from './pages/Login.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Users from './pages/Users.jsx';
import Regions from './pages/Regions.jsx';
import RegionEdit from './pages/RegionEdit.jsx';
import Stores from './pages/Stores.jsx';
import StoreEdit from './pages/StoreEdit.jsx';
import Submissions from './pages/Submissions.jsx';
import Import from './pages/Import.jsx';

function RequireAuth({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div className="page-center">جارٍ التحميل…</div>;
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <RequireAuth>
            <Layout />
          </RequireAuth>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="users" element={<Users />} />
        <Route path="regions" element={<Regions />} />
        <Route path="regions/new" element={<RegionEdit />} />
        <Route path="regions/:id/edit" element={<RegionEdit />} />
        <Route path="stores" element={<Stores />} />
        <Route path="stores/new" element={<StoreEdit />} />
        <Route path="stores/:id/edit" element={<StoreEdit />} />
        <Route path="submissions" element={<Submissions />} />
        <Route path="import" element={<Import />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
