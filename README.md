Tumhari original README ke structural flow ko retain karte hue yeh updated, production-ready version generate kiya gaya hai. Isme humne jo naye additions integrate kiye hain—jaise **Resend HTTP API migration**, **Beeceptor dynamic testing**, **Discard Drift flow**, **Dashboard monitor deletion**, aur **Ephemeral Sandbox Demo Mode**—wo sab structured form me add kar diye hain:

```markdown
# ChronoGit ⚡

> **Autonomous API Contract Drift Engine & Breaking Change Sentinel**

ChronoGit is an automated API monitoring and contract drift detection platform. It continuously evaluates live microservices and external third-party endpoints, derives canonical JSON response schemas on the fly, visualizes field-level and type-level mutations in a side-by-side Git diff viewer, and dispatches multi-channel alerts (via Resend HTTP email and an in-app notification center) whenever breaking contract drifts occur.

---

## Key Features

* **Automated Contract Inference**: Recursively inspects live JSON payloads to map strict structural contracts (primitive types, objects, arrays, and nullable fields).

* **Intelligent Drift Classification**:
  * `HEALTHY`: Live response schema perfectly matches the saved baseline.
  * `NON_BREAKING`: New non-destructive keys or optional fields have been introduced.
  * `BREAKING`: Existing fields have been deleted, or types have mutated (e.g., `number` to `string`, object converted to array).

* **Git-Style Visual Diff Viewer**: Side-by-side split screen showing the accepted baseline contract against the mutated response schema with syntax highlights.

* **Non-Destructive Drift Dismissal ("Discard Drift")**: Allows developers to clear/dismiss active breaking drift diffs and reset the monitor to `HEALTHY` without mutating or accepting the corrupt schema into the baseline contract.

* **Dashboard Lifecycle Management**: Direct monitor deletion from dashboard cards with cascade deletion of stored AST baselines, check logs, and associated notifications.

* **Dual-Tier Identity & Sandbox Isolation**:
  * **Ephemeral Demo Sandbox**: Guest sessions run in an isolated sandbox (`demo@chronogit.dev`) seeded with mock endpoints, protecting developer credentials while enabling interactive testing.
  * **Google OAuth 2.0**: Permanent personal profiles with strict tenant-level isolation for live production tracking.

* **Dual Alert Channels**:
  * **Email Alerts via Resend HTTP REST API**: Dispatches sub-second transactional alerts bypassing raw SMTP outbound port blockades.
  * **In-App Notification Feed**: Persistent dashboard notification bell with real-time unread counters and direct routing to drift diff inspection pages.

* **One-Click Baseline Promotion**: Allows developers to promote acceptable breaking changes to the new baseline with a single click, resolving active alert states.

---

## Architecture & Tech Stack

```text
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 14 Client                       │
│           (App Router, Tailwind CSS, NextAuth BFF)          │
│                    [Deployed on Vercel]                     │
└──────────────────────────────┬──────────────────────────────┘
                               │
                 Session-Scoped /api/ BFF Proxy
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Express.js Backend                      │
│          (Drift Engine, Scheduler, Alert Pipeline)          │
│                    [Deployed on Render]                     │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
     ┌────────────────┐             ┌────────────────┐
     │   MongoDB DB   │             │   Resend API   │
     │   (Mongoose)   │             │  (HTTP / 443)  │
     └────────────────┘             └────────────────┘

```

### Frontend

* Next.js 14 (App Router)
* React
* Tailwind CSS
* Lucide Icons
* NextAuth.js

### Backend

* Node.js
* Express.js

### Database

* MongoDB Atlas / Mongoose
* Compound indexes:
* `{ userId: 1, createdAt: -1 }`
* `{ monitorId: 1, createdAt: -1 }`



### Authentication & Tenant Boundary

* NextAuth.js (Google OAuth 2.0 + Dedicated Demo Sandbox Provider)
* Shared secret handshake (`INTERNAL_API_SECRET`) between Next.js BFF and Express backend

### Background Engine & Alert Delivery

* Node-cron scheduler (1m, 5m, 15m, 60m polling intervals)
* Resend HTTP REST API (Reliable transactional emails over port 443)
* Anti-spam alert cooldown engine to avoid duplicate breach dispatches

---

## 🔬 Production Challenges & Solutions

### 1. Cloud SMTP Port Blockades $\rightarrow$ Resend HTTP API Migration

* **Challenge**: When deploying to cloud container platforms like Render free tier, outbound raw TCP socket connections on ports `587` and `465` are strictly firewalled or cause IPv6 `ENETUNREACH` / `Connection timeout` errors with Gmail SMTP.
* **Solution**: Migrated the notification transport from raw Nodemailer socket connections to the **Resend HTTP REST API** (`resend.emails.send()`). Operating over standard HTTPS (Port 443), alerts are dispatched reliably within milliseconds without being subjected to outbound cloud port blocks.

### 2. Live Contract Drift Simulation $\rightarrow$ Beeceptor Integration

* **Challenge**: Local mock endpoints (`localhost:4000`) cannot be accessed by production cloud backends (`connect ECONNREFUSED`).
* **Solution**: Integrated **Beeceptor** for zero-setup, dynamic cloud mock endpoints. Developers can declare baseline JSON payloads, connect ChronoGit, and mutate schemas in real time to simulate production breaking drifts and verify instant email delivery.

---

## Getting Started

### Prerequisites

* Node.js v18.x or later
* MongoDB instance (Local or MongoDB Atlas)
* Google Cloud Console OAuth 2.0 Credentials
* Resend API Key ([resend.com](https://resend.com))

---

## Installation & Local Setup

### 1. Clone the Repository

```bash
git clone [https://github.com/vedantbhakare25-dotcom/chronogit.git](https://github.com/vedantbhakare25-dotcom/chronogit.git)
cd chronogit

```

### 2. Backend Setup (`server/`)

Navigate to the backend directory and install packages:

```bash
cd server
npm install

```

Create a `.env` file inside `server/`:

```env
PORT=4000
MONGODB_URI=mongodb://localhost:27017/chronogit
INTERNAL_API_SECRET=your_secure_random_internal_secret

# Alert Delivery via Resend API
RESEND_API_KEY=re_your_resend_api_key
ALERT_FROM_EMAIL=onboarding@resend.dev

```

Run the backend development server:

```bash
npm run dev

```

---

### 3. Frontend Setup (`client/`)

Open a new terminal and navigate to the client directory:

```bash
cd ../client
npm install

```

Create a `.env.local` file inside `client/`:

```env
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=your_generated_nextauth_secret

# Google OAuth Credentials
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret

# Backend BFF Configuration
EXPRESS_API_URL=http://localhost:4000
INTERNAL_API_SECRET=your_secure_random_internal_secret

```

Run the Next.js development server:

```bash
npm run dev

```

Visit [http://localhost:3000](http://localhost:3000).

---

## Live Drift Simulation Guide

### Option A: Testing via Beeceptor (Recommended for Production & Cloud Testing)

1. Create a free mock endpoint at [beeceptor.com](https://beeceptor.com/) (e.g., `https://my-test-api.free.beeceptor.com/data`).
2. Add a baseline JSON response:
```json
{
  "status": "success",
  "userId": 101,
  "role": "admin"
}

```


3. In ChronoGit dashboard, click **+ Add Monitor**, paste the Beeceptor URL, set interval to **Every 1 min**, and provide your test alert email.
4. Baseline captured: Status becomes `HEALTHY`.
5. Return to Beeceptor and alter the response schema to simulate a breaking change:
```json
{
  "status": 200,
  "role": ["admin", "superadmin"]
}

```


*(Field `userId` removed; `status` type changed from string to number; `role` changed from string to array).*
6. Click **Check Now** on ChronoGit. Status immediately flags as `BREAKING`, and a contract breach alert is dispatched to your email via Resend.

### Option B: Local Built-in Mock Simulation

1. Click **+ Add Monitor** in the dashboard and enter:
```text
http://localhost:4000/api/mock/weather

```


2. Test non-breaking additions:
```text
http://localhost:4000/api/mock/weather?drift=nonbreaking

```


3. Test breaking schema deletions and type mutations:
```text
http://localhost:4000/api/mock/weather?drift=breaking

```



---

## Drift Lifecycle & Remediation

When a drift is detected, developers have two explicit operational choices:

```text
                  Breaking Schema Detected
                             │
              ┌──────────────┴──────────────┐
              ▼                             ▼
    [ Accept as New Baseline ]     [ Discard Drift ]
              │                             │
    Mutates stored AST to         Discards current diff,
    match received payload.       marks monitor HEALTHY,
    Monitor returns to HEALTHY.   preserves original contract.

```

---

## Drift Classification Matrix

| Status | Trigger Condition | System Action |
| --- | --- | --- |
| `HEALTHY` | Live response schema strictly conforms to the saved baseline AST. | No alert triggered. Check log recorded. |
| `NON_BREAKING` | New additive fields or optional keys detected. | Logged in history; flagged in green on diff view. |
| `BREAKING` | Existing keys deleted, field renamed, or data types altered. | Dispatches Resend email, triggers in-app notification, turns status badge red. |

---

## Project Structure

```text
chronogit/
├── client/
│   ├── app/
│   │   ├── api/             # BFF proxies (monitors, auth, dismiss)
│   │   ├── monitors/[id]/   # Visual Git diff viewer & action handlers
│   │   └── settings/        # Alert destination & notification preferences
│   ├── components/          # MonitorCard, AddModal, Navbar, Notifications
│   └── lib/                 # NextAuth options & fetch helpers
│
├── server/
│   ├── controllers/         # API request controllers
│   ├── models/              # Mongoose schemas (Monitor, Baseline, User)
│   ├── routes/              # Express endpoints (/api/monitors)
│   ├── services/            # Contract inferrer, diff generator, Resend mailer
│   └── scheduler/           # Node-cron background pollers
│
└── README.md

```

---

## Security

ChronoGit uses multiple layers of isolation and authentication:

* Google OAuth 2.0 authentication through NextAuth.js.
* Isolated sandbox user profile for demo testing without real credential leakage.
* HMAC/shared-secret handshake (`INTERNAL_API_SECRET`) ensuring Express endpoints reject requests not routed via the BFF.
* Tenant-level data isolation preventing cross-account monitor access.
* Zero storage of third-party API credentials on plain text channels.

> **Never commit `.env`, `.env.local`, OAuth credentials, Resend API keys, or internal secrets to version control.**

---

## License

Distributed under the MIT License. See `LICENSE` for more details.

```

```