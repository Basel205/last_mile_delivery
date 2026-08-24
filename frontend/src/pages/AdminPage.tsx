import React, { useEffect, useState } from 'react';
import { getOrders, getZones, getRateCards, getAgents, autoAssignOrder, updateAgent, createAgent } from '../api';
import { StatusBadge } from '../components/StatusBadge';
import { IconBarChart, IconUsers, IconPackage, IconMap, IconCreditCard } from '../components/Icons';

type Tab = 'orders' | 'zones' | 'rates' | 'agents';

export default function AdminPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [zones, setZones] = useState<any[]>([]);
  const [rateCards, setRateCards] = useState<any[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [tab, setTab] = useState<Tab>('orders');
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [assigning, setAssigning] = useState<Record<string, boolean>>({});

  const [showAddAgent, setShowAddAgent] = useState(false);
  const [agentForm, setAgentForm] = useState({ name: '', email: '', phone: '', password: '', zoneId: '', maxConcurrentOrders: 3 });
  const [agentFormError, setAgentFormError] = useState('');
  const [agentFormLoading, setAgentFormLoading] = useState(false);

  useEffect(() => {
    setOrdersLoading(true);
    Promise.all([
      (getOrders({ pageSize: 50 }) as Promise<any>).then((d: any) => setOrders(d.orders || [])).catch(() => {}),
      (getZones() as Promise<any>).then(setZones).catch(() => {}),
      (getRateCards() as Promise<any>).then(setRateCards).catch(() => {}),
      (getAgents() as Promise<any>).then(setAgents).catch(() => {}),
    ]).finally(() => setOrdersLoading(false));
  }, []);

  const handleAutoAssign = async (orderId: string) => {
    setAssigning(prev => ({ ...prev, [orderId]: true }));
    try {
      await autoAssignOrder(orderId);
      const d: any = await getOrders({ pageSize: 50 });
      setOrders(d.orders || []);
    } catch (e: any) { alert(e.message); }
    finally { setAssigning(prev => ({ ...prev, [orderId]: false })); }
  };

  const handleCreateAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agentForm.zoneId) { setAgentFormError('Please select a zone'); return; }
    setAgentFormLoading(true); setAgentFormError('');
    try {
      await createAgent(agentForm);
      const updated: any = await getAgents();
      setAgents(updated);
      setShowAddAgent(false);
      setAgentForm({ name: '', email: '', phone: '', password: '', zoneId: '', maxConcurrentOrders: 3 });
    } catch (e: any) {
      setAgentFormError(e.message);
    } finally {
      setAgentFormLoading(false);
    }
  };

  const stats = [
    { label: 'Total Orders',  value: orders.length, Icon: IconPackage,  color: 'text-amber-500' },
    { label: 'Active Orders', value: orders.filter(o => !['DELIVERED', 'CANCELLED', 'FAILED'].includes(o.status)).length, Icon: IconBarChart, color: 'text-blue-500' },
    { label: 'Delivered',     value: orders.filter(o => o.status === 'DELIVERED').length, Icon: IconUsers, color: 'text-teal-600' },
    { label: 'Active Zones',  value: zones.length, Icon: IconMap, color: 'text-purple-500' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {stats.map(({ label, value, Icon, color }) => (
          <div key={label} className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</span>
              <Icon size={16} className={color} />
            </div>
            <div className="text-3xl font-mono font-bold text-slate-900">{value}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex border-b border-slate-100 overflow-x-auto">
          {([['orders', 'All Orders'], ['zones', 'Zones'], ['rates', 'Rate Cards'], ['agents', 'Agents']] as [Tab, string][]).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={`px-5 py-3 text-sm font-semibold whitespace-nowrap transition-colors ${tab === key ? 'border-b-2 border-amber-500 text-slate-900' : 'text-slate-500 hover:text-slate-800'}`}>
              {label}
            </button>
          ))}
        </div>

        {tab === 'orders' && (
          <div className="divide-y divide-slate-100">
            {ordersLoading ? (
              <div className="p-6 text-sm text-slate-400">Loading orders…</div>
            ) : orders.length === 0 ? (
              <div className="p-6 text-sm text-slate-400 text-center">No orders yet.</div>
            ) : orders.map(o => (
              <div key={o.id} className="flex items-center justify-between px-6 py-3.5 hover:bg-slate-50 transition-colors">
                <div>
                  <div className="font-mono text-sm font-bold text-slate-900">{o.orderNumber}</div>
                  <div className="text-xs text-slate-500">{o.customer?.name || '—'} · Agent: {o.assignedAgent?.user?.name || 'Unassigned'}</div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-mono text-sm font-bold text-slate-900">₹{Number(o.totalCharge).toFixed(2)}</span>
                  <StatusBadge status={o.status} />
                  {o.status === 'CREATED' && !o.assignedAgentId && (
                    <button onClick={() => handleAutoAssign(o.id)} disabled={assigning[o.id]}
                      className="text-xs bg-teal-600 text-white px-2.5 py-1 rounded-lg hover:bg-teal-700 transition-colors disabled:opacity-50">
                      {assigning[o.id] ? 'Assigning…' : 'Auto-assign'}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'zones' && (
          <div className="p-6 space-y-4">
            {zones.length === 0 ? <div className="text-sm text-slate-400">No zones.</div> :
              zones.map((zone: any) => (
                <div key={zone.id} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <IconMap size={14} className="text-amber-500" />
                    <span className="font-bold text-slate-900 text-sm">{zone.name}</span>
                    <span className="text-xs font-mono bg-slate-100 px-2 py-0.5 rounded">{zone.code}</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {(zone.pincodes || []).map((p: any) => (
                      <span key={p.pincode} className="text-xs font-mono bg-amber-50 border border-amber-200 text-amber-800 px-2 py-0.5 rounded">{p.pincode}</span>
                    ))}
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {tab === 'rates' && (
          <div className="p-6 space-y-3">
            {rateCards.length === 0 ? <div className="text-sm text-slate-400">No rate cards.</div> :
              rateCards.map((card: any) => (
                <div key={card.id} className="border border-slate-200 rounded-xl p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <IconCreditCard size={14} className="text-teal-600" />
                    <span className="font-bold text-slate-900 text-sm">{card.orderType} · {card.rateType}</span>
                    <span className={`ml-auto text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border ${card.effectiveTo ? 'border-gray-300 text-gray-500' : 'border-teal-500 text-teal-700 bg-teal-50'}`}>
                      {card.effectiveTo ? 'EXPIRED' : 'ACTIVE'}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                      <div className="text-[10px] uppercase text-slate-500 mb-1">Base Price</div>
                      <div className="font-mono font-bold text-slate-900">₹{card.basePrice}</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                      <div className="text-[10px] uppercase text-slate-500 mb-1">Base Weight</div>
                      <div className="font-mono font-bold text-slate-900">{card.baseWeightKg} kg</div>
                    </div>
                    <div className="bg-slate-50 rounded-lg p-2 text-center">
                      <div className="text-[10px] uppercase text-slate-500 mb-1">Extra /kg</div>
                      <div className="font-mono font-bold text-slate-900">₹{card.additionalPricePerKg}</div>
                    </div>
                  </div>
                </div>
              ))
            }
          </div>
        )}

        {tab === 'agents' && (
          <div>
            {/* Header row with Add Agent button */}
            <div className="flex items-center justify-between px-6 py-3 border-b border-slate-100 bg-slate-50">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{agents.length} agent{agents.length !== 1 ? 's' : ''}</span>
              <button onClick={() => { setShowAddAgent(v => !v); setAgentFormError(''); }}
                className="text-xs font-semibold bg-teal-600 text-white px-3 py-1.5 rounded-lg hover:bg-teal-700 transition-colors">
                {showAddAgent ? 'Cancel' : '+ Add Agent'}
              </button>
            </div>

            {/* Add Agent form */}
            {showAddAgent && (
              <form onSubmit={handleCreateAgent} className="px-6 py-5 bg-teal-50 border-b border-teal-100 space-y-3">
                <p className="text-xs font-bold text-teal-800 uppercase tracking-wide">New Agent Account</p>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { key: 'name', label: 'Full Name', type: 'text', placeholder: 'Ramesh Kumar' },
                    { key: 'email', label: 'Email', type: 'email', placeholder: 'agent@example.com' },
                    { key: 'phone', label: 'Phone', type: 'tel', placeholder: '+919876543210' },
                    { key: 'password', label: 'Password', type: 'password', placeholder: 'Min 8 characters' },
                  ].map(f => (
                    <div key={f.key}>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">{f.label}</label>
                      <input type={f.type} placeholder={f.placeholder} required minLength={f.key === 'password' ? 8 : undefined}
                        value={(agentForm as any)[f.key]}
                        onChange={e => setAgentForm(prev => ({ ...prev, [f.key]: e.target.value }))}
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/50" />
                    </div>
                  ))}
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Zone</label>
                    <select required value={agentForm.zoneId} onChange={e => setAgentForm(prev => ({ ...prev, zoneId: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/50">
                      <option value="">Select zone…</option>
                      {zones.map((z: any) => <option key={z.id} value={z.id}>{z.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Max Concurrent Orders</label>
                    <input type="number" min={1} max={20} value={agentForm.maxConcurrentOrders}
                      onChange={e => setAgentForm(prev => ({ ...prev, maxConcurrentOrders: Number(e.target.value) }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400/50" />
                  </div>
                </div>
                {agentFormError && <div className="text-xs text-red-600">⚠ {agentFormError}</div>}
                <button type="submit" disabled={agentFormLoading}
                  className="bg-teal-600 text-white px-5 py-2 rounded-lg text-sm font-semibold hover:bg-teal-700 transition-colors disabled:opacity-50">
                  {agentFormLoading ? 'Creating…' : 'Create Agent'}
                </button>
                <p className="text-[11px] text-teal-700">The agent can log in at <span className="font-mono">localhost:5173</span> using their email and the password you set above.</p>
              </form>
            )}

            {/* Agents list */}
            <div className="divide-y divide-slate-100">
              {agents.length === 0 ? (
                <div className="p-6 text-sm text-slate-400 text-center">No agents yet — click "+ Add Agent" above.</div>
              ) : agents.map((agent: any) => (
                <div key={agent.id} className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 group">
                  <div>
                    <div className="font-semibold text-sm text-slate-900">{agent.user?.name}</div>
                    <div className="text-xs text-slate-500 font-mono flex items-center gap-2 mt-0.5">
                      {agent.user?.email}
                      <button onClick={() => { navigator.clipboard.writeText(agent.user?.email); alert('Copied email to clipboard! Sign out and use this email to log in as the agent.'); }} 
                        className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity hover:bg-slate-300">
                        Copy to Login
                      </button>
                    </div>
                    <div className="text-xs text-slate-400 mt-1">Zone: {agent.zone?.name} · Max {agent.maxConcurrentOrders} orders</div>
                  </div>
                  <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border font-semibold ${
                    agent.status === 'AVAILABLE' ? 'border-teal-500 text-teal-700 bg-teal-50' :
                    agent.status === 'ON_DELIVERY' ? 'border-amber-500 text-amber-700 bg-amber-50' :
                    'border-gray-400 text-gray-500'
                  }`}>
                    {agent.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
