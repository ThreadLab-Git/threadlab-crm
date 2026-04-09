# Threadlab — Expo Leads CRM

Node.js / Express backend + Supabase Postgres database.
The frontend (`public/index.html`) is served by Express and communicates with the API over `fetch()`.

---

## Quick-start (5 steps)

### 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and sign in (free tier is fine).
2. Click **New project**, give it a name (e.g. `threadlab-crm`), choose a region, set a password.
3. Wait ~1 minute for the project to spin up.

### 2 — Run the schema

1. In your Supabase dashboard, open **SQL Editor → New query**.
2. Paste the entire contents of `schema.sql` from this folder.
3. Click **Run**. You should see "Success. No rows returned."

### 3 — Copy your API keys

1. In Supabase, go to **Settings → API**.
2. Copy the **Project URL** and the **service_role** key (scroll down — it's the second key, labelled "secret").

### 4 — Set up your .env file

```bash
cp .env.example .env
```

Open `.env` and fill in your values:

```
SUPABASE_URL=https://your-project-id.supabase.co
SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
PORT=3000
```

> **Keep `.env` private — never commit it to git.**

### 5 — Install dependencies and start the server

```bash
npm install
npm run dev        # development (auto-restarts on file changes)
# or
npm start          # production
```

Open your browser at **http://localhost:3000**.
On the first load, the app will seed the database with all 45 Texworld Paris 26 leads automatically.

---

## Project structure

```
threadlab-crm/
├── public/
│   └── index.html          ← The full CRM frontend (served by Express)
├── server/
│   ├── index.js            ← Express entry point
│   ├── db/
│   │   └── supabase.js     ← Supabase client (uses service role key)
│   ├── data/
│   │   └── seed.js         ← All 45 seed leads (server-side only)
│   └── routes/
│       ├── leads.js        ← /api/leads — CRUD + stage + notes + activity
│       └── events.js       ← /api/events — list unique event names
├── schema.sql              ← Run this in Supabase SQL Editor
├── .env.example            ← Copy to .env and fill in your keys
├── package.json
└── README.md
```

---

## API reference

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/leads` | List all leads (score desc) |
| GET | `/api/leads/:id` | Get a single lead |
| POST | `/api/leads` | Create a new lead |
| PUT | `/api/leads/:id` | Update a lead (full replace) |
| PATCH | `/api/leads/:id/stage` | Update pipeline stage only |
| PATCH | `/api/leads/:id/personal-note` | Update personal note only |
| GET | `/api/leads/:id/activity` | Get activity log for a lead |
| POST | `/api/leads/seed` | Seed DB from built-in data (no-op if leads exist) |
| GET | `/api/events` | List all unique event names |

---

## Adding a new event / trade show

Just add leads with a new event name via the **+ Add Lead** form — the event tab bar updates automatically. There is no need to pre-register events anywhere.

---

## Deployment tips

- **Railway / Render / Fly.io**: Set the same env vars (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `PORT`) in the platform's environment settings and deploy the repo root. The server will serve the frontend from `public/`.
- **Vercel / Netlify**: These are better suited for static sites. For this project, use a Node-compatible host listed above.

---

## Security note

The server uses the **service role** key, which bypasses Row Level Security in Supabase. This is fine as long as the server is never exposed publicly without authentication. For a production deployment, consider adding a login layer (e.g. basic auth middleware or Supabase Auth).
