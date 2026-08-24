import React, { useState, useEffect } from 'react';
import { previewCharge, createOrder, getOrders, rescheduleOrder, getTracking } from '../api';
import { useAuth } from '../context/AuthContext';
import { StatusBadge } from '../components/StatusBadge';
import { IconPackage, IconCalculator, IconReceipt } from '../components/Icons';

const INITIAL_FORM = {
  pickupAddress: '123 MG Road, Bangalore',
  pickupPincode: '560001',
  dropAddress: '456 Rajouri Garden, Delhi',
  dropPincode: '110001',
  lengthCm: 30, breadthCm: 20, heightCm: 15, actualWeightKg: 3,
  orderType: 'B2C', paymentType: 'COD',
};

export default function CustomerPage() {
  const { user } = useAuth();
  const [form, setForm] = useState(INITIAL_FORM);
  const [preview, setPreview] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [orderSuccess, setOrderSuccess] = useState<any>(null);
  const [error, setError] = useState('');

  // Tracks which address fields were auto-filled by pincode lookup,
  // so we don't overwrite text the user typed manually.
  const autoFilled = React.useRef<{ pickupAddress?: string; dropAddress?: string }>({});
  const [pincodeHint, setPincodeHint] = useState<{ pickup?: string; drop?: string }>({});
  const [pincodeLoading, setPincodeLoading] = useState<{ pickup?: boolean; drop?: boolean }>({});

  const [orders, setOrders] = useState<any[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(true);

  const [trackingOrder, setTrackingOrder] = useState<string | null>(null);
  const [trackingData, setTrackingData] = useState<any>(null);

  const [rescheduleOrderId, setRescheduleOrderId] = useState<string | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  useEffect(() => {
    setOrdersLoading(true);
    (getOrders() as Promise<any>)
      .then((data: any) => setOrders(data.orders || []))
      .catch(() => setOrders([]))
      .finally(() => setOrdersLoading(false));
  }, []);

  // Called when a pincode field reaches 6 digits — resolves district/state and auto-fills address.
  const lookupPincode = async (pincode: string, side: 'pickup' | 'drop') => {
    const addressField = side === 'pickup' ? 'pickupAddress' : 'dropAddress';
    if (pincode.length !== 6 || !/^\d{6}$/.test(pincode)) {
      setPincodeHint(prev => ({ ...prev, [side]: undefined }));
      return;
    }
    setPincodeLoading(prev => ({ ...prev, [side]: true }));
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pincode}`);
      const data = await res.json();
      if (data[0]?.Status === 'Success' && data[0]?.PostOffice?.length) {
        const { District, State } = data[0].PostOffice[0];
        const locality = `${District}, ${State}`;
        setPincodeHint(prev => ({ ...prev, [side]: locality }));
        // Auto-fill address only if it's blank or was previously auto-filled (not manually typed)
        setForm(prev => {
          const current = (prev as any)[addressField];
          const prevAutoFill = autoFilled.current[addressField as keyof typeof autoFilled.current];
          if (!current || current === prevAutoFill) {
            autoFilled.current[addressField as keyof typeof autoFilled.current] = locality;
            return { ...prev, [addressField]: locality };
          }
          return prev;
        });
      } else {
        setPincodeHint(prev => ({ ...prev, [side]: '⚠ Pincode not found' }));
      }
    } catch {
      // Silently ignore — pincode lookup is best-effort, not blocking
    } finally {
      setPincodeLoading(prev => ({ ...prev, [side]: false }));
    }
  };


  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const numFields = ['lengthCm', 'breadthCm', 'heightCm', 'actualWeightKg'];
    setForm(prev => ({ ...prev, [e.target.name]: numFields.includes(e.target.name) ? Number(e.target.value) : e.target.value }));
  };

  const handlePreview = async () => {
    setLoading(true); setError(''); setPreview(null); setOrderSuccess(null);
    try {
      const res: any = await previewCharge(form);
      if (res.charge) setPreview(res.charge);
      else setError(res.message || 'Preview failed');
    } catch (e: any) { setError(e.message); }
    finally { setLoading(false); }
  };

  const handleCreateOrder = async () => {
    setCreating(true); setError('');
    try {
      const idempotencyKey = `${user?.id}-${Date.now()}`;
      const order: any = await createOrder(form, idempotencyKey);
      if (order.id) {
        setOrderSuccess(order);
        setPreview(null);
        // Refresh the orders list
        const data: any = await getOrders();
        setOrders(data.orders || []);
      } else {
        setError(order.message || 'Order creation failed');
      }
    } catch (e: any) { setError(e.message); }
    finally { setCreating(false); }
  };


  const handleViewTracking = async (orderId: string) => {
    if (trackingOrder === orderId) { setTrackingOrder(null); setTrackingData(null); return; }
    setTrackingOrder(orderId);
    try {
      const data: any = await getTracking(orderId);
      setTrackingData(data);
    } catch { setTrackingData(null); }
  };

  const handleReschedule = async () => {
    if (!rescheduleOrderId || !rescheduleDate) return;
    setRescheduleLoading(true);
    try {
      await rescheduleOrder(rescheduleOrderId, rescheduleDate);
      setRescheduleOrderId(null);
      const data: any = await getOrders();
      setOrders(data.orders || []);
    } catch (e: any) { alert(e.message); }
    finally { setRescheduleLoading(false); }
  };

  return (
    <div className="space-y-6">
      {/* Create Order / Preview */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <IconPackage size={18} className="text-amber-500" />
          <h2 className="font-bold text-slate-900">Create New Order</h2>
        </div>
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Pickup address + pincode — paired so pincode drives address */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Pickup Address</label>
            <input name="pickupAddress" value={form.pickupAddress}
              onChange={e => {
                autoFilled.current.pickupAddress = undefined; // user typed manually
                setForm(prev => ({ ...prev, pickupAddress: e.target.value }));
              }}
              placeholder="Street address, area…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Pickup Pincode</label>
            <input name="pickupPincode" value={form.pickupPincode} maxLength={6}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                setForm(prev => ({ ...prev, pickupPincode: val }));
                lookupPincode(val, 'pickup');
              }}
              placeholder="6-digit pincode"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
            {pincodeLoading.pickup && <p className="text-[11px] text-slate-400 mt-1">Looking up…</p>}
            {!pincodeLoading.pickup && pincodeHint.pickup && (
              <p className={`text-[11px] mt-1 ${pincodeHint.pickup.startsWith('⚠') ? 'text-red-500' : 'text-teal-600'}`}>
                📍 {pincodeHint.pickup}
              </p>
            )}
          </div>

          {/* Drop address + pincode */}
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Drop Address</label>
            <input name="dropAddress" value={form.dropAddress}
              onChange={e => {
                autoFilled.current.dropAddress = undefined; // user typed manually
                setForm(prev => ({ ...prev, dropAddress: e.target.value }));
              }}
              placeholder="Street address, area…"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Drop Pincode</label>
            <input name="dropPincode" value={form.dropPincode} maxLength={6}
              onChange={e => {
                const val = e.target.value.replace(/\D/g, '');
                setForm(prev => ({ ...prev, dropPincode: val }));
                lookupPincode(val, 'drop');
              }}
              placeholder="6-digit pincode"
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
            {pincodeLoading.drop && <p className="text-[11px] text-slate-400 mt-1">Looking up…</p>}
            {!pincodeLoading.drop && pincodeHint.drop && (
              <p className={`text-[11px] mt-1 ${pincodeHint.drop.startsWith('⚠') ? 'text-red-500' : 'text-teal-600'}`}>
                📍 {pincodeHint.drop}
              </p>
            )}
          </div>
          <div className="md:col-span-2 grid grid-cols-4 gap-3">
            {(['lengthCm', 'breadthCm', 'heightCm', 'actualWeightKg'] as const).map(f => (
              <div key={f}>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  {f === 'actualWeightKg' ? 'Weight kg' : f.replace('Cm', ' cm')}
                </label>
                <input type="number" name={f} value={form[f]} onChange={handleChange}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Order Type</label>
            <select name="orderType" value={form.orderType} onChange={handleChange}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50">
              <option value="B2C">B2C — Business to Consumer</option>
              <option value="B2B">B2B — Business to Business</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">Payment</label>
            <select name="paymentType" value={form.paymentType} onChange={handleChange}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/50">
              <option value="PREPAID">Prepaid</option>
              <option value="COD">Cash on Delivery (COD)</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <button onClick={handlePreview} disabled={loading}
              className="flex items-center gap-2 bg-amber-500 text-white px-6 py-2.5 rounded-lg font-semibold text-sm hover:bg-amber-600 transition-colors disabled:opacity-50">
              <IconCalculator size={15} />
              {loading ? 'Calculating…' : 'Preview Charge'}
            </button>
          </div>
          {error && <div className="md:col-span-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm">⚠ {error}</div>}

          {orderSuccess && (
            <div className="md:col-span-2 bg-teal-50 border border-teal-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-1">
                <span className="text-teal-600">✓</span>
                <span className="font-bold text-teal-900 text-sm">Order Placed Successfully!</span>
              </div>
              <div className="text-xs text-teal-700 font-mono">{orderSuccess.orderNumber}</div>
              <div className="text-xs text-teal-600 mt-1">Total charged: ₹{Number(orderSuccess.totalCharge).toFixed(2)} · Check "My Orders" below to track it.</div>
            </div>
          )}

          {preview && (
            <div className="md:col-span-2 bg-amber-50 border border-amber-200 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <IconReceipt size={16} className="text-amber-600" />
                <span className="font-bold text-slate-900 text-sm">Charge Breakdown</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
                {[
                  { label: 'Volumetric Weight', value: `${preview.volumetricWeightKg} kg`, tooltip: 'L×B×H ÷ 5000' },
                  { label: 'Billed Weight',      value: `${preview.billedWeightKg} kg`,      tooltip: 'MAX(actual, volumetric)' },
                  { label: 'Base Charge',        value: `₹${preview.baseCharge}`,            tooltip: 'From rate card slab' },
                  { label: 'COD Surcharge',      value: `₹${preview.codSurcharge}`,          tooltip: form.paymentType === 'COD' ? 'Applied for COD payment' : 'N/A (Prepaid)' },
                ].map(item => (
                  <div key={item.label} className="bg-white rounded-lg p-3 border border-amber-100" title={item.tooltip}>
                    <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1">{item.label}</div>
                    <div className="text-lg font-mono font-bold text-slate-900">{item.value}</div>
                    <div className="text-[9px] text-slate-400 mt-0.5">{item.tooltip}</div>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between pt-3 border-t border-amber-200 mb-4">
                <span className="font-semibold text-slate-600">Total Charge</span>
                <span className="text-3xl font-mono font-bold text-slate-900">₹{preview.totalCharge}</span>
              </div>
              <button onClick={handleCreateOrder} disabled={creating}
                className="w-full py-3 rounded-lg font-bold text-sm text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: creating ? '#5B6B7A' : '#14202E' }}>
                {creating ? 'Placing Order…' : '✓ Confirm & Place Order'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Orders List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
          <IconPackage size={18} className="text-slate-400" />
          <h2 className="font-bold text-slate-900">My Orders</h2>
        </div>
        {ordersLoading ? (
          <div className="p-6 text-sm text-slate-400">Loading orders…</div>
        ) : orders.length === 0 ? (
          <div className="p-6 text-sm text-slate-400 text-center">No orders yet — preview a charge above to create your first one.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {orders.map((o: any) => (
              <div key={o.id}>
                <div className="flex items-center justify-between px-6 py-4 hover:bg-slate-50 transition-colors">
                  <div>
                    <div className="font-mono text-sm font-bold text-slate-900">{o.orderNumber}</div>
                    <div className="text-xs text-slate-500 mt-0.5">{o.dropZone?.name}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm font-bold text-slate-900">₹{Number(o.totalCharge).toFixed(2)}</span>
                    <StatusBadge status={o.status} />
                    <button onClick={() => handleViewTracking(o.id)}
                      className="text-xs text-amber-600 border border-amber-300 px-2.5 py-1 rounded-lg hover:bg-amber-50 transition-colors">
                      {trackingOrder === o.id ? 'Hide' : 'Track'}
                    </button>
                    {o.status === 'FAILED' && (
                      <button onClick={() => setRescheduleOrderId(o.id)}
                        className="text-xs text-purple-600 border border-purple-300 px-2.5 py-1 rounded-lg hover:bg-purple-50 transition-colors">
                        Reschedule
                      </button>
                    )}
                  </div>
                </div>
                {trackingOrder === o.id && trackingData && (
                  <div className="px-6 pb-5 bg-slate-50 border-t border-slate-100">
                    <div className="pt-4 space-y-3">
                      {trackingData.events?.map((ev: any, i: number) => (
                        <div key={ev.id} className="flex gap-3 items-start">
                          <div className="flex flex-col items-center">
                            <div className="w-3 h-3 rounded-full bg-amber-400 mt-0.5 shrink-0" />
                            {i < trackingData.events.length - 1 && <div className="w-px flex-1 bg-slate-200 mt-1" />}
                          </div>
                          <div className="pb-3">
                            <div className="flex items-center gap-2">
                              <StatusBadge status={ev.status} />
                              <span className="text-[11px] text-slate-400 font-mono">
                                {new Date(ev.createdAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
                              </span>
                            </div>
                            {ev.note && <div className="text-xs text-slate-500 mt-1">{ev.note}</div>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reschedule Modal */}
      {rescheduleOrderId && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="font-bold text-slate-900 mb-4">Reschedule Delivery</h3>
            <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">New Delivery Date</label>
            <input type="date" value={rescheduleDate} onChange={e => setRescheduleDate(e.target.value)}
              min={new Date(Date.now() + 86400000).toISOString().split('T')[0]}
              className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm mb-4 focus:outline-none focus:ring-2 focus:ring-amber-400/50" />
            <div className="flex gap-2">
              <button onClick={() => setRescheduleOrderId(null)}
                className="flex-1 py-2 rounded-lg border border-slate-200 text-sm font-medium text-slate-600 hover:bg-slate-50">
                Cancel
              </button>
              <button onClick={handleReschedule} disabled={rescheduleLoading || !rescheduleDate}
                className="flex-1 py-2 rounded-lg bg-amber-500 text-white text-sm font-semibold hover:bg-amber-600 disabled:opacity-50">
                {rescheduleLoading ? 'Saving…' : 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
