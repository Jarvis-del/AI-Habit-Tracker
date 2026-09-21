![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)

# Momentum — AI-Powered Habit Tracker

A full-stack habit tracker with streak tracking, a 90-day GitHub-style heat map,
weekly stats, and five Gemini-powered AI features: a morning motivation banner,
a 3-step habit suggestion wizard, an automatic streak-recovery coach, weekly
AI performance reports, and a natural-language chat over your habit data.

## Tech stack

**Frontend:** React 19 + Vite, Tailwind CSS v4 (glassmorphism UI, light/dark mode
with system detection), React Router, Recharts, Lucide React icons, React
Markdown, canvas-confetti.

**Backend:** Node.js + Express (REST API), MongoDB Atlas + Mongoose, JWT auth
with bcrypt password hashing, `@google/genai` (Gemini 2.5 Flash), date-fns.

## Project structure

```
my-app/
├── client/                 # React frontend (Vite)
│   ├── public/
│   ├── src/
│   │   ├── assets/
│   │   ├── components/     # HabitChecklist, HeatMap, AIWizard, AIChat, ...
│   │   ├── context/        # AuthContext, ThemeContext
│   │   ├── hooks/          # useHabits, useLocalStorage
│   │   ├── pages/          # Login, Register, Dashboard, Insights
│   │   ├── services/       # axios instance + one file per API resource
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   └── package.json
│
├── server/                 # Express backend
│   ├── src/
│   │   ├── config/         # db.js, gemini.js
│   │   ├── controllers/    # authController, habitController, logController, aiController
│   │   ├── middlewares/    # auth, errorHandler, rateLimiter, validate
│   │   ├── models/         # User, Habit, HabitLog, AIInsight
│   │   ├── routes/         # auth, habits, logs, ai
│   │   ├── utils/          # streaks.js, generateToken.js, logger.js, errorClasses.js
│   │   └── app.js
│   ├── scripts/seed.js     # seeds a demo user with ~500 realistic 90-day logs
│   ├── server.js
│   └── package.json
│
└── README.md
```

## Getting started

### 1. Backend

```bash
cd server
cp .env.example .env
# edit .env: set MONGODB_URI, JWT_SECRET, GEMINI_API_KEY
npm install
npm run seed     # optional: creates demo@habittracker.app / password123 with sample data
npm run dev       # starts on http://localhost:5000
```

### 2. Frontend

```bash
cd client
npm install
npm run dev       # starts on http://localhost:5173, proxies /api to the backend
```

Visit `http://localhost:5173` and either register a new account or log in with
the seeded demo account.

## Environment variables (server/.env)

| Variable | Description |
|---|---|
| `PORT` | Port the API listens on (default 5000) |
| `MONGODB_URI` | MongoDB Atlas (or local) connection string |
| `JWT_SECRET` | Long random string used to sign auth tokens |
| `GEMINI_API_KEY` | API key for Google Gemini (used by all `/api/v1/ai/*` routes) |
| `CLIENT_URL` | Frontend origin, for CORS (default `http://localhost:5173`) |

## API overview

- `POST /api/v1/auth/register`, `/login`, `GET /me`, `PATCH /settings`
- `GET/POST /api/v1/habits`, `GET/PATCH/DELETE /api/v1/habits/:id`, `PATCH /:id/archive`
- `POST /api/v1/logs/toggle`, `GET /api/v1/logs`, `GET /api/v1/logs/weekly-summary`
- `GET /api/v1/ai/morning-banner`
- `POST /api/v1/ai/suggest-habits`
- `GET /api/v1/ai/streak-recovery/:habitId`
- `GET /api/v1/ai/weekly-report`
- `POST /api/v1/ai/chat`

All routes except `/auth/register` and `/auth/login` require an
`Authorization: Bearer <token>` header (handled automatically by the frontend's
axios interceptor).

## Notes

- Habit deletion is a **soft archive** by default (`PATCH /:id/archive`) so
  historical completion data is preserved; `DELETE /:id` is a true hard delete.
- `HabitLog` dates are stored as `YYYY-MM-DD` strings (not `Date` objects) to
  avoid timezone bugs, with a unique compound index on `(user, habit, completedDate)`.
- AI responses are cached per-day/per-week in `AIInsight` to avoid redundant
  Gemini calls (e.g. the morning banner and weekly report are generated once
  per day/week, not on every page load).


---

## Setup (quick)

```bash
# 1) backend
cd server && cp .env.example .env      # fill in MONGODB_URI, JWT_SECRET, GEMINI_API_KEY
npm install
npm run doctor                          # checks Node, .env, MongoDB and a live Gemini call
npm run seed                            # optional demo data: demo@habittracker.app / password123
npm run dev

# 2) frontend (new terminal)
cd client && npm install && npm run dev  # http://localhost:5173
```

Node 20+ is required. **Restart the server after editing `server/.env`** - it is only read at startup.

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| AI cards show "AI is not configured" | `GEMINI_API_KEY` missing/placeholder in `server/.env`. Run `npm run doctor`. |
| "Gemini rejected your API key" | Key is wrong, has quotes/spaces, or the Generative Language API is disabled for it. |
| "Gemini model ... is not available any more" | Google retired the model. Set `GEMINI_MODEL` in `server/.env` (see https://ai.google.dev/gemini-api/docs/models). A fallback model (`GEMINI_FALLBACK_MODELS`) is tried automatically. |
| "Gemini is temporarily unavailable (HTTP 503: The model is overloaded)" | Google-side capacity problem for that model (not your key or quota; paid tiers don't avoid it). The server now retries with backoff and falls back to other models automatically (`GEMINI_FALLBACK_MODELS`); if you still see it, all models were busy - press **Try again** in the chat or retry in a minute. The message lists which models were tried. |
| "rate/quota limit was reached" | Gemini free-tier quota. Wait a minute, or enable billing. |
| Blank page / CSS 500 in dev | Make sure there is **no** `client/postcss.config.js`; Tailwind v4 is loaded through the Vite plugin only. |
| Login works but you get bounced to /login | A real 401 (expired token). Log in again. Gemini/DB errors no longer cause this. |
| API not reachable / proxy errors | Backend not running, or `PORT` changed - set `VITE_API_PROXY_TARGET` in `client/.env`. On macOS, port 5000 is used by AirPlay Receiver. |
| MongoDB connection error | Atlas: add your IP under Network Access; URL-encode special characters in the password; some ISPs block `mongodb+srv` DNS lookups. |

"Today" is computed from the browser's time zone (sent as the `X-Timezone` header), so streaks
are correct regardless of where the server runs.


## Testing

```bash
# backend: needs a MongoDB to run against (docker run -p 27017:27017 mongo:7, or a local install)
cd server
npm test                     # unit + integration (real Express app, real DB, fake Gemini - no network, no API quota)
npm run test:coverage

# frontend
cd client
npm test                     # components, services, regression guards
npm run test:coverage
```

- The server suite talks to `TEST_MONGODB_URI` (default `mongodb://127.0.0.1:27017/habit-tracker-test`) and **refuses to run
  unless the database name contains "test"**, because it wipes the database.
- Gemini is replaced by an in-process fake (`server/tests/helpers/mockGemini.js`) that can simulate quota errors, invalid keys,
  retired models and empty answers.
- GitHub Actions (`.github/workflows/ci.yml`) runs both suites on Node 20 and 22 (with a MongoDB service container), builds the
  client, and runs an informational `npm audit`. Replace `OWNER/REPO` in the badge above with your repository.

What is covered: streak/date logic (month, year and leap-day boundaries, time zones), the rate limiter, the NoSQL-injection
sanitizer, the whole auth lifecycle, every habit/log endpoint, all 5 AI features (prompts, caching, sanitising, failures), and
the UI pieces (rings, orbit system, heat map, chat, login, change-password, the API client's token refresh).

## Security

| Area | What is implemented |
|---|---|
| Sessions | 15-minute access JWT (kept **in memory only**) + opaque 7-day refresh token in an **httpOnly, SameSite** cookie scoped to `/api/v1/auth`. Refresh tokens are **single-use and rotated**; only their SHA-256 hash is stored. |
| Token theft | Replaying an already-used refresh token revokes the whole token family (reuse detection). A unique DB constraint guarantees only one concurrent refresh can succeed. |
| CSRF | SameSite cookie + a custom `X-Requested-With` header required on the cookie-authenticated endpoints. |
| Passwords | bcrypt (cost 12), 8-72 chars with a letter and a number, timing-safe login (no user enumeration), change-password revokes every other session and older access tokens. |
| Brute force | Failed-login limiter per IP+email and per IP (successful logins don't count), sign-up limiter, separate per-user AI limiter, global limiter. |
| Injection | Request sanitizer removes `$operators`, dotted keys and `__proto__`; all input is type-coerced; every query is scoped to the authenticated user (IDOR-tested). |
| Transport / headers | `helmet` (CSP, HSTS, nosniff, frame denial, ...), strict CORS allow-list, 100 KB body limit, `x-powered-by` removed. |
| Errors | No stack traces or internals in responses; Gemini failures never surface as 401 (which would log users out). |

**Deploying?** Set `NODE_ENV=production` (adds the `Secure` cookie flag), a `JWT_SECRET` of 32+ random characters (the server
refuses to start otherwise), `CLIENT_URL` to your frontend origin and `TRUST_PROXY=1` behind a reverse proxy. If the frontend and
API are on **different sites** (e.g. `*.vercel.app` + `*.onrender.com`) set `COOKIE_SAMESITE=none`; note that Safari and some
browsers block third-party cookies, so putting both under one domain (`app.example.com` + `api.example.com`) or proxying `/api`
through the frontend host is more reliable.

Not implemented (would need an email provider): email verification and "forgot password" by email.
