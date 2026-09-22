# Saving Jar

A warm, tactile savings companion for mobile and web. Saving Jar turns everyday goals into colorful, glass "jars" you fill with deposits — making financial progress feel physical, clear, and rewarding.

> **Note:** Saving Jar is a _progress tracker_. It records your savings goals and habits; it never moves or touches your real money.

![Expo SDK 54](https://img.shields.io/badge/Expo_SDK-54-4630EB?logo=expo)
![React Native 0.81](https://img.shields.io/badge/React_Native-0.81-61DAFB)
![React 19](https://img.shields.io/badge/React-19-61DAFB)
![TypeScript 5.9](https://img.shields.io/badge/TypeScript-5.9-3178C6)
![tRPC 11](https://img.shields.io/badge/tRPC-11-2596BE)
![pnpm 9.12](https://img.shields.io/badge/pnpm-9.12-F69220)

---

## Table of contents

- [What is Saving Jar?](#what-is-saving-jar)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Environment variables](#environment-variables)
- [Available scripts](#available-scripts)
- [Domain & data model](#domain--data-model)
- [API surface](#api-surface)
- [Theming](#theming)
- [Testing & quality checks](#testing--quality-checks)
- [Design documentation](#design-documentation)
- [Roadmap](#roadmap)
- [Conventions & notes](#conventions--notes)
- [License](#license)

---

## What is Saving Jar?

Saving Jar helps you set a savings goal (a "jar"), watch it fill as you add money, and stay consistent with optional recurring deposits and habit streaks. Each jar pairs an explicit saved amount, target amount, and percentage with a physical, animated jar visualization so progress always remains unambiguous.

The primary loop is intentionally short:

1. Open the **Home** dashboard.
2. Open a jar (or tap **Add money**).
3. Add a contribution and immediately see the jar fill.
4. Return to the dashboard with confidence.

---

## Features

- **Goal jars** — one-time goals with a target, optional deadline, emoji, and semantic accent color.
- **Habit jars** — repeatable savings with calendar-day streaks.
- **Deposits & withdrawals** — record contributions and take money back out (withdrawals never undo milestones or streaks). The deposit sheet previews the balance → new-balance transition and resulting percentage before confirming.
- **Quick deposit** — every jar card on Home exposes a `+ Add` chip that opens its deposit sheet directly (long-press also works).
- **Recurring saving** — schedule automatic deposits on a daily, weekly, biweekly, or monthly cadence, with deterministic catch-up of missed occurrences.
- **Milestones** — progress is tracked at 25/50/75/100%, with a celebratory overlay when a level is crossed.
- **Insights dashboard** — total saved, active/completed jars, best streak, deposit count, and closest-to-goal view.
- **Local-first persistence** — data is stored on-device with `AsyncStorage`, one-generation backup, and automatic migration from legacy formats.
- **Light / dark / system theming** — a white-first modern palette with warm, complete dark-mode tokens, persisted per user.
- **Tactile feedback** — haptics on success/error and confirmation for destructive actions.
- **Accessibility** — descriptive labels, explicit numeric progress, and large touch targets.
- **Account sign-in** — Supabase Auth (email + password). Only jars you _share_ need an account; personal jars never do.
- **Type-safe API** — end-to-end typed tRPC with `superjson` serialization.

---

## Tech stack

| Layer           | Technology                                                                                                                                       |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| App framework   | [Expo](https://expo.dev) SDK 54 (React Native 0.81, React 19)                                                                                    |
| Routing         | [Expo Router](https://docs.expo.dev/router/introduction/) v6 (file-based, typed routes)                                                          |
| Styling         | [NativeWind](https://www.nativewind.dev/) v4 (Tailwind CSS 3) + custom design tokens                                                             |
| Animation       | `react-native-reanimated`, `react-native-gesture-handler`, `expo-haptics`                                                                        |
| Client state    | React Context + `AsyncStorage` (savings), [TanStack Query](https://tanstack.com/query) (API)                                                     |
| API             | [tRPC](https://trpc.io) v11 + [Express](https://expressjs.com) 4, `superjson` transformer                                                        |
| Database        | [Supabase](https://supabase.com) Postgres via [Drizzle ORM](https://orm.drizzle.team) (`postgres-js`), `drizzle-kit`                             |
| Auth            | [Supabase Auth](https://supabase.com/docs/guides/auth), verified server-side with [jose](https://github.com/panva/jose) against the project JWKS |
| Validation      | [Zod](https://zod.dev) v4                                                                                                                        |
| Testing         | [Vitest](https://vitest.dev)                                                                                                                     |
| Tooling         | TypeScript, ESLint (Expo config), Prettier, `esbuild`, `tsx`, `concurrently`                                                                     |
| Package manager | pnpm 9.12                                                                                                                                        |

---

## Architecture

The project is a **full-stack Expo monolith**: an Expo Router client and an Express + tRPC server in one repository, sharing types via `shared/` and `drizzle/`.

```
┌──────────────────────────────┐        ┌────────────────────────────────┐
│  Client (Expo Router)        │        │  Server (Express + tRPC)       │
│  app/  components/  lib/     │  HTTP  │  server/                        │
│  - Screens & navigation      │ ─────► │  - /api/trpc (tRPC)            │
│  - Savings domain + store    │        │  - /api/health                 │
│  - Supabase session          │  tRPC  │  - verifies Supabase JWTs      │
│  - tRPC React client         │        │  - Drizzle (Supabase Postgres) │
└──────────────────────────────┘        └────────────────────────────────┘
           │ AsyncStorage (local)                      │
           └───────────────────────────────────────────┘
```

Key decisions:

- **Domain logic is pure and isolated** in `lib/savings-core.ts` (money math, milestones, streaks, recurring schedule). This layer has no React or I/O, which keeps it fully unit-testable.
- **The React store** (`lib/savings-store.tsx`) is a thin context wrapper around the pure domain layer, persisting to `AsyncStorage`.
- **Savings data is device-local by default.** Personal jars live only in `AsyncStorage`. A jar reaches Postgres only when its owner explicitly shares it, and those jars stay server-authoritative so two members can never disagree about the balance.
- **Shared contracts** live in `shared/` and are imported by both client and server to avoid drift.
- **Money is always integer minor units** (cents). Floats are never used for balances; see [Domain & data model](#domain--data-model).

---

## Project structure

```
jarly/
├── app/                        # Expo Router file-based routes
│   ├── _layout.tsx             # Root layout: providers, theme, tRPC, navigation stack
│   ├── (tabs)/                 # Bottom-tab shell
│   │   ├── _layout.tsx         # Home / Insights / Profile tab bar
│   │   ├── index.tsx           # Home dashboard
│   │   ├── stats.tsx           # Insights screen
│   │   └── profile.tsx         # Appearance & preferences
│   ├── jar/
│   │   ├── new.tsx             # Create-goal screen (with live preview)
│   │   └── [id].tsx            # Jar detail: deposit/withdraw/recurring/edit/archive
│   ├── oauth/
│   │   └── callback.tsx        # Where a sign-in link or provider redirect lands
│   ├── login.tsx               # Email + password sign-in / sign-up
│   └── dev/
│       └── theme-lab.tsx       # Theme development playground
├── components/                 # Reusable UI
│   ├── jar-vessel.tsx          # Animated glass-jar visualization
│   ├── screen-container.tsx    # Safe-area aware screen wrapper
│   ├── themed-view.tsx         # Theme-aware View
│   └── ui/                     # Low-level primitives (icons, collapsible, …)
├── constants/                  # Public constants (theme, API config, Supabase keys)
├── drizzle/                    # Drizzle schema, migrations, and meta
│   └── schema.ts               # Postgres tables (users, shared jars, invites)
├── hooks/                      # use-auth, use-colors, use-color-scheme
├── lib/                        # Client domain + infrastructure
│   ├── savings-core.ts         # PURE domain logic (money, milestones, streaks, recurring)
│   ├── savings-store.tsx       # Context provider + AsyncStorage persistence
│   ├── supabase.ts             # The one Supabase client (session storage, PKCE)
│   ├── theme-provider.tsx      # Light/dark/system theme provider
│   ├── trpc.ts                 # tRPC React client
│   ├── haptics.ts              # Cross-platform haptic helpers
│   ├── utils.ts                # cn() class merge helper
│   └── _core/                  # Session access + theme plumbing
├── scripts/                    # load-env, QR generation, project reset
├── server/                     # Express + tRPC backend
│   ├── routers.ts              # Root tRPC router
│   ├── db.ts                   # Drizzle instance + user queries
│   ├── sharedJarRouter.ts      # Shared-jar + invite tRPC router
│   ├── shared-jars-db.ts       # Shared-jar repository (membership-scoped queries)
│   └── _core/                  # Supabase token verification, context, system router, env
├── shared/                     # Types & constants shared by client and server
├── tests/                      # Vitest unit tests
├── assets/                     # App icons, splash, and images
├── app.config.ts               # Expo app configuration
├── eas.json                    # EAS Build profiles (development / preview / production)
├── drizzle.config.ts           # Drizzle Kit configuration
├── tailwind.config.js          # Tailwind/NativeWind theme mapping
├── theme.config.js             # Design tokens (light/dark color swatches)
├── package.json
└── pnpm-lock.yaml
```

---

## Getting started

### 1. Create a Supabase project

1. Create a project at [supabase.com](https://supabase.com) (the free tier is enough).
2. Copy **Project URL** and the **publishable key** from _Project Settings → API Keys_.
3. Copy the **Shared Pooler** connection string from _Connect_, and replace the
   password placeholder with your database password.
4. Apply the schema:

   ```bash
   pnpm db:push
   ```

   This runs `drizzle-kit generate && drizzle-kit migrate` against `DATABASE_URL`.
   The generated migration also lives in `drizzle/` if you would rather paste it
   into the dashboard's SQL editor.

5. Under _Authentication → Sign In / Providers → Email_, decide whether to require
   email confirmation. With it **on**, sign-up returns no session and the person
   must open the emailed link before signing in — the app says so rather than
   appearing to do nothing. For local development, turning it **off** is simpler.

> Sign-in only matters for shared jars. Skip all of this and the app still runs:
> personal jars, transfers and theming have no backend dependency at all.

### 2. Install dependencies

**Node.js 20+** and **pnpm 9.12** (`corepack enable` picks up the version declared in `package.json`) are required. **Expo Go** on a device, or a simulator, for native development.

```bash
pnpm install
```

### 3. Configure environment variables

Copy the example file and fill in the values:

```bash
cp .env.example .env
```

See [Environment variables](#environment-variables) for a full description.

### 4. Run the app

Start the API server and Expo web preview together:

```bash
pnpm dev
```

- **Expo web** → http://localhost:8081
- **API server** → http://localhost:3000 (health check at `/api/health`)

For **native (iOS/Android)**, run the server and Metro in separate terminals:

```bash
# Terminal 1 — API server
pnpm dev:server

# Terminal 2 — start Expo for your platform
pnpm android   # or: pnpm ios
```

---

## Environment variables

The app loads variables with **system environment taking priority over `.env`** (see `scripts/load-env.js`).

Everything accounts and shared jars need comes from a single Supabase project. Keys live under **Project Settings → API Keys**; the connection string under **Connect → Shared Pooler**.

### Server (`server/_core/env.ts`)

| Variable                   | Required | Description                                                                                                                                                 |
| -------------------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `SUPABASE_URL`             | Yes      | Project URL, e.g. `https://abcdefgh.supabase.co`. The token issuer and JWKS endpoint are derived from it.                                                   |
| `DATABASE_URL`             | Yes      | Postgres connection string. Use the **Shared Pooler** URI — the direct connection is IPv6-only unless the project has the IPv4 add-on.                      |
| `SUPABASE_PUBLISHABLE_KEY` | No       | `sb_publishable_…`; only needed server-side if the server itself calls Supabase.                                                                            |
| `SUPABASE_SECRET_KEY`      | No       | `sb_secret_…`. Server-only; bypasses RLS, so it must never be given an `EXPO_PUBLIC_` name.                                                                 |
| `SUPABASE_JWKS_URL`        | No       | Override the derived JWKS endpoint (self-hosted project or custom auth domain).                                                                             |
| `OWNER_EMAIL`              | No       | Address granted the `admin` role.                                                                                                                           |
| `ALLOWED_ORIGINS`          | No       | Comma-separated extra CORS origins for the API (e.g. the deployed web build). Loopback dev origins are always allowed; native apps send no `Origin` header. |
| `PORT`                     | No       | API server port (defaults to `3000`; auto-increments if busy).                                                                                              |
| `NODE_ENV`                 | No       | `development` / `production`.                                                                                                                               |

### Client (`EXPO_PUBLIC_*`)

`EXPO_PUBLIC_*` values are inlined into the app bundle, so **never put a secret key in one** — anything here is public by definition.

| Variable                               | Required          | Description                                                                                                                                                                     |
| -------------------------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `EXPO_PUBLIC_SUPABASE_URL`             | For accounts      | Project URL. Without it the app runs local-only and the sign-in screen says so.                                                                                                 |
| `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | For accounts      | `sb_publishable_…`. Safe to ship: it can only reach what row level security allows.                                                                                             |
| `EXPO_PUBLIC_API_BASE_URL`             | Production native | Override the API base URL. When unset, it is derived from the current hostname (Metro `8081` → API `3000`) — which only works on web/dev, so release native builds must set it. |
| `EXPO_PUBLIC_APP_URL`                  | No                | Public origin an invite link should point at, so it opens for someone who does not have the app. Defaults to the API origin.                                                    |

> `scripts/load-env.js` maps `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` onto their `EXPO_PUBLIC_*` counterparts when those are not already set, so a project only has to be configured once.

---

## Available scripts

| Command                     | Description                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                  | Run API server (`tsx watch`) + Expo web (`metro`) concurrently.                                                                                                          |
| `pnpm dev:server`           | Run the Express/tRPC server in watch mode.                                                                                                                               |
| `pnpm dev:metro`            | Start Expo for web on port 8081.                                                                                                                                         |
| `pnpm android` / `pnpm ios` | Start Expo for the respective native platform.                                                                                                                           |
| `pnpm build`                | Bundle the server to `dist/` with `esbuild`.                                                                                                                             |
| `pnpm start`                | Run the bundled production server (`node dist/index.js`).                                                                                                                |
| `pnpm check`                | Type-check the whole project (`tsc --noEmit`).                                                                                                                           |
| `pnpm lint`                 | Run ESLint via Expo.                                                                                                                                                     |
| `pnpm format`               | Format the codebase with Prettier.                                                                                                                                       |
| `pnpm test`                 | Run the Vitest suite.                                                                                                                                                    |
| `pnpm db:push`              | Generate and apply Drizzle migrations (`drizzle-kit generate && migrate`).                                                                                               |
| `pnpm qr`                   | Generate a QR code for the dev server.                                                                                                                                   |
| `eas build`                 | Build with [EAS](https://docs.expo.dev/build/introduction/) using the profiles in `eas.json` (`development`, `preview` → Android APK, `production` with auto-increment). |

---

## Domain & data model

The savings domain lives in `lib/savings-core.ts` and is deliberately pure and framework-agnostic.

### Money

- All monetary values are **integer minor units** (cents).
- `toMinor(25.5)` → `2550`; `fromMinor(2550)` → `25.5`.
- `money(minor)` formats using `Intl.NumberFormat` (currently **USD**).

### Jar

A `Jar` has a `target`, `balance`, `accent` color, `icon`, `kind`, and optional `deadline`, `streak`, `recurring` rule, and an `entries[]` transaction log.

- `kind: "goal"` — a one-time goal.
- `kind: "habit"` — a repeatable habit with a calendar-day streak.

### Milestones

- Levels: **25, 50, 75, 100%**.
- `crossedMilestones(...)` records _every_ level crossed by a single deposit, but skips levels already hit.
- Withdrawals never roll back milestones or streaks.

### Recurring deposits

- Cadences: `daily`, `weekly`, `biweekly`, `monthly`.
- `runDueRecurring(...)` deterministically applies missed occurrences and advances `nextDate` past "now", bounded to at most 366 occurrences per call.

### Persistence

`lib/savings-store.tsx` persists the jar list to `AsyncStorage` under `saving-jar:v3`, keeps a one-generation backup (`saving-jar:v3:backup`), and migrates legacy `v1`/`v2` stores (converting float dollars → minor units).

---

## API surface

### tRPC (client → server)

| Router / procedure   | Type     | Access | Description                                                          |
| -------------------- | -------- | ------ | -------------------------------------------------------------------- |
| `auth.me`            | query    | public | Returns the account behind the request's Supabase token (or `null`). |
| `system.health`      | query    | public | Health check (`{ ok: true }`).                                       |
| `system.notifyOwner` | mutation | admin  | Sends an owner notification.                                         |

> Add feature routers in `server/routers.ts`. `protectedProcedure` and `adminProcedure` are exported from `server/_core/trpc.ts`.

### REST

| Method & path     | Description          |
| ----------------- | -------------------- |
| `GET /api/health` | Server health check. |

> There are no auth endpoints any more. Supabase Auth issues and refreshes the
> session entirely on the client, and the resulting access token is attached as a
> Bearer header to every tRPC call, where `server/_core/supabase-auth.ts` verifies
> it against the project JWKS.

---

## Theming

Theme tokens are defined in `theme.config.js` and consumed by both NativeWind and the runtime theme provider (`lib/theme-provider.tsx`).

- Modes: **light**, **dark**, **system** (default is `system`).
- The chosen mode is persisted to `AsyncStorage` (`saving-jar:appearance`).
- Jar accent colors (coral, amber, mint, ocean, berry, clay) remain recognizable in both themes.

Design tokens (`theme.config.js`):

| Token        | Light     | Dark      |
| ------------ | --------- | --------- |
| `primary`    | `#3B2D24` | `#9C6C53` |
| `background` | `#F6F1E8` | `#201B18` |
| `surface`    | `#FFFDF9` | `#2D2722` |
| `foreground` | `#2C231D` | `#F6EDE2` |
| `muted`      | `#7E7167` | `#C5B7AA` |
| `border`     | `#E6DCD0` | `#4A4039` |
| `success`    | `#4A9579` | `#7BC6A7` |
| `warning`    | `#B88322` | `#E4BD61` |
| `error`      | `#B5534D` | `#E98C85` |

---

## Testing & quality checks

The domain layer is the most heavily tested part of the codebase.

```bash
pnpm test     # Vitest
pnpm check    # tsc --noEmit
pnpm lint     # ESLint (Expo config)
pnpm format   # Prettier
```

All three checks (typecheck, lint, tests) also run on every push and pull request via GitHub Actions (`.github/workflows/ci.yml`).

Test coverage (`tests/`):

- `savings-core.test.ts` — money conversion, amount sanitization, milestones, deposits/withdrawals, habit streaks, recurring catch-up.
- `saving-jar.helpers.test.ts` — progress helpers, currency formatting, accent colors.
- `badges.test.ts`, `quick-presets.test.ts` — badge thresholds and deposit presets.
- `shared-jar.test.ts` — shared-jar aggregation, entry ordering, contribution validation, invite status.
- `shared-jars-map.test.ts` — projecting server payloads into the local `Jar` shape.
- `personal-share.test.ts` — shaping a local jar into a share request and swapping it for the shared one.
- `import-personal.test.ts` — the conversion endpoint end to end through a tRPC caller, with `getDb` stubbed.
- `shared-refresh.test.ts` — refresh ordering: cached data survives a network failure, is dropped on an auth rejection.
- `api-transport.test.ts` — turning a non-tRPC error page into a message worth reading.
- `api-base-url.test.ts` — deriving the API origin from the Metro origin.
- `notifications.test.ts`, `reminders.test.ts` — reminder scheduling and the permission gate.

---

## Design documentation

- [`design.md`](design.md) — mobile interface design plan: screen list, user flows, layout rules, visual components.
- [`reference-notes.md`](reference-notes.md) — the requested modern (white-first) UI direction.
- [`todo.md`](todo.md) — current project task list.

---

## Roadmap

See [`todo.md`](todo.md) for the working backlog. Notable open items:

- [ ] Save a publishable delivery checkpoint and hand over the project.
- [ ] Validate the visual overhaul and save a redesigned checkpoint.

---

## Conventions & notes

- **Money math:** always integer minor units — never floats.
- **Paths:** `@/*` maps to the project root; `@shared/*` maps to `shared/`.
- **Native folders** (`ios/`, `android/`) are generated and git-ignored.
- **Sensitive data:** never commit `.env` files; use `.env.example` as the source of truth for required variables.
- **Auth:** Supabase owns the session on the client (persisted in `AsyncStorage`). The API server verifies the access token against the project JWKS on every request, so there is no server-issued cookie and no session table.
- **Identity:** Supabase accounts are UUIDs, but app tables reference an integer `users.id`, linked by `users.supabaseUserId`. That is why the shared-jar code did not have to change when the auth provider did.
- **Postgres has no `ON UPDATE CURRENT_TIMESTAMP`**, so `updatedAt` is stamped by the application; and an error inside a transaction aborts the whole transaction, so duplicate-key cases use `ON CONFLICT DO NOTHING` rather than a caught exception.

---

## License

Private / proprietary. No open-source license is provided in this repository.
