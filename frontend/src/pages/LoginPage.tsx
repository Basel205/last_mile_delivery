import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiRegister } from '../api';

type Mode = 'login' | 'register';

export default function LoginPage() {
  const { login } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const reset = (nextMode: Mode) => {
    setMode(nextMode);
    setError('');
    setEmail('');
    setPassword('');
    setName('');
    setPhone('');
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await apiRegister({ name, email, phone, password, role: 'CUSTOMER' });
      // Auto-login after successful registration
      await login(email, password);
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  const quickLogin = async (role: 'customer' | 'admin' | 'agent') => {
    const credentials: Record<string, { email: string; password: string }> = {
      customer: { email: 'customer@lmd.test', password: 'demo1234' },
      admin:    { email: 'admin@lmd.test',    password: 'demo1234' },
      agent:    { email: 'agent1@lmd.test',   password: 'demo1234' },
    };
    const c = credentials[role];
    setError('');
    setLoading(true);
    try {
      await login(c.email, c.password);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#F5F3EE' }}>
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl mb-4"
            style={{ backgroundColor: '#14202E' }}>
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none"
              stroke="#E8A33D" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/>
              <path d="m3.3 7 8.7 5 8.7-5"/><path d="M12 22V12"/>
            </svg>
          </div>
          <h1 className="text-2xl font-bold" style={{ color: '#14202E' }}>Last-Mile Delivery</h1>
          <p className="text-sm mt-1" style={{ color: '#5B6B7A' }}>
            {mode === 'login' ? 'Sign in to your account' : 'Create a customer account'}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
          {/* Tab switcher */}
          <div className="flex border-b border-slate-100">
            {(['login', 'register'] as Mode[]).map(m => (
              <button key={m} onClick={() => reset(m)}
                className={`flex-1 py-3 text-sm font-semibold transition-colors ${
                  mode === m
                    ? 'border-b-2 border-amber-500 text-slate-900'
                    : 'text-slate-400 hover:text-slate-600'
                }`}>
                {m === 'login' ? 'Sign In' : 'Register'}
              </button>
            ))}
          </div>

          <div className="p-8">
            {/* ── Login Form ── */}
            {mode === 'login' && (
              <form onSubmit={handleLogin} className="space-y-4">
                <div className="bg-blue-50 border border-blue-100 text-blue-700 text-xs px-3 py-2 rounded-lg mb-4">
                  Log in using <strong>any</strong> account credentials. Admins, Agents, and Customers all sign in here.
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    placeholder="you@example.com"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    placeholder="••••••••"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400" />
                </div>
                {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">⚠ {error}</div>}
                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-lg font-semibold text-sm text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#14202E' }}>
                  {loading ? 'Signing in…' : 'Sign In'}
                </button>
              </form>
            )}

            {/* ── Register Form ── */}
            {mode === 'register' && (
              <form onSubmit={handleRegister} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Full Name</label>
                  <input type="text" value={name} onChange={e => setName(e.target.value)} required
                    placeholder="Rahul Sharma"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Email</label>
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
                    placeholder="you@example.com"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Phone</label>
                  <input type="tel" value={phone} onChange={e => setPhone(e.target.value)} required
                    placeholder="+919876543210"
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Password</label>
                  <input type="password" value={password} onChange={e => setPassword(e.target.value)} required
                    placeholder="Min 8 characters"
                    minLength={8}
                    className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50 focus:border-amber-400" />
                </div>
                {error && <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-3 py-2.5 text-sm">⚠ {error}</div>}
                <button type="submit" disabled={loading}
                  className="w-full py-2.5 rounded-lg font-semibold text-sm text-white transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#14202E' }}>
                  {loading ? 'Creating account…' : 'Create Account'}
                </button>
                <p className="text-xs text-slate-400 text-center">
                  New accounts are created as <span className="font-semibold">Customer</span> by default.
                  Agent and Admin accounts are created by an administrator.
                </p>
              </form>
            )}

            {/* Quick demo login (login tab only) */}
            {mode === 'login' && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide text-center mb-3">Quick Demo Login</p>
                <div className="grid grid-cols-3 gap-2">
                  {(['customer', 'agent', 'admin'] as const).map(role => (
                    <button key={role} onClick={() => quickLogin(role)} disabled={loading}
                      className="py-2 rounded-lg text-xs font-semibold border transition-colors capitalize disabled:opacity-50"
                      style={{
                        borderColor: role === 'admin' ? '#2B7A78' : role === 'agent' ? '#3b82f6' : '#E8A33D',
                        color:       role === 'admin' ? '#2B7A78' : role === 'agent' ? '#3b82f6' : '#E8A33D',
                      }}>
                      {role}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-slate-400 text-center mt-2">Uses seeded demo accounts (password: demo1234)</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
