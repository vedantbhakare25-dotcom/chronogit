# ChronoGit ⚡

> **Autonomous API Contract Drift Engine & Breaking Change Sentinel**

ChronoGit is an automated API monitoring and contract drift detection platform. It continuously evaluates live microservices and external third-party endpoints, derives canonical JSON response schemas on the fly, visualizes field-level and type-level mutations in a side-by-side Git diff viewer, and dispatches multi-channel alerts (via SMTP email and an in-app notification center) whenever breaking contract drifts occur.

---

## Key Features

* **Automated Contract Inference**: Recursively inspects live JSON payloads to map strict structural contracts (primitive types, objects, arrays, and nullable fields).

* **Intelligent Drift Classification**:

  * `HEALTHY`: Live response schema perfectly matches the saved baseline.
  * `NON_BREAKING`: New non-destructive keys or optional fields have been introduced.
  * `BREAKING`: Existing fields have been deleted, or types have mutated (e.g., `number` to `string`).

* **Git-Style Visual Diff Viewer**: Side-by-side split screen showing the accepted baseline contract against the mutated response schema with syntax highlights.

* **Multi-Tenant User Isolation**: Secured via NextAuth.js OAuth. Every monitor, check log, and notification is strictly scoped to the authenticated user ID.

* **Dual Alert Channels**:

  * **Email Alerts**: Dispatches automated SMTP alerts to the user's primary account email or a custom-configured destination.
  * **In-App Notification Feed**: Persistent dashboard notification bell with real-time unread badges and direct navigation to drift diff pages.

* **One-Click Baseline Promotion**: Allows developers to promote acceptable breaking changes to the new baseline with a single click, resolving active alert states.

---

## Architecture & Tech Stack

```text
┌─────────────────────────────────────────────────────────────┐
│                     Next.js 14 Client                       │
│           (App Router, Tailwind CSS, NextAuth BFF)          │
└──────────────────────────────┬──────────────────────────────┘
                               │
                  Session-Scoped /api/ BFF Proxy
                               │
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                     Express.js Backend                      │
│          (Drift Engine, Scheduler, Alert Pipeline)          │
└──────────────┬──────────────────────────────┬───────────────┘
               │                              │
               ▼                              ▼
     ┌────────────────┐             ┌────────────────┐
     │   MongoDB DB   │             │  SMTP Service  │
     │   (Mongoose)   │             │  (Nodemailer)  │
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

* MongoDB
* Mongoose
* Compound indexes:

  * `{ userId: 1, createdAt: -1 }`
  * `{ monitorId: 1, createdAt: -1 }`

### Authentication

* NextAuth.js
* Google OAuth 2.0
* Internal HMAC/shared-secret handshake between Next.js and Express

### Background Engine

* Node-cron scheduler
* Built-in anti-spam cooldown mechanisms

---

## Getting Started

### Prerequisites

* Node.js v18.x or later
* MongoDB instance (Local or MongoDB Atlas)
* Google Cloud Console OAuth 2.0 Credentials

---

## Installation & Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/chronogit.git
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
MONGO_URI=mongodb://localhost:27017/chronogit
INTERNAL_API_SECRET=your_secure_random_internal_secret

# SMTP Configuration
# Optional in development; defaults to Ethereal/mock logs
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-16-character-google-app-password
ALERT_FROM_EMAIL=your-email@gmail.com
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

Visit:

```text
http://localhost:3000
```

---

## Verification & Testing

### Running Backend Unit & Integration Tests

```bash
cd server
npm test
```

### Validating the Production Build

```bash
cd client
npm run build
```

---

## Live Drift Simulation Guide

ChronoGit includes a built-in mock endpoint to test schema drift behavior in development.

### 1. Create a Monitor

Click **+ Add Monitor** in the dashboard and enter:

```text
http://localhost:4000/api/mock/weather
```

The baseline schema will be captured and the monitor status should display:

```text
HEALTHY
```

### 2. Test Non-Breaking Drift

Append the `drift=nonbreaking` parameter:

```text
http://localhost:4000/api/mock/weather?drift=nonbreaking
```

The status transitions to:

```text
NON_BREAKING
```

New fields are flagged in green in the diff viewer.

### 3. Test Breaking Drift

Append the `drift=breaking` parameter:

```text
http://localhost:4000/api/mock/weather?drift=breaking
```

The status transitions to:

```text
BREAKING
```

Field deletions and type mutations are flagged in red, triggering:

* Email alerts
* In-app notifications

### 4. Accept the New Baseline

Navigate to the Diff View page and click:

**Accept as New Baseline**

The new schema becomes the accepted baseline and the monitor returns to:

```text
HEALTHY
```

---

## Drift Classification

| Status         | Description                                         |
| -------------- | --------------------------------------------------- |
| `HEALTHY`      | Live response schema matches the saved baseline     |
| `NON_BREAKING` | New non-destructive fields have been added          |
| `BREAKING`     | Existing fields were removed or their types changed |

---

## Project Structure

```text
chronogit/
├── client/
│   ├── app/
│   ├── components/
│   ├── lib/
│   └── ...
│
├── server/
│   ├── controllers/
│   ├── models/
│   ├── routes/
│   ├── services/
│   ├── scheduler/
│   └── ...
│
└── README.md
```

---

## Core Workflow

```text
Live API Endpoint
       │
       ▼
Fetch JSON Response
       │
       ▼
Infer Canonical Schema
       │
       ▼
Compare Against Baseline
       │
       ├───────────────┐
       ▼               ▼
    HEALTHY       Schema Drift
                       │
                ┌──────┴──────┐
                ▼             ▼
          NON_BREAKING     BREAKING
                              │
                       ┌──────┴──────┐
                       ▼             ▼
                  Email Alert   In-App Alert
                                      │
                                      ▼
                              Git-Style Diff
                                      │
                                      ▼
                            Accept New Baseline
```

---

## Security

ChronoGit uses multiple layers of isolation and authentication:

* Google OAuth 2.0 authentication through NextAuth.js
* Session-scoped backend requests
* HMAC/shared-secret authentication between the Next.js BFF and Express backend
* User-specific data isolation
* User-scoped monitors, check logs, and notifications
* Environment variables for sensitive credentials and secrets

> **Never commit `.env`, `.env.local`, OAuth credentials, SMTP passwords, or internal API secrets to version control.**

---

## Future Enhancements

Potential future improvements include:

* Support for OpenAPI/Swagger contract imports
* Webhook-based alerts
* Slack and Discord notifications
* API authentication templates
* Historical schema versioning
* Advanced scheduling controls
* Custom breaking-change rules
* Team-based collaboration
* CI/CD integration
* GitHub Actions integration
* Public API for automated contract checks

---


