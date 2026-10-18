# Sahmi | سهمي

An Arabic RTL investing-learning game for Kuwait beginners, using fake KD and supplied real historical prices.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — Express API (managed workflow).
- `pnpm --filter @workspace/sahmi run dev` — React/Vite client (managed workflow).
- `pnpm --filter @workspace/api-spec run codegen` — regenerate hooks and validation schemas after API contract changes.
- `pnpm --filter @workspace/api-server run validate:prices` — validate the supplied CSV files without connecting to MongoDB.
- `pnpm --filter @workspace/api-server run seed:scenario` — import the approved scenario once into MongoDB; identical reruns make no changes and changed source files require explicit confirmation.
- `pnpm run typecheck` — full workspace TypeScript checks.
- Required server-only secret: `MONGODB_URI`. Never print it or put it in source files.
- Use the existing managed workflows to start/restart services, not ad-hoc dev servers.

## Stack & layout

- Client: React + Vite + TypeScript, under `artifacts/sahmi/`.
- Server: exportable Express app, under `artifacts/api-server/src/app.ts`.
- Data: MongoDB Atlas with Mongoose, database `sahmi`; the shared connection helper is `artifacts/api-server/src/lib/mongo.ts`.
- Model: `artifacts/api-server/src/models/Scenario.ts`.
- Scenario API: `GET /api/scenarios/sahmi-2020`; contract in `lib/api-spec/openapi.yaml`.
- Scenario import: `artifacts/api-server/src/lib/scenario-import.ts` and `src/scripts/import-scenario.ts`.
- Template PostgreSQL/Drizzle libraries are not used by Sahmi. Do not push a PostgreSQL schema or replace MongoDB.
- No deployment configuration yet. The intended later target is Vercel; preserve the exported app and reused MongoDB connection.

## Product boundaries

- Audience: beginners aged 18–25 in Kuwait. All app-facing text is simple Kuwaiti Arabic, with RTL layout.
- Fahad is 22, a new graduate with 1,000 fake KD, aiming to buy a car in two years.
- One approximately 12-month historical scenario, exactly three decisions: initial allocation; response to a drop; funding a fictional surprise 300 KD expense.
- Score diversification, calm, and cash readiness, never profit. Prewritten explanations live in the scenario document.
- Educational only, not investment advice. No real-money activity.
- Do not add login, saved progress, AI explanations, quizzes, friends, live prices, Shariah mode, payments, or other future features.
- Build in small runnable stages. The first stage is scenario loading from MongoDB through the API into the UI; gameplay and visual polish come later.

## Historical data rules

- Use only the three user-supplied CSV files in `attached_assets/`, covering 2020-01 through 2021-01: 13 monthly observations, 12 steps.
- SPY is the stock-fund proxy, AGG the bond-fund proxy, GLD the gold proxy. Use `adjusted_close` for calculations; retain `close` for provenance only.
- Source: the Digrin monthly price-history pages for each symbol, retrieved 2026-10-18, as reported by the user. This is one publisher; SPY and GLD were not cross-checked against a second publisher.
- Cash stays flat at nominal 1 with no interest; this is an explicit game assumption, not an imported historical quote.
- Apply monthly price ratios to fake KD. USD unit prices must not be labeled KD. Currency fluctuations are not simulated and must be disclosed.
- Store prices, events, explanations, source URLs, raw imported rows, and file hashes in MongoDB. The API must read MongoDB; no hardcoded frontend or server fallback scenario.
- If a value looks wrong or data is unavailable, stop and ask. Never invent, estimate, interpolate, or silently replace prices.

## Quality & security

- Read this file before each work step. Keep secrets server-only in environment variables; `.env*` is ignored.
- Reuse one MongoDB connection helper. Validate API input and output; use correct HTTP status codes and handle errors without exposing credentials.
- Use mobile-first responsive design, loading/error/empty states, and small focused changes without rewriting working parts.
- Explain each completed stage in 2–3 short beginner-friendly sentences, including how to try it.
