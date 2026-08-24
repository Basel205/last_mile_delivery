# Last-Mile Delivery Tracker

This is the implementation of the Last-Mile Delivery Tracker platform.

## Setup Guide

### 1. Database
You need PostgreSQL running. Update `DATABASE_URL` in `backend/.env`.

### 2. Backend
\`\`\`bash
cd backend
npm install
npx prisma generate
npx prisma db push
npm run prisma:seed  # This will seed the DB and add manual SQL constraints
npm run start:dev
\`\`\`
The backend will run on http://localhost:3000.
API documentation (Swagger) is available at http://localhost:3000/docs.

### 3. Frontend
\`\`\`bash
cd frontend
npm install
npm run dev
\`\`\`
The frontend will run on http://localhost:5173.

## Environment Variables
Check \`backend/.env.example\` for required variables.

## Rate Calculation Logic
See \`SYSTEM_DESIGN.md\` for a detailed explanation of the rate calculation engine, zone detection, auto-assignment, and failed delivery handling.

## API Docs
Once the backend is running, navigate to `http://localhost:3000/docs` to explore the OpenAPI specification.

## DB Schema
The Prisma schema acts as the source of truth for the database schema. You can view the entity relationships and constraints in \`backend/prisma/schema.prisma\`.
