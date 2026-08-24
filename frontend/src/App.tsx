import React from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import CustomerPage from './pages/CustomerPage';
import AgentPage from './pages/AgentPage';
import AdminPage from './pages/AdminPage';
import { IconPackage, IconTruck, IconUsers } from './components/Icons';

const PAGE_META: Record<string, { title: string; subtitle: string }> = {
  CUSTOMER: { title: 'My Deliveries',    subtitle: 'Create new shipments and track your orders in real time.' },
  AGENT:    { title: 'Agent Dashboard',  subtitle: 'View assigned pickups and update delivery status.' },
  ADMIN:    { title: 'Admin Dashboard',  subtitle: 'Monitor all orders, manage zones, rate cards, and agents.' },
};

function AppShell() {
  const { user, logout } = useAuth();

  if (!user) return <LoginPage />;

  const role = user.role;
  const meta = PAGE_META[role] || PAGE_META.CUSTOMER;

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#F5F3EE', fontFamily: "'Space Grotesk', system-ui, sans-serif" }}>
      {/* Header */}
      <header style={{ backgroundColor: '#14202E' }} className="px-6 py-4 shadow-lg">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <IconPackage size={22} className="text-amber-400" />
            <span className="text-white font-bold text-lg tracking-tight">Last-Mile Delivery</span>
          </div>

          <div className="flex items-center gap-4">
            {/* Role badge */}
            <span className={`text-xs font-mono font-bold uppercase px-2.5 py-1 rounded-full ${
              role === 'ADMIN' ? 'bg-teal-700/40 text-teal-300' :
              role === 'AGENT' ? 'bg-blue-700/40 text-blue-300' :
              'bg-amber-700/40 text-amber-300'
            }`}>
              {role === 'CUSTOMER' ? <span className="flex items-center gap-1"><IconPackage size={11} /> Customer</span>
              : role === 'AGENT' ? <span className="flex items-center gap-1"><IconTruck size={11} /> Agent</span>
              : <span className="flex items-center gap-1"><IconUsers size={11} /> Admin</span>}
            </span>

            <div className="h-4 w-px bg-white/20" />

            <span className="text-white/70 text-sm font-medium">{user.name}</span>

            <button
              onClick={logout}
              className="text-white/50 hover:text-white text-xs border border-white/20 px-3 py-1.5 rounded-lg hover:border-white/40 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-6">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">{meta.title}</h1>
          <p className="text-sm text-slate-500 mt-1">{meta.subtitle}</p>
        </div>

        {role === 'CUSTOMER' && <CustomerPage />}
        {role === 'AGENT'    && <AgentPage />}
        {role === 'ADMIN'    && <AdminPage />}
      </div>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;
