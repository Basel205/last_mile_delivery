import React, { useState, useEffect } from 'react';
import { getOrders, updateOrderStatus } from '../api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { IconTruck, IconCheck, IconX } from '../components/Icons';

const NEXT: Record<string, { label: string; status: string; color: string }[]> = {
  CREATED:          [{ label: 'Mark Picked Up', status: 'PICKED_UP', color: 'bg-blue-500 hover:bg-blue-600' }],
  PICKED_UP:        [{ label: 'Mark In Transit', status: 'IN_TRANSIT', color: 'bg-amber-500 hover:bg-amber-600' }],
  IN_TRANSIT:       [{ label: 'Mark Out for Delivery', status: 'OUT_FOR_DELIVERY', color: 'bg-orange-500 hover:bg-orange-600' }],
  OUT_FOR_DELIVERY: [
    { label: 'Mark Delivered', status: 'DELIVERED', color: 'bg-teal-600 hover:bg-teal-700' },
    { label: 'Mark Failed',    status: 'FAILED',    color: 'bg-red-500 hover:bg-red-600' },
  ],
};

export default function AgentPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [updating, setUpdating] = useState<Record<string, boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    setLoading(true);
    (getOrders() as Promise<any>)
      .then((d: any) => setOrders(d.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setLoading(false));
  }, []);

  const handleAdvance = async (orderId: string, newStatus: string) => {
    const note = notes[orderId];
    if (newStatus === 'FAILED' && !note?.trim()) {
      setErrors(prev => ({ ...prev, [orderId]: 'A note is required for Failed status' }));
      return;
    }
    setErrors(prev => ({ ...prev, [orderId]: '' }));
    setUpdating(prev => ({ ...prev, [orderId]: true }));
    try {
      const updated: any = await updateOrderStatus(orderId, newStatus, note);
      setOrders(prev => prev.map(o => o.id === orderId ? { ...o, status: updated.status } : o));
      setNotes(prev => ({ ...prev, [orderId]: '' }));
    } catch (e: any) {
      setErrors(prev => ({ ...prev, [orderId]: e.message }));
    } finally {
      setUpdating(prev => ({ ...prev, [orderId]: false }));
    }
  };

  const active = orders.filter(o => !['DELIVERED', 'FAILED', 'CANCELLED'].includes(o.status));

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <IconTruck size={18} className="text-amber-500" />
          <h2 className="font-bold text-slate-900">Assigned Orders</h2>
          <span className="ml-auto text-xs bg-amber-50 text-amber-600 border border-amber-200 font-semibold px-2.5 py-0.5 rounded-full">
            {active.length} active
          </span>
        </div>

        {loading ? (
          <div className="p-6 text-sm text-slate-400">Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="p-6 text-sm text-slate-400 text-center">No orders assigned to you yet.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {orders.map(order => {
              const actions = NEXT[order.status] || [];
              const needsNote = order.status === 'OUT_FOR_DELIVERY';

              return (
                <div key={order.id} className="px-6 py-5">
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="font-mono text-sm font-bold text-slate-900">{order.orderNumber}</div>
                      <div className="text-xs text-slate-500 mt-0.5">
                        {order.pickupAddress} → {order.dropAddress}
                      </div>
                      <div className="text-xs text-slate-400 mt-0.5 font-mono">₹{Number(order.totalCharge).toFixed(2)}</div>
                    </div>
                    <StatusBadge status={order.status} />
                  </div>

                  {needsNote && (
                    <input
                      placeholder="Add delivery note (required for Failed)…"
                      value={notes[order.id] || ''}
                      onChange={e => setNotes(prev => ({ ...prev, [order.id]: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-teal-400/50"
                    />
                  )}

                  {errors[order.id] && (
                    <div className="text-xs text-red-600 mb-2">⚠ {errors[order.id]}</div>
                  )}

                  <div className="flex gap-2 flex-wrap">
                    {actions.map(action => (
                      <button key={action.status}
                        onClick={() => handleAdvance(order.id, action.status)}
                        disabled={updating[order.id]}
                        className={`flex items-center gap-1.5 ${action.color} text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors disabled:opacity-50`}>
                        {action.status === 'DELIVERED' && <IconCheck size={13} />}
                        {action.status === 'FAILED' && <IconX size={13} />}
                        {!['DELIVERED', 'FAILED'].includes(action.status) && <IconTruck size={13} />}
                        {updating[order.id] ? 'Updating…' : action.label}
                      </button>
                    ))}
                    {['DELIVERED', 'FAILED', 'CANCELLED'].includes(order.status) && (
                      <span className="flex items-center gap-1.5 text-xs text-teal-600">
                        <IconCheck size={13} className="text-teal-500" /> Completed
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
