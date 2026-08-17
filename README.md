# Wayfarer

Wayfarer is a hotel property management system (PMS): front desk operations,
reservations, guest folios, housekeeping, maintenance, rate management, and
night audit for an independent hotel or small multi-property group. The full
product vision and intended feature set are documented in
[`docs/product-spec.md`](docs/product-spec.md).

## Current state

- The database schema (`packages/db`), API contracts (`packages/api-spec`),
  and generated client/validation packages model the core PMS domain:
  properties, guests, room types, rate plans, rooms, reservations, folios,
  housekeeping, maintenance, rate calendar, and night audit runs.
- The API server (`apps/server`) is wired directly to Postgres via Drizzle —
  no in-memory or mock data. Booking is transaction-safe under concurrent
  requests (a Postgres advisory lock serializes booking attempts per room
  type so two simultaneous requests can't oversell the last room).
  Checkout automatically creates a housekeeping task; the night audit posts
  real nightly charges, flags no-shows, and advances the property's business
  date. Run `pnpm --filter @workspace/db run seed` for a starter dataset.
- The web app (`apps/web`) has all core screens built and wired to the real
  API through generated React Query hooks: front desk dashboard, reservation
  book, reservation detail (check-in/out, folio, room assignment), a
  housekeeping board, maintenance work orders, a rate calendar, night audit,
  reports, and a public booking page.

Not yet built: staff authentication/authorization, payment processing,
guest-facing email/SMS, and multi-property support — see
`docs/product-spec.md` for the full target feature set.

## Run & operate

Requires Node.js 22+, [pnpm](https://pnpm.io), and a PostgreSQL database.

```bash
pnpm install

# One-time: create the schema and seed starter data
DATABASE_URL="postgres://user:pass@localhost:5432/wayfarer" pnpm --filter @workspace/db run push
DATABASE_URL="postgres://user:pass@localhost:5432/wayfarer" pnpm --filter @workspace/db run seed

# API server — http://localhost:5000
DATABASE_URL="postgres://user:pass@localhost:5432/wayfarer" pnpm --filter @workspace/server run dev

# Web app — http://localhost:5173 (proxies /api to the server above)
pnpm --filter @workspace/web run dev
```

Other useful commands:

| Command | Purpose |
|---|---|
| `pnpm run typecheck` | Typecheck every package in the workspace |
| `pnpm run build` | Typecheck, then build every package |
| `pnpm --filter @workspace/api-spec run codegen` | Regenerate `packages/api-client-react` and `packages/api-zod` from `packages/api-spec/openapi.yaml` |
| `pnpm --filter @workspace/db run push` | Push the Drizzle schema straight to the database (dev only, no migration files) |
| `pnpm --filter @workspace/db run seed` | Seed a demo property, rooms, guests, and reservations |

**Required environment variables**

| Variable | Used by | Purpose |
|---|---|---|
| `DATABASE_URL` | `apps/server`, `packages/db` | PostgreSQL connection string |
| `PORT` | `apps/web`, `apps/server` | Port to listen on (web defaults to `5173`, server has no default) |
| `BASE_PATH` | `apps/web` | Base path for the built app (defaults to `/`) |
| `API_PROXY_TARGET` | `apps/web` (dev only) | Where `vite dev` proxies `/api` requests (defaults to `http://localhost:5000`) |

## Deploying to Vercel

This repo is set up to deploy as a single Vercel project: the web app builds
to static output, and the API runs as a Vercel serverless function at
`/api/*` (see `api/[...path].ts`, which re-exports the same Express app used
for local dev — no separate backend host needed).

1. Push this repo to GitHub and import it in Vercel. `vercel.json` at the
   repo root already sets the build/output/install commands — no dashboard
   configuration required.
2. In the Vercel project's environment variables, set `DATABASE_URL` to a
   Postgres connection string reachable from Vercel's serverless functions.
   Use a provider built for serverless (e.g. [Neon](https://neon.tech) or
   Supabase) with its **pooled** connection string — a large number of
   concurrent, short-lived function invocations can otherwise exhaust a
   traditional Postgres connection limit quickly. `DATABASE_POOL_MAX`
   (default `5`) caps how many connections each function instance opens.
3. Before or after the first deploy, run the schema push and seed against
   that same database from your machine:
   ```bash
   DATABASE_URL="<your Vercel Postgres URL>" pnpm --filter @workspace/db run push
   DATABASE_URL="<your Vercel Postgres URL>" pnpm --filter @workspace/db run seed
   ```
4. Redeploy (or trigger a new deployment) once the schema exists.

For a traditional always-on host instead (Railway, Render, Fly, plain
Node), run `apps/server` directly — see the `Run & operate` section above.
The `api/` directory is Vercel-specific and unused elsewhere.

## Stack

- **Monorepo:** pnpm workspaces, TypeScript 5.9
- **Web:** React 19, Vite, Tailwind CSS v4, shadcn/ui (Radix primitives), wouter, TanStack Query
- **API:** Express 5, Node.js, pino logging
- **Database:** PostgreSQL, Drizzle ORM
- **Contracts:** OpenAPI spec (`packages/api-spec`) → Orval codegen → typed React Query hooks (`packages/api-client-react`) and Zod validators (`packages/api-zod`)
- **Build:** esbuild (server), Vite (web)

## Repository layout

```
api/
  [...path].ts    Vercel serverless entry point (re-exports apps/server's Express app)
vercel.json       Vercel build config for this monorepo
apps/
  web/            React frontend (Vite)
    src/pages/       One file per route
    src/components/  Shared UI: app shell, shadcn/ui primitives, reservation form
    src/lib/          Formatters, constants
  server/         Express API server
    src/routes/       Thin HTTP handlers (validation + status codes)
    src/services/     hotel-service.ts — all business logic and Drizzle queries
packages/
  db/             Drizzle schema + Postgres client — source of truth for the data model
  api-spec/       OpenAPI spec + Orval codegen config — source of truth for the API contract
  api-zod/        Generated Zod validators (do not hand-edit `src/generated`)
  api-client-react/  Generated React Query hooks (do not hand-edit `src/generated`)
scripts/
  push-db-schema.sh  Convenience script to install deps and push the DB schema
docs/
  product-spec.md    Full product specification (target feature set, tech choices, roles)
```

## Architecture notes

- **Contract-first API.** The OpenAPI spec in `packages/api-spec` is the
  source of truth for both the server's validation (`packages/api-zod`) and
  the frontend's data-fetching hooks (`packages/api-client-react`). Change
  the spec and re-run codegen rather than hand-editing generated files.
- **Demo data today, real persistence next.** The API currently reads and
  writes an in-memory dataset seeded on server start, so nothing persists
  across restarts. `packages/db` already has the relational schema this data
  should live in; the next step is swapping the in-memory arrays in
  `apps/server/src/routes/hotel.ts` for real queries against it, with staff
  authentication and payment/email integrations to follow.
