# System Design — Last-Mile Delivery Tracker

## Rate Calculation Engine
The rate engine is a pure, stateless function (`calculateCharge(input)`) called twice per order: once for the pre-confirmation preview (no DB write) and once at creation (persists all intermediate values). Using the same function for both guarantees the shown charge equals the billed charge.

Algorithm: zone lookup → volumetric weight (L×B×H/5000) → billed weight (MAX actual, volumetric) → active rate card lookup by (order_type, rate_type) → base charge slab → COD surcharge.

All money math uses `decimal.js` (never raw JS floats). Every intermediate value is stored on the order row, making every charge reconstructible if a customer disputes it. Rate cards are versioned rows with `effective_from`/`effective_to` — never mutated in place. A `btree_gist` exclusion constraint at the DB level prevents overlapping active ranges.

**Worked example**: L=30cm B=20cm H=15cm, actual=3kg, B2C INTRA, COD.
Volumetric = (30×20×15)/5000 = 1.8kg → billed = MAX(3, 1.8) = 3kg (actual wins).
Rate card: base_price=₹50 for first 2kg, ₹20/kg extra → base = 50 + (1×20) = ₹70.
COD surcharge (10% flat): ₹7. Total: **₹77**.

## Zone Detection
Instead of requiring an admin to manually input all 19,000+ Indian pincodes, zone mapping is completely automated. When a new order is placed:
1. The system checks the `zone_pincodes` table for a cached mapping (O(1) lookup).
2. If the pincode is missing, the backend makes a real-time call to the **India Post Public API**.
3. It parses the State from the response, maps it to a regional delivery zone (e.g., Tamil Nadu → South Zone), and auto-creates the zone if it's a completely new region.
4. The resolved mapping is cached into `zone_pincodes` for instant future lookups.

This guarantees that any valid Indian pincode works out of the box with zero manual administrative setup. The zone type (INTRA-ZONE or INTER-ZONE) is computed instantly by comparing the mapped `pickupZoneId` and `dropZoneId`.

## Auto-Assignment
When an order is created, the assignment engine:
1. Queries `agents WHERE status = 'AVAILABLE'`.
2. Ranks: same-zone agents first → fewest active orders.
3. Assigns the top-ranked agent; emits a Socket.io push to `agent:{agentId}`.

Active order count is defined as orders with status NOT IN ('DELIVERED', 'FAILED', 'CANCELLED').
When an agent's last active order closes, `agents.status` is flipped back to `AVAILABLE` atomically in the same DB transaction.

**Concurrency guard**: Prevented with `SELECT ... FOR UPDATE` on the candidate agent row inside the assignment transaction — the second request re-evaluates candidates after the first commits.

## Failed Delivery Handling
1. Agent marks `FAILED` with a required `note`. `orders.delivery_attempts` increments.
2. Tracking event written, `orders.status = 'FAILED'`, customer notified.
3. Check `delivery_attempts` against `max_delivery_attempts` (default 3). If cap reached: block customer reschedule.
4. If under cap: customer submits new `scheduled_delivery_date` → `reschedule_requests` row, `orders.status = 'RESCHEDULED'`.
5. Fresh auto-assignment run for the new attempt.
