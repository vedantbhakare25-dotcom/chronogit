# ChronoGit ⚡

> **Autonomous API Contract Drift Engine & Breaking Change Sentinel**

ChronoGit ek modern developer-first platform hai jo live external APIs aur microservices ke schema contracts ko continuously monitor karta hai. Yeh JSON responses mein aane wale breaking type mutations, dropped fields, aur structural changes ko real-time detect karta hai, Git-style side-by-side visual diff render karta hai, aur instant multi-channel alerts dispatch karta hai.

---

## 🌟 Core Features

- **Automated Contract Inference:** Live JSON responses se dynamically recursive schema types (objects, primitives, nullable types, arrays) derive karta hai.
- **Git-Style Visual Diff Viewer:** Production baseline contract aur latest response schema ke beech clean, line-by-line colored diff (Red/Green) visualization.
- **Intelligent Drift Classification:**
  - `HEALTHY`: Schema contract baseline ke sath perfectly align hai.
  - `NON_BREAKING`: Naye optional fields ya non-destructive keys add huye hain.
  - `BREAKING`: Fields delete huye hain ya existing data types mutate huye hain (e.g. `number` $\rightarrow$ `string`).
- **Multi-Tenant Architecture:** NextAuth.js OAuth session ke through user-scoped monitors aur baseline records ki strict data isolation.
- **Unified Alert Delivery:**
  - Automated SMTP/Email alerts (registered account email ya custom override ke sath).
  - In-App persistent notification bell feed unread status indicators ke sath.
  - Anti-spam cooling logic to prevent notification fatigue.
- **Baseline Acceptance Lifecycle:** Ek click mein updated API schema ko new canonical baseline designate karne ka workflow.

---

## 🏗️ Architecture & Tech Stack

┌─────────────────────────────────────────────────────────────┐
│                     Next.js 14 Client                       │
│           (App Router, Tailwind CSS, NextAuth BFF)          │
└──────────────────────────────┬──────────────────────────────┘
│ Session Scoped /api/ proxy
▼
┌─────────────────────────────────────────────────────────────┐
│                     Express.js Backend                      │
│          (Drift Engine, Scheduler, Alert Pipeline)          │
└──────────────┬──────────────────────────────┬───────────────┘
│                              │
▼                              ▼
┌───────────────┐              ┌───────────────┐
│  MongoDB DB   │              │ SMTP Service  │
│  (Mongoose)   │              │  (Nodemailer) │
└───────────────┘              └───────────────┘


- **Frontend:** Next.js 14 (App Router), React, Tailwind CSS, Lucide Icons.
- **Backend / Engine:** Node.js, Express.js, Custom Diff & Type Inference Algorithms.
- **Database:** MongoDB via Mongoose (with compound indexing for sub-second telemetry lookups).
- **Authentication:** NextAuth.js (Google OAuth 2.0) with internal secret-backed BFF hydration.
- **Background Jobs:** Node-cron / BullMQ scheduling engine.

---

## 🚀 Quick Start & Installation

### Prerequisites
- Node.js (v18.x or higher)
- MongoDB running locally or a MongoDB Atlas URI
- Google Cloud OAuth Credentials

---

### 1. Repository Clone & Setup

```bash
git clone [https://github.com/your-username/chronogit.git](https://github.com/your-username/chronogit.git)
cd chronogit
2. Backend Configuration (server/)
Move into the server folder and install dependencies:

Bash
cd server
npm install
Create a .env file in server/:

Code snippet
PORT=4000
MONGO_URI=mongodb://localhost:27017/chronogit
INTERNAL_API_SECRET=your_super_secret_internal_key

# SMTP Configuration (Optional in dev; falls back to console/Ethereal)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-digit-app-password
ALERT_FROM_EMAIL=your-email@gmail.com
Start backend dev server:

Bash
npm run dev
3. Frontend Configuration (client/)
Move into the client folder and install dependencies:

Bash
cd ../client
npm install
Create a .env.local file in client/:

Code snippet
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_random_generated_secret_string

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Backend BFF Proxy Config
EXPRESS_API_URL=http://localhost:4000
INTERNAL_API_SECRET=your_super_secret_internal_key
Start Next.js client dev server:

Bash
npm run dev
Open http://localhost:3000 in your browser.

🧪 Testing
Backend Unit & Integration Tests
ChronoGit contains a comprehensive test suite validating drift inference, diff calculations, anti-spam mechanisms, and monitor access ownership.

Bash
cd server
npm test
Production Build Verification
To ensure all dynamic server components and chunk dependencies compile cleanly:

Bash
cd client
npm run build
🛠️ Testing Real-Time Drift Simulation
ChronoGit provides an in-built mock endpoint to instantly simulate API drift:

Add a monitor with URL:
http://localhost:4000/api/mock/weather
(Status: HEALTHY - Baseline captured).

Trigger non-breaking mutation:
http://localhost:4000/api/mock/weather?drift=nonbreaking
(Status: NON_BREAKING - New field highlighted in green).

Trigger breaking contract drift:
http://localhost:4000/api/mock/weather?drift=breaking
(Status: BREAKING - Incompatible types flagged in red, alerts dispatched to email & in-app bell).