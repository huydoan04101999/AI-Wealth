import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import WarRoom from './pages/WarRoom';
import Portfolio from './pages/Portfolio';
import CashFlow from './pages/CashFlow';
import Settings from './pages/Settings';
import Users from './pages/Users';
import BackupRestore from './pages/BackupRestore';
import Login from './pages/Login';
import { AuthProvider, useAuth } from './contexts/AuthContext';

const ProtectedRoute = ({ children, adminOnly = false }: { children: React.ReactNode, adminOnly?: boolean }) => {
  const { user, userData, loading } = useAuth();
  
  if (loading) return <div className="flex items-center justify-center h-screen">Đang tải...</div>;
  
  if (!user || !userData) return <Navigate to="/login" />;
  
  if (userData.status !== 'active') return <div className="flex items-center justify-center h-screen">Tài khoản của bạn đã bị khóa.</div>;
  
  if (adminOnly && userData.role !== 'admin') return <Navigate to="/" />;
  
  return <>{children}</>;
};

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route index element={<Dashboard />} />
            <Route path="war-room" element={<WarRoom />} />
            <Route path="portfolio" element={<Portfolio />} />
            <Route path="cashflow" element={<CashFlow />} />
            <Route path="users" element={<ProtectedRoute adminOnly><Users /></ProtectedRoute>} />
            <Route path="backup" element={<ProtectedRoute adminOnly><BackupRestore /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute adminOnly><Settings /></ProtectedRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
