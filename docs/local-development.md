# Local development

Install PostgreSQL and create an empty database owned by your local role:

```sh
createdb inspiration_canvas
corepack pnpm install
cp .env.example .env
```

Set `LOCAL_PERSISTENCE_ENABLED=true` in `.env`. The example URL is
`postgresql://localhost:5432/inspiration_canvas`; use your own role and connection
settings if different. The CLI scripts and Next both load `.env`.

```sh
corepack pnpm db:push
corepack pnpm dev
```

Open `http://127.0.0.1:3000`. Development and local start bind to loopback. The
local API also checks loopback Host and same-origin browser requests. This is
single-user storage on a trusted device, not a multi-user authentication system;
use Supabase Auth/Postgres/Storage for hosted ownership. Vercel cannot enable the
local path. Supabase configuration takes precedence over local opt-in.

The local database uses only `inspiration_canvas_local.*`, with native PostgreSQL
parameters, JSONB and timestamps. Initialization takes an advisory transaction
lock and commits schema version 1 atomically; failed initialization is retryable.
Unknown versions and existing unversioned tables in that namespace are refused.
It does not initialize or alter Supabase's `public` tables, roles or RLS. Connection
pool size and acquisition/query/lock timeouts are bounded. CLI scripts close the
pool before exiting; `db:seed` creates no sample media or provider requests.

Media use `.data/uploads` with `STORAGE_DRIVER=local`; metadata and comments use
PostgreSQL. Optional Vercel Blob uses the existing configured adapter. Keep upload
files and the database together when backing up this local installation.

With local opt-in off and no Supabase credentials, the UI retains its four-hour
temporary browser mode. Switching to local mode does not import, overwrite or
clear earlier temporary browser data. Switch back to temporary mode before its
expiry to access that workspace. A configured database failure is shown as an
error rather than being presented as a successful permanent save.

Earlier database files and public-schema installations are not converted or
deleted. This release removes the alternate local drivers; an existing data
installation needs its own explicit export/migration procedure. Never point a
cleanup script at an existing database. No backfill or automatic migration is
performed by this setup.

The tracked `.env.example` contains no credentials. Actual `.env` files remain
ignored. AI is off in the example; enabling it requires the operator's credentials.
The existing Supabase setup in README remains the hosted contract.

## Verification

The bounded temporary CI scope prepares the lockfile, preserves retained direct
dependency resolutions, runs authored unit and real PostgreSQL cases, scoped
lint/types, and two actual loopback Chromium journeys. It uses one disposable
PostgreSQL 17.6 service, owned files and no provider/model call. The workflow
template is `docs/proposals/postgres-checks.workflow.yml.example`; it is inactive
in normal source. Local install/build/database work remains stopped after the
Storage Guard preflight (19.3 GiB free; 34.0 GiB required).

The source brief is [Inspiration Canvas / All projects](https://app.notion.com/p/3b6a1ee8bd06803e99d1cf6b0218c207),
fetched this turn with returned edit timestamp 15 October 2026. It explicitly
requires local PostgreSQL and Supabase/Vercel readiness for the four named apps.
This change covers Canvas's local database path, not every app or the remaining
AI/Eve requirements. The implementation follows the primary
[node-postgres pooling](https://node-postgres.com/features/pooling) and
[transaction](https://node-postgres.com/features/transactions) contracts.

The first lock preparation exposed old optional `db0` bindings under Eve/Nitro.
The two version-scoped pnpm [dependency-removal overrides](https://pnpm.io/10.x/settings#overrides)
remove unused libSQL/Drizzle bindings without replacing Eve or editing vendor
code. The guard rejects resolved copies of those adapters and allows only the
reviewed database peer-context change; retained direct versions stay pinned.
Framework metadata may still advertise optional adapters. This does not claim
the full Eve runtime or all of its deployment requirements are completed.
