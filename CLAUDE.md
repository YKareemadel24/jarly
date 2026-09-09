# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Saving Jar ("jarly") — a savings-goal tracker (progress tracker only; it never moves real money). Full-stack Expo monolith: Expo Router client + Express/tRPC server in one repo. Savings data is **device-local** (AsyncStorage); the server provides auth/system plumbing only — jar data is not stored in MySQL.

## Commands

Package manager is **pnpm** (9.12, pinned via `packageManager`). Never npm/yarn.

| Command | Purpose |
|---|---|
| `pnpm dev` | API server (`tsx watch`, port 3000) + Expo web (port 8081) concurrently |
| `pnpm dev:server` / `pnpm dev:metro` | Run the halves separately (native dev needs this + `pnpm android`/`pnpm ios`) |
| `pnpm test` | Vitest suite (node env). Single file: `pnpm test tests/savings-core.test.ts`. Filter by name: `pnpm test -t "streak"` |
| `pnpm check` | `tsc --noEmit` over the whole project |
| `pnpm lint` | ESLint (Expo config) |
| `pnpm format` | Prettier |
| `pnpm db:push` | `drizzle-kit generate && migrate` (needs `DATABASE_URL`) |
| `pnpm build` / `pnpm start` | esbuild server bundle to `dist/` / run it |
| `eas build` | Native builds; profiles in `eas.json` |

Env vars: copy `.env.example` → `.env`. System env wins over `.env` (`scripts/load-env.js` maps `VITE_*` → `EXPO_PUBLIC_*` automatically). Full var table is in README.md.

## Architecture

```
Client (app/, components/, hooks/, lib/)  ──tRPC──►  Server (server/, Express + tRPC v11)
         AsyncStorage (savings data)                    Drizzle + MySQL (users only)
                    shared/ + drizzle/  ◄── shared contracts ──►
```

**Directories ending in `_core` (`lib/_core`, `server/_core`, `shared/_core`, `drizzle/`) are template/infra plumbing** (Manus OAuth runtime, cookies, SDK, env). Don't put feature code there — feature tRPC routers go in `server/routers.ts`; `publicProcedure`/`protectedProcedure`/`adminProcedure` come from `server/_core/trpc.ts`.

Domain layering (the key rule):

- `lib/savings-core.ts` — **pure** domain logic: money math, milestones, streaks, recurring schedule. No React, no I/O. Anything unit-testable belongs here.
- `lib/savings-store.tsx` — thin context wrapper around the pure layer; persists to AsyncStorage (`saving-jar:v3`, one-generation backup, migrates legacy v1/v2 float stores → minor units).
- `lib/reminders.ts` (Home reminder card) and `lib/notifications.ts` (scheduled pings) are pure derivations that **mirror each other's guards by design** — every scheduled ping has a matching card; cards may appear without a ping.
- `lib/settings-store.tsx` — currency, biometric/PIN app lock, reminders toggle. PIN uses SecureStore on native, AsyncStorage on web.

tRPC flow: `server/routers.ts` defines `appRouter` → export `AppRouter` type → `lib/trpc.ts` consumes it with superjson. Auth: web = cookie session; native = Bearer token in `expo-secure-store`.

Routing: `app/` is Expo Router file routes. `(tabs)/` = Home / Activity / Insights / Profile; `jar/[id].tsx` = jar detail; `jar/new.tsx` = create.

## Hard invariants

- **Money is always integer minor units (cents).** Never floats for balances. Use `toMinor`/`fromMinor`/`money` from `lib/savings-core.ts`.
- **Withdrawals never roll back milestones or streaks.**
- `crossedMilestones` records every level crossed by one deposit but skips already-hit levels.
- `runDueRecurring` catch-up is deterministic and capped at 366 occurrences per call.
- Guard conditions in `reminders.ts` and `notifications.ts` must stay in sync — tests in `tests/` pin both.

## Conventions

- Path aliases: `@/*` → repo root, `@shared/*` → `shared/` (mapped in tsconfig, `vitest.config.ts`, and metro config).
- Styling: NativeWind v4 (Tailwind classes). Design tokens live in `theme.config.js` and feed both NativeWind and the runtime theme provider (`lib/theme-provider.tsx`). New colors need **both light and dark** tokens.
- Vitest runs in a **node** environment — `react-native`/`expo-notifications` imports in tests must be mocked (see `tests/notifications.test.ts` for the pattern).
- `ios/` and `android/` are generated and gitignored — never edit them.
- PRs target `master`; work happens on feature branches (e.g. `jarly-uiux-redesign`).
- Before finishing any change: `pnpm check` and `pnpm test` must pass. Domain changes in `lib/savings-core.ts` (or guard changes in `reminders.ts`/`notifications.ts`) land together with tests in `tests/`.

## Multiple agents work this repo

If you change commands, env vars, or architecture, update this file and `README.md` in the same change. Keep diffs minimal and scoped — another agent may be working in parallel.
