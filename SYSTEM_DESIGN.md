# System Design: Last-Mile Delivery Tracker

This document provides an in-depth architectural overview of the Last-Mile Delivery Tracker, detailing the design decisions and algorithmic approaches behind the four core pillars of the platform: Rate Calculation, Zone Detection, Auto-Assignment, and Failed Delivery Handling.

## 1. Rate Calculation Engine

The Rate Calculation Engine is designed around two non-negotiable principles: **financial precision** and **historical immutability**. 

To prevent floating-point arithmetic errors commonly associated with JavaScript (e.g., `0.1 + 0.2 = 0.30000000000000004`), the engine strictly utilizes the `decimal.js` library for all monetary calculations. 

The calculation pipeline executes as a pure, stateless function during both the pre-checkout "Preview Charge" phase and the final "Create Order" phase. This guarantees that the previewed price identically matches the final billed price. 

**Algorithmic Flow:**
1. **Volumetric Weight Calculation:** The system applies industry-standard dimensional weight logic `(Length × Breadth × Height in cm) / 5000`. 
2. **Billed Weight Determination:** It compares the physical Actual Weight against the Volumetric Weight and takes the `MAX()` of the two.
3. **Temporal Rate Card Lookup:** Rate cards are never updated in place. Instead, they utilize `effectiveFrom` and `effectiveTo` timestamps. The engine queries the database for the active rate card matching the payload's `orderType` (B2B/B2C) and `zoneType` (INTRA/INTER). This append-only design ensures that historical orders retain their exact pricing context even if rates change tomorrow.
4. **Slab Calculation:** The engine subtracts the `baseWeightSlab` from the Billed Weight. If there is a remainder, it is multiplied by the `extraWeightCharge` and added to the `baseCharge`.
5. **COD Surcharge:** If the payment type is Cash on Delivery, a secondary lookup retrieves the active COD configuration. The system dynamically applies either a `FLAT` fee addition or a `PERCENTAGE` multiplier against the base freight charge.

## 2. Dynamic Zone Detection Approach

Rather than relying on static, manually maintained pincode databases or complex geospatial polygon intersections (which introduce heavy external GIS dependencies), the system employs a highly robust, dynamic zone detection mechanism powered by a real-time caching layer.

**The Resolution Pipeline:**
When an order is placed, the system extracts the 6-digit pickup and drop pincodes. 
1. **Cache Layer Lookup:** It first performs an `O(1)` index lookup against the `zone_pincodes` table. 
2. **Real-Time API Fallback:** If a cache miss occurs, the backend initiates an asynchronous HTTP call to the **India Post Public API**. 
3. **State-to-Zone Mapping:** The system parses the exact State/District from the postal response and maps it against an internal hardcoded dictionary that divides India into macro-regions (North, South, East, West, Central). 
4. **Cache Hydration:** The resolved mapping is upserted into the `zone_pincodes` database. Subsequent orders utilizing the same pincode will skip the API call entirely, ensuring the system becomes faster and more resilient over time.

Zone topologies (INTRA-ZONE vs INTER-ZONE) are then instantly derived by comparing the resolved `pickupZoneId` against the `dropZoneId`.

## 3. Auto-Assignment Logic & Concurrency

The auto-assignment engine operates as an event-driven service designed to fairly distribute workloads while minimizing travel overhead. 

**Selection Algorithm:**
When a new order enters the `CREATED` state, the engine triggers a distribution sweep:
1. **Zone Proximity:** It filters the `Agent` table for personnel whose assigned operational zone exactly matches the order's `pickupZoneId`. 
2. **Availability:** It strictly filters for agents whose current status is `AVAILABLE` and whose active order count is below their personal `maxConcurrentOrders` threshold.
3. **Load Balancing:** If multiple agents qualify, the system sorts them by their active workload in ascending order, ensuring the least-burdened agent receives the dispatch. If no zone-matched agents are available, it falls back to a global pool of available agents.

**Concurrency Guards:**
To prevent race conditions where two simultaneous orders might be assigned to an agent who only has capacity for one, the assignment transaction utilizes PostgreSQL's `SELECT ... FOR UPDATE` row-level locking. This forces concurrent assignment sweeps to queue sequentially. Once assigned, a WebSocket event is immediately emitted via `Socket.io`, instantly updating the chosen agent's frontend dashboard without requiring a page refresh.

## 4. Failed Delivery & State Machine Handling

Failed delivery management is governed by a strict state machine to prevent orphaned orders and enforce customer intervention caps.

**Failure Lifecycle:**
1. **Agent Intervention:** An agent marks an order as `FAILED`, mandating a textual reason code (e.g., "Customer Not Available"). 
2. **Audit & Notifications:** The system atomically increments the order's `deliveryAttempts` counter, pushes an immutable event into the `OrderTracking` ledger, and enqueues an asynchronous SMS/Email notification task to the background worker.
3. **Threshold Enforcement:** The system checks the `deliveryAttempts` against the global `MAX_DELIVERY_ATTEMPTS` ceiling (default 3). 
4. **Rescheduling:** If the cap is not breached, the customer dashboard unlocks the "Reschedule" UI. Upon submitting a new date, the order status transitions to `RESCHEDULED`, clearing the previous agent assignment and queuing the order for a fresh Auto-Assignment sweep on the morning of the new date. If the cap is breached, the order is permanently locked into an `RTO` (Return to Origin) state.
