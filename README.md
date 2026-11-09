# SpendWise

An offline-first daily expense tracker for Indian Rupees. SpendWise keeps every
transaction, budget and setting in the browser's IndexedDB, so adding, editing,
deleting and browsing expenses never waits for a network request. A FastAPI +
SQLite backend is used only as a synchronisation target.

The UI is a responsive finance dashboard (white, blue, green and violet) with a
desktop sidebar and a mobile drawer, charts, empty/loading states and a live sync
indicator that reports **Online**, **Offline**, **Syncing**, **Synced** or
**Sync failed**.

---

## Stack

| Layer | Technology |
| --- | --- |
| Frontend | Next.js 16 App Router, React 19, TypeScript, Tailwind CSS 4 |
| Local database | Dexie 4 / IndexedDB |
| Charts | Recharts |
| Icons | lucide-react |
| Backend | FastAPI, SQLAlchemy 2, Pydantic 2 |
| Database | SQLite (WAL mode) |
| Unit tests | Vitest + fake-indexeddb |
| End-to-end tests | Playwright (production build + service worker) |
| Money | Integer paise everywhere (`₹1 = 100 paise`) |

---

## Features

- **Six screens**: Dashboard, Transactions, Add Transaction, Analytics, Budgets,
  Settings. Edit Transaction and Offline are additional routes.
- **Local-first CRUD**: every write goes to IndexedDB and a persistent outbox
  before the UI reports success.
- **Automatic sync**: debounced after each change, on reconnect, every 30 seconds
  while the app is open, and when the tab becomes visible again. A manual
  **Sync now** button is always available.
- **Idempotent uploads**: each queued operation has a client-generated UUID and
  the server keeps an operation ledger, so retries and lost responses never
  create duplicates.
- **Tombstones**: deletes are soft deletes and replicate to other devices.
- **Conflict handling**: last-write-wins with explicit review. A losing local
  edit is surfaced in Settings instead of being silently discarded.
- **Budgets**: overall and per-category monthly budgets with progress,
  remaining amount and warning/exceeded states.
- **Analytics**: monthly income vs expense, daily spending, category split,
  category detail and budget status. Dashboard analytics are computed locally,
  so they work offline.
- **PWA**: installable manifest, production service worker and a cached app
  shell for offline reloads.
- **Data controls**: JSON export (including tombstones), clear local data,
  server connection test and failed-operation retry.

---

## Project structure

```
spendwise/
├── README.md
├── backend/
│   ├── main.py              # FastAPI app, transaction and budget REST routes
│   ├── database.py          # SQLite engine, session factory, WAL pragmas
│   ├── models.py            # transactions, budgets, sync_operations
│   ├── schemas.py           # Pydantic request/response models
│   ├── crud.py              # reads, writes, LWW policy, tombstones
│   ├── sync.py              # /api/sync, /api/sync/status, /api/sync/changes
│   ├── analytics.py         # /api/analytics/* endpoints
│   ├── utils.py             # UTC helpers and month boundaries
│   ├── requirements.txt
│   └── tests/               # pytest API and sync tests
└── frontend/
    ├── app/                 # App Router pages
    │   ├── page.tsx         # Dashboard
    │   ├── transactions/    # list, new, edit
    │   ├── analytics/
    │   ├── budgets/
    │   ├── settings/
    │   ├── offline/
    │   └── layout.tsx
    ├── components/          # shell, forms, charts, sync UI, shared UI
    ├── hooks/               # useTransactions, useSync
    ├── services/            # db, api, queue, sync, transactions, budgets,
    │                        # analytics, conflicts
    ├── lib/                 # money, dates, categories, utils
    ├── types/               # local and API types
    ├── public/              # sw.js, manifest.webmanifest, icon.svg
    ├── tests/               # Vitest unit tests
    │   └── e2e/             # Playwright scenarios A–E
    ├── .env.example
    ├── playwright.config.ts
    └── vitest.config.mts
```

---

## Getting started

Requirements: **Node.js 22+**, **Python 3.11+**, and npm.

The commands below assume the repository root is the folder that contains
`spendwise/`.

### 1. Backend (terminal 1)

Windows PowerShell:

```powershell
cd spendwise
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
cd backend
..\.venv\Scripts\python.exe -m uvicorn main:app --reload --port 8000
```

macOS / Linux:

```bash
cd spendwise
python3 -m venv .venv
./.venv/bin/python -m pip install -r backend/requirements.txt
cd backend
../.venv/bin/python -m uvicorn main:app --reload --port 8000
```

Useful URLs:

- API index: <http://localhost:8000/>
- Swagger UI: <http://localhost:8000/docs>
- Health: <http://localhost:8000/api/health>

The default SQLite file is `backend/spendwise.db`. Override it with
`SPENDWISE_DB_PATH` (a file path) or `SPENDWISE_DATABASE_URL` (a full SQLAlchemy
URL). CORS allows `localhost`/`127.0.0.1` on ports 3000 and 3001 by default;
override with a comma-separated `SPENDWISE_CORS_ORIGINS`.

### 2. Frontend (terminal 2)

```powershell
cd spendwise\frontend
npm install
Copy-Item .env.example .env.local
npm run dev
```

macOS / Linux:

```bash
cd spendwise/frontend
npm install
cp .env.example .env.local
npm run dev
```

Open <http://localhost:3000>.

`.env.local`:

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
```

The frontend defaults to `http://localhost:8000` when the variable is absent.
`NEXT_PUBLIC_*` values are baked in at build time, so rebuild after changing
them for a production run.

### 3. Production / offline mode

The service worker is registered **only in production**. To exercise offline
behaviour and the PWA:

```powershell
cd spendwise\frontend
npm run build
npm start
```

Then open <http://localhost:3000>. The first visit must be online so the service
worker can install and cache the app shell. After that, a full page reload works
offline for the cached routes.

For a non-default API URL in production, set it before building:

```powershell
$env:NEXT_PUBLIC_API_URL = "http://127.0.0.1:8000"
npm run build
npm start
```

---

## Data model

### IndexedDB (`spendwise` database)

| Table | Purpose |
| --- | --- |
| `transactions` | Local transactions, including soft-deleted tombstones |
| `budgets` | Monthly overall/category budgets, including tombstones |
| `syncQueue` | Persistent outbox; `++seq` ordering, unique `operationId` |
| `meta` | Sync cursors (`lastSyncedAt`, `lastPulledAt`) |
| `conflicts` | Unresolved/resolved conflict records with local and server copies |

Records are stored in camelCase in IndexedDB and mapped to snake_case at the API
boundary. Amounts are integer paise in both places. Dates are `YYYY-MM-DD`;
timestamps are UTC ISO-8601.

### SQLite

| Table | Purpose |
| --- | --- |
| `transactions` | Server copy with `version`, `updated_at`, `deleted_at` |
| `budgets` | Server copy with `version`, `updated_at`, `deleted_at` |
| `sync_operations` | Idempotency ledger keyed by client `operation_id` |

Every mutable row has a monotonically increasing `version` and an
`updated_at` timestamp. SQLite runs with foreign keys, WAL and
`synchronous=NORMAL`.

---

## API summary

All endpoints are under `/api`. Full interactive documentation is at `/docs`.

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/health` | Health and active database path |
| GET | `/transactions` | List/search/filter transactions (`q`, `type`, `category`, `start_date`, `end_date`, `month`, `year`, `include_deleted`, `limit`, `offset`, `sort`) |
| POST | `/transactions` | Create a transaction |
| GET | `/transactions/{id}` | Fetch one transaction |
| PUT | `/transactions/{id}` | Update (last-write-wins) |
| DELETE | `/transactions/{id}` | Soft-delete (tombstone) |
| GET | `/budgets` | List budgets (`month`, `year`, `include_deleted`) |
| POST | `/budgets` | Create an overall or category budget |
| PUT | `/budgets/{id}` | Update a budget |
| DELETE | `/budgets/{id}` | Soft-delete a budget |
| GET | `/analytics/summary` | Dashboard totals and overall budget state |
| GET | `/analytics/monthly?months=6` | Income vs expense by month |
| GET | `/analytics/categories?month=&year=` | Expense split by category |
| GET | `/analytics/weekly?days=7` | Daily expenses for the last N days |
| GET | `/analytics/budgets?month=&year=` | Budgets with spend/remaining/status |
| POST | `/sync` | Replay a batch of client operations idempotently |
| GET | `/sync/status` | Server row counts and last change time |
| GET | `/sync/changes?since=&limit=` | Pull rows changed after a cursor |

Money is always an integer number of paise. The API rejects amounts that are
zero, negative, or not whole paise.

---

## How sync works

### Local write path

1. A form action calls a repository function in `services/transactions.ts` or
   `services/budgets.ts`.
2. In one Dexie transaction, the record is written to IndexedDB and an operation
   is appended to `syncQueue`.
3. Only then does the UI show success and navigate. The network is never on the
   critical path.
4. A debounced sync (250 ms) starts in the background.

### Queue behaviour

- **Coalescing**: while an operation has never been attempted
  (`status = pending`, `attempts = 0`), subsequent edits rewrite its payload
  instead of growing the queue. CREATE and UPDATE coalesce into one item.
- **In-flight safety**: once an operation has been sent, a new edit gets a new
  operation UUID. An idempotent replay can therefore never return a stale cached
  result for the newer edit.
- **Deletes win locally**: queuing a DELETE removes unsent CREATE/UPDATE items
  for that entity and enqueues a tombstone.
- **Retries**: network failures reschedule with exponential backoff
  (2 s, 4 s, 8 s … capped at 5 minutes). Server-rejected operations become
  `failed` and are retried only by **Retry failed** / **Sync now**.
- **Missing server row**: if an UPDATE returns `not_found` (for example the
  server database was reset), the client automatically re-creates the record
  from its local copy as a new CREATE.

### Upload and pull

1. Due operations are sent in batches (up to 25) to `POST /api/sync`.
2. The server checks `sync_operations` by `operation_id`. A known operation
   returns its stored result with `duplicate: true`; it is not applied again.
3. Results are applied locally: clean records replace the local row, while rows
   with newer queued edits keep their local fields and only adopt the server
   `version`.
4. When the queue is empty, the client pulls `GET /api/sync/changes` using the
   `lastPulledAt` cursor and merges server rows.
5. Pull **never overwrites an entity with a queued operation**, and skips a
   local row whose `updatedAt` is newer than the server row.

### Conflict policy (last-write-wins, explicit)

Every record has a server `version` and `updated_at`. The client sends the
`base_version` it last saw and its own `updated_at` timestamp.

- If `base_version` matches the current server version, the write applies.
- Otherwise the write with the **later `updated_at`** wins.
- Equal timestamps keep the server copy (a CREATE at the same timestamp is
  reported as a duplicate).
- A losing write is **not silently dropped**. The server returns
  `status = "conflict"` with the current server record. The client stores both
  copies in the `conflicts` table, marks the local row `conflict`, shows a banner
  and adds an entry under **Settings → Sync conflicts**.
- **Keep server** adopts the server copy and clears the local conflict flag.
- **Reapply mine** creates a new operation with the current server version and a
  fresh timestamp, so the user's change wins on the next sync.

Deletes follow the same policy: a delete older than a server edit becomes a
conflict, while a newer delete produces a tombstone. Tombstones are returned by
pull so other devices learn about the deletion.

> LWW depends on client clocks. A device with a badly skewed clock can win or
> lose unexpectedly. The conflict review exists so this is visible and
> recoverable.

---

## Offline behaviour and the service worker

`public/sw.js` is registered only in production (`npm start`, not `npm run dev`).

- On install it precaches every shell route (`/`, `/transactions`,
  `/transactions/new`, `/transactions/edit`, `/analytics`, `/budgets`,
  `/settings`, `/offline`), the hashed JS/CSS files referenced by those pages,
  the manifest/icon, and RSC payloads for client-side navigation.
- Navigations are network-first with a cached page fallback, then `/offline`.
- `/_next/static/*` is cache-first because those filenames are content-hashed.
- RSC requests are network-first and cached by URL for offline client-side
  navigation.
- Requests to `/api/*` are **never cached**; sync must always reach the server.

Bump `CACHE_VERSION` in `public/sw.js` whenever the shell or caching strategy
changes, then rebuild. Old caches are deleted on activation.

Offline limitations:

- The first visit must be online so the worker can install.
- Data is local to a browser profile. Another browser or device starts empty
  until it syncs.
- Clearing site data/IndexedDB removes local data. Export a JSON backup first if
  there are unsynced changes.
- Sync runs while the app is open. Closing the browser stops timers; the queue
  resumes on the next launch or reconnect.
- Server-side analytics endpoints exist for other clients, but the SpendWise UI
  computes dashboard/analytics data locally so it works offline.

---

## Tests

### Backend — pytest

From `spendwise/backend`:

```powershell
..\.venv\Scripts\python.exe -m pytest tests -q
```

macOS / Linux (with the venv activated):

```bash
python -m pytest tests -q
```

Covers transaction CRUD, validation, filters, analytics, budgets, LWW
conflicts, idempotent replay, tombstones and pull changes. Tests use a temporary
SQLite file via `SPENDWISE_DATABASE_URL` and never touch the app database.

### Frontend — Vitest

From `spendwise/frontend`:

```bash
npm test
```

Covers paise parsing/formatting, local analytics, the local-first repository,
queue coalescing and sync success/retry/conflict/reapply behaviour.
`fake-indexeddb` provides the IndexedDB implementation in jsdom.

### End-to-end — Playwright scenarios A–E

One-time browser install:

```powershell
cd spendwise\frontend
npx playwright install chromium
```

Then:

```powershell
npm run test:e2e
```

The Playwright config starts both servers itself:

- FastAPI on `127.0.0.1:8100` using `backend/e2e.db`
- the production Next.js build on `127.0.0.1:3100`

These dedicated ports keep E2E runs isolated from a developer server on `:3000`
and an API on `:8000`. Stop anything already listening on `3100` or `8100`
before running. The E2E database persists between runs; tests use unique titles,
and deleting `backend/e2e.db*` resets it.

Scenarios:

| Scenario | What it proves |
| --- | --- |
| **A** | Online create, dashboard update, refresh persistence and server sync |
| **B** | Offline create survives an offline reload and syncs on reconnect |
| **C** | Offline delete is queued as a tombstone and syncs |
| **D** | A failed upload retries with the same operation UUID and never duplicates |
| **E** | A conflicting edit is surfaced in Settings and can be reapplied |

### Typecheck and build

```powershell
cd spendwise\frontend
npx tsc --noEmit
npm run build
```

All App Router pages are statically prerendered. The build must succeed before
the Playwright suite can start the production server.

---

## Manual offline checklist

1. Run `npm run build && npm start` and open the app online once.
2. Add a transaction, open Transactions, then reload to confirm IndexedDB
   persistence.
3. In browser DevTools, set **Network → Offline**.
4. Add, edit and delete transactions; check the offline banner and pending
   count.
5. Reload while still offline. The shell and the local data should render.
6. Go back online. The indicator moves through **Syncing** to **Synced** and the
   server receives the changes exactly once.
7. In Settings, use **Sync now**, **Retry failed**, **Export JSON backup** and
   **Clear local data** to verify the recovery paths.

---

## Capacitor readiness

Capacitor is **not implemented**, but the app is structured to be portable:

- The UI talks only to IndexedDB and a configurable HTTP API base URL.
- All pages are static client-rendered routes; there are no Next.js server
  actions or request-time data dependencies.
- The sync engine is plain TypeScript and does not depend on browser-only
  routing.
- `NEXT_PUBLIC_API_URL` can point at a hosted FastAPI instance or a local
  development server.

A future Capacitor wrapper would need to choose between bundling a static export
and using the web build, replace or disable the service worker in the native
shell, and add native network/background-sync plugins if sync should continue
while the app is backgrounded.
