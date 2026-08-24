# Last-Mile Delivery Tracker

A comprehensive, role-based platform for managing end-to-end logistics and last-mile delivery operations.

## Setup Guide

### Prerequisites
- Node.js (v18 or higher)
- PostgreSQL (running locally or via Docker)

### 1. Database Configuration & `.env` Setup
In the `backend` directory, there is a `.env.example` file. You must copy it to `.env`:
```bash
cd backend
cp .env.example .env
```
Inside the `.env` file, ensure your `DATABASE_URL` is pointing to your active PostgreSQL instance. For example:
`DATABASE_URL="postgresql://postgres:password@localhost:5432/lmd_test"`

The `.env` also contains your `JWT_SECRET` for authentication.

### 2. Backend Initialization
With the `.env` file created, initialize the database and start the backend:
```bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run prisma:seed   # Seeds DB with admin/agent accounts and default rate cards
npm run start:dev     # Starts the backend on http://localhost:3000
```

### 3. Frontend Initialization
In a new terminal window, start the React application:
```bash
cd frontend
npm install
npm run dev           # Starts the frontend on http://localhost:5173
```

---

## Rate Calculation Logic Explanation

The system computes delivery charges dynamically based on physical dimensions, weight, distance (zones), and payment type. The calculation ensures the customer sees the exact same amount on the preview screen as they are billed at checkout.

### Step-by-Step Calculation:
1. **Zone Resolution**: 
   The system looks up the 6-digit pickup and drop pincodes via the India Post API. It maps the returned state to a delivery Zone (e.g., North, South, Central).
   - If `Pickup Zone == Drop Zone`, the order is **INTRA-ZONE**.
   - If `Pickup Zone != Drop Zone`, the order is **INTER-ZONE**.

2. **Billed Weight Calculation**:
   - First, the system calculates the **Volumetric Weight** using the industry standard formula: `(Length × Breadth × Height in cm) / 5000`.
   - The final **Billed Weight** is the higher of the Actual Weight and the Volumetric Weight: `MAX(ActualWeight, VolumetricWeight)`.

3. **Base Charge & Slabs**:
   - The system retrieves the active **Rate Card** matching the order type (B2B/B2C) and zone type (INTRA/INTER).
   - The Rate Card defines a `baseCharge` for the first `baseWeightSlab` (e.g., ₹50 for the first 2kg).
   - If the Billed Weight exceeds the `baseWeightSlab`, the remainder is charged per additional kg (`extraWeightCharge`).

4. **COD Surcharge**:
   - If the payment method is Cash on Delivery (COD), an active COD surcharge config is applied. This is either a `FLAT` fee (e.g., ₹50) or a `PERCENTAGE` of the base delivery charge (e.g., 10%).

**Example:**
* Package: 30cm × 20cm × 15cm (1.8kg volumetric), 3kg actual weight. Billed Weight = **3kg**.
* Rate: B2C INTRA-ZONE (Base: ₹50 for first 2kg, ₹20/kg extra).
* Base Calculation: ₹50 + (1 extra kg × ₹20) = **₹70**.
* COD (10% flat): ₹7. 
* **Total Charge: ₹77.**

---

## API Documentation (Swagger)

The backend provides a fully documented OpenAPI (Swagger) interface. 
Once the backend is running, navigate to:
👉 **http://localhost:3000/docs**

The Swagger UI allows you to explore and test all available endpoints, including:
* **`POST /auth/register`** & **`POST /auth/login`**: JWT Authentication.
* **`POST /orders`**: Create a new delivery order.
* **`GET /orders/:id/tracking`**: View full timeline of an order.
* **`PATCH /admin/agents/:id`**: Update agent zones/capacity.

*Note: You can click "Authorize" at the top of the Swagger page to paste your Bearer token and test protected routes.*

---

## Database Schema (Prisma)

The application uses PostgreSQL, managed via Prisma ORM. The schema acts as the single source of truth for relationships and validation.

### Core Tables:
* **`User`**: Base table for all accounts. Stores email, hashed password, phone, and `role` (`CUSTOMER`, `AGENT`, `ADMIN`).
* **`Agent`**: Extension of the User table specifically for agents. Links to the `Zone` they are assigned to, their current `status` (AVAILABLE, ON_DELIVERY), and `maxConcurrentOrders`.
* **`Order`**: The central transactional table. Stores physical dimensions, computed weight, calculated price, pickup/drop addresses, assigned Agent ID, and current status (`CREATED`, `ASSIGNED`, `IN_TRANSIT`, `DELIVERED`, `FAILED`).
* **`OrderTracking`**: Append-only audit log. Every time an order changes status, a row is inserted here with a timestamp and optional notes.
* **`Zone` & `ZonePincode`**: Defines regional delivery zones (North, South, East, West, Central). `ZonePincode` caches India Post API resolutions so future lookups for the same pincode are instant.
* **`RateCard`**: Version-controlled pricing tables. Stores base rates, slabs, and `effectiveFrom`/`effectiveTo` dates to allow price changes without breaking historical orders.

---

## Full Project Directory Structure

```text
last_mile_delivery/
├── SYSTEM_DESIGN.md                  # In-depth architectural breakdown (Rate Engine, Zones, Assignment, Failures)
├── README.md                         # This file: Setup, API, Schema, and full directory tree
├── backend/                          # NestJS Backend Application
│   ├── .env.example                  # Template for required environment variables
│   ├── nest-cli.json                 # NestJS CLI configuration and compiler options
│   ├── package.json                  # Backend dependencies (Nest, Prisma, bcrypt, decimal.js)
│   ├── prisma/                       # Database ORM layer
│   │   ├── schema.prisma             # Core DB schema definitions (Users, Orders, Zones, RateCards)
│   │   └── seed.ts                   # Bootstraps the DB with admin/agent accounts and default pricing
│   └── src/                          # Backend source code
│       ├── main.ts                   # Application entry point, configures CORS, Helmet, and Global Pipes
│       ├── app.module.ts             # Root module aggregating all feature modules
│       ├── admin/                    # Admin Feature Module
│       │   └── admin.controller.ts   # Endpoints for managing agents, rate cards, and zones (Admin only)
│       ├── assignment/               # Auto-Assignment Engine
│       │   └── assignment.service.ts # Core logic for routing orders to the optimal available agent
│       ├── auth/                     # Authentication Module
│       │   ├── auth.controller.ts    # Login, Register, Logout endpoints
│       │   └── auth.service.ts       # JWT generation, token rotation, password hashing
│       ├── common/                   # Shared Utilities
│       │   ├── jwt.guard.ts          # Global middleware enforcing valid Bearer tokens
│       │   └── roles.guard.ts        # RBAC middleware restricting routes by User Role
│       ├── notifications/            # Background Notification System
│       │   └── notifications.service.ts # Simulates email/SMS queues for order lifecycle events
│       ├── orders/                   # Orders & Logistics Module
│       │   ├── order-status.service.ts  # State machine for transitioning orders (CREATED -> ASSIGNED -> IN_TRANSIT)
│       │   ├── orders.controller.ts  # Endpoints for customers and agents to interact with orders
│       │   ├── orders.service.ts     # Core business logic: zone resolution via India Post, idempotency
│       │   └── rate-engine.ts        # Pure functions calculating volumetric weight and applying rate cards
│       ├── realtime/                 # WebSockets Layer
│       │   └── events.gateway.ts     # Socket.io gateway pushing live status updates to frontend clients
│       └── users/                    # Users Module (Standard CRUD operations)
└── frontend/                         # React + Vite Frontend Application
    ├── index.html                    # HTML entry point containing root div
    ├── package.json                  # Frontend dependencies (React, React Router, Tailwind v4)
    ├── vite.config.ts                # Vite bundler configuration
    └── src/                          # Frontend source code
        ├── main.tsx                  # React DOM renderer entry point
        ├── App.tsx                   # Top-level routing logic (conditionally renders based on user role)
        ├── api.ts                    # Centralized typed Axios/Fetch client with auth interceptors
        ├── index.css                 # Global CSS imports including Tailwind definitions
        ├── components/               # Reusable UI components
        │   ├── Icons.tsx             # Inline SVG iconography library
        │   └── StatusBadge.tsx       # Standardized pill badges for rendering order states visually
        ├── context/                  # React Context Providers
        │   └── AuthContext.tsx       # Manages global user state, session storage, and login/logout functions
        └── pages/                    # Route-level Page Components
            ├── AdminPage.tsx         # Dashboard for admins: view all orders, manage agents, configure rates
            ├── AgentPage.tsx         # Dashboard for agents: view assigned deliveries, update statuses
            ├── CustomerPage.tsx      # Dashboard for customers: preview charges, create shipments, track history
            └── LoginPage.tsx         # Universal sign-in and registration portal for all roles
```
