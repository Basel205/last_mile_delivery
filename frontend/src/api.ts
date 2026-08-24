export const API_BASE = 'https://last-mile-delivery-lukw.onrender.com';

function getToken(): string | null {
  try {
    const saved = sessionStorage.getItem('lmd_auth');
    return saved ? JSON.parse(saved).token : null;
  } catch {
    return null;
  }
}

function authHeaders(): Record<string, string> {
  const token = getToken();
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' };
}

async function req<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: { ...authHeaders(), ...(options.headers || {}) },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || `Request failed: ${res.status}`);
  return data;
}

// ── Auth ───────────────────────────────────────────────────────────────────
export async function apiLogin(email: string, password: string) {
  return req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
}

export async function apiRegister(data: { name: string; email: string; phone: string; password: string; role?: string }) {
  return req('/auth/register', { method: 'POST', body: JSON.stringify(data) });
}

// ── Orders ─────────────────────────────────────────────────────────────────
export async function previewCharge(data: any) {
  return req('/orders/preview-charge', { method: 'POST', body: JSON.stringify(data) });
}

export async function createOrder(data: any, idempotencyKey: string) {
  return req('/orders', {
    method: 'POST',
    headers: { 'idempotency-key': idempotencyKey } as any,
    body: JSON.stringify(data),
  });
}

export async function getOrders(params?: { status?: string; page?: number; pageSize?: number }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.page) qs.set('page', String(params.page));
  if (params?.pageSize) qs.set('pageSize', String(params.pageSize));
  return req(`/orders?${qs.toString()}`);
}

export async function getOrder(id: string) {
  return req(`/orders/${id}`);
}

export async function getTracking(id: string) {
  return req(`/orders/${id}/tracking`);
}

export async function updateOrderStatus(id: string, status: string, note?: string, lat?: number, lng?: number) {
  return req(`/orders/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status, note, lat, lng }),
  });
}

export async function cancelOrder(id: string, cancellationReason: string) {
  return req(`/orders/${id}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ cancellationReason }),
  });
}

export async function rescheduleOrder(id: string, newScheduledDate: string) {
  return req(`/orders/${id}/reschedule`, {
    method: 'POST',
    body: JSON.stringify({ newScheduledDate }),
  });
}

export async function autoAssignOrder(id: string) {
  return req(`/orders/${id}/auto-assign`, { method: 'POST' });
}

export async function manualAssignOrder(id: string, agentId: string) {
  return req(`/orders/${id}/assign`, {
    method: 'PATCH',
    body: JSON.stringify({ agentId }),
  });
}

// ── Admin ──────────────────────────────────────────────────────────────────
export async function getZones() {
  return req('/admin/zones');
}

export async function getRateCards() {
  return req('/admin/rate-cards');
}

export async function getCodSurchargeConfig() {
  return req('/admin/cod-surcharge-config');
}

export async function getAgents(params?: { status?: string; zoneId?: string }) {
  const qs = new URLSearchParams();
  if (params?.status) qs.set('status', params.status);
  if (params?.zoneId) qs.set('zoneId', params.zoneId);
  return req(`/admin/agents?${qs.toString()}`);
}

export async function updateAgent(id: string, data: { zoneId?: string; maxConcurrentOrders?: number; status?: string }) {
  return req(`/admin/agents/${id}`, { method: 'PATCH', body: JSON.stringify(data) });
}

export async function createAgent(data: {
  name: string; email: string; phone: string; password: string;
  zoneId: string; maxConcurrentOrders?: number;
}) {
  return req('/admin/agents', { method: 'POST', body: JSON.stringify(data) });
}
