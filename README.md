# Saving Jar

A warm, tactile savings companion for mobile and web. Saving Jar turns everyday goals into colorful, glass "jars" you fill with deposits — making financial progress feel physical, clear, and rewarding.

> **Note:** Saving Jar is a *progress tracker*. It records your savings goals and habits; it never moves or touches your real money.

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
- **OAuth authentication** — Manus OAuth with web (cookie) and native (secure-token) session flows.
- **Type-safe API** — end-to-end typed tRPC with `superjson` serialization.

---

## Tech stack

| Layer | Technology |
|---|---|
| App framework | [Expo](https://expo.dev) SDK 54 (React Native 0.81, React 19) |
| Routing | [Expo Router](https://docs.expo.dev/router/introduction/) v6 (file-based, typed routes) |
| Styling | [NativeWind](https://www.nativewind.dev/) v4 (Tailwind CSS 3) + custom design tokens |
| Animation | `react-native-reanimated`, `react-native-gesture-handler`, `expo-haptics` |
| Client state | React Context + `AsyncStorage` (savings), [TanStack Query](https://tanstack.com/query) (API) |
| API | [tRPC](https://trpc.io) v11 + [Express](https://expressjs.com) 4, `superjson` transformer |
| Database | [Drizzle ORM](https://orm.drizzle.team) + MySQL (`mysql2`), `drizzle-kit` |
| Auth | Manus OAuth + [jose](https://github.com/panva/jose) JWT (cookie / Bearer) |
| Validation | [Zod](https://zod.dev) v4 |
| Testing | [Vitest](https://vitest.dev) |
| Tooling | TypeScript, ESLint (Expo config), Prettier, `esbuild`, `tsx`, `concurrently` |
| Package manager | pnpm 9.12 |

---

## Architecture

The project is a **full-stack Expo monolith**: an Expo Router client and an Express + tRPC server in one repository, sharing types via `shared/` and `drizzle/`.

```
┌──────────────────────────────┐        ┌────────────────────────────────┐
│  Client (Expo Router)        │        │  Server (Express + tRPC)       │
│  app/  components/  lib/     │  HTTP  │  server/                        │
│  - Screens & navigation      │ ─────► │  - /api/trpc (tRPC)            │
│  - Savings domain + store    │        │  - /api/oauth/* (auth)         │
│  - Theme provider            │  tRPC  │  - /api/auth/*  (session)      │
│  - tRPC React client         │        │  - Drizzle (MySQL)             │
└──────────────────────────────┘        └────────────────────────────────┘
           │ AsyncStorage (local)                      │
           └───────────────────────────────────────────┘
```

Key decisions:

- **Domain logic is pure and isolated** in `lib/savings-core.ts` (money math, milestones, streaks, recurring schedule). This layer has no React or I/O, which keeps it fully unit-testable.
- **The React store** (`lib/savings-store.tsx`) is a thin context wrapper around the pure domain layer, persisting to `AsyncStorage`.
- **Savings data is device-local** by design (see `design.md` — cross-device sync was not requested). The backend currently provides authentication and system plumbing from the app template; savings data is not stored in MySQL.
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
│   │   └── callback.tsx        # OAuth callback route
│   └── dev/
│       └── theme-lab.tsx       # Theme development playground
├── components/                 # Reusable UI
│   ├── jar-vessel.tsx          # Animated glass-jar visualization
│   ├── screen-container.tsx    # Safe-area aware screen wrapper
│   ├── themed-view.tsx         # Theme-aware View
│   └── ui/                     # Low-level primitives (icons, collapsible, …)
├── constants/                  # Public constants & re-exports (theme, oauth, shared)
├── drizzle/                    # Drizzle schema, migrations, and meta
│   └── schema.ts               # MySQL tables (users)
├── hooks/                      # use-auth, use-colors, use-color-scheme
├── lib/                        # Client domain + infrastructure
│   ├── savings-core.ts         # PURE domain logic (money, milestones, streaks, recurring)
│   ├── savings-store.tsx       # Context provider + AsyncStorage persistence
│   ├── theme-provider.tsx      # Light/dark/system theme provider
│   ├── trpc.ts                 # tRPC React client
│   ├── haptics.ts              # Cross-platform haptic helpers
│   ├── utils.ts                # cn() class merge helper
│   └── _core/                  # Auth, API client, theme plumbing, Manus runtime bridge
├── scripts/                    # load-env, QR generation, project reset
├── server/                     # Express + tRPC backend
│   ├── routers.ts              # Root tRPC router
│   ├── db.ts                   # Drizzle instance + user queries
│   ├── storage.ts              # Forge/S3 storage helpers
│   └── _core/                  # OAuth, SDK, context, cookies, system router, env
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

### Prerequisites

- **Node.js** 20+ (Expo SDK 54 requirement)
- **pnpm** 9.12 (`corepack enable` will pick up the version declared in `package.json`)
- **Expo Go** on a physical device, or an iOS/Android simulator, for native development
- **MySQL** (optional) — only required for the server-side user table / Drizzle commands

### 1. Install dependencies

```bash
pnpm install
```

### 2. Configure environment variables

Copy the example file and fill in the values:

```bash
cp .env.example .env
```

See [Environment variables](#environment-variables) for a full description.

### 3. Run the app

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

The app loads variables with **system environment taking priority over `.env`** (see `scripts/load-env.js`), so platform-injected values are never overridden by placeholders.

### Server (`server/_core/env.ts`)

| Variable | Required | Description |
|---|---|---|
| `VITE_APP_ID` | Yes | App/project ID; also used as the OAuth client ID. |
| `OAUTH_SERVER_URL` | Yes | Manus OAuth server base URL. |
| `JWT_SECRET` | Yes | Secret used to sign/verify session JWTs. |
| `OWNER_OPEN_ID` | Yes | Open ID of the project owner; granted the `admin` role. |
| `DATABASE_URL` | No | MySQL connection string (e.g. `mysql://user:pass@host:3306/db`). Required for Drizzle commands. |
| `BUILT_IN_FORGE_API_URL` | No | Forge API base URL for storage/upload features. |
| `BUILT_IN_FORGE_API_KEY` | No | Forge API key for storage/upload features. |
| `PORT` | No | API server port (defaults to `3000`; auto-increments if busy). |
| `NODE_ENV` | No | `development` / `production`. |

### Client (`EXPO_PUBLIC_*`)

| Variable | Required | Description |
|---|---|---|
| `EXPO_PUBLIC_APP_ID` | Yes | App ID for the OAuth login flow. |
| `EXPO_PUBLIC_OAUTH_PORTAL_URL` | Yes | OAuth portal URL used to build the login link. |
| `EXPO_PUBLIC_OAUTH_SERVER_URL` | Yes | OAuth server URL. |
| `EXPO_PUBLIC_OWNER_OPEN_ID` | Yes | Owner open ID. |
| `EXPO_PUBLIC_OWNER_NAME` | No | Owner display name. |
| `EXPO_PUBLIC_API_BASE_URL` | No | Override the API base URL. When unset, it is derived from the current hostname (Metro `8081` → API `3000`). |

> `scripts/load-env.js` automatically maps `VITE_APP_ID`, `VITE_OAUTH_PORTAL_URL`, `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, and `OWNER_NAME` to their `EXPO_PUBLIC_*` counterparts when those are not already set.

---

## Available scripts

| Command | Description |
|---|---|
| `pnpm dev` | Run API server (`tsx watch`) + Expo web (`metro`) concurrently. |
| `pnpm dev:server` | Run the Express/tRPC server in watch mode. |
| `pnpm dev:metro` | Start Expo for web on port 8081. |
| `pnpm android` / `pnpm ios` | Start Expo for the respective native platform. |
| `pnpm build` | Bundle the server to `dist/` with `esbuild`. |
| `pnpm start` | Run the bundled production server (`node dist/index.js`). |
| `pnpm check` | Type-check the whole project (`tsc --noEmit`). |
| `pnpm lint` | Run ESLint via Expo. |
| `pnpm format` | Format the codebase with Prettier. |
| `pnpm test` | Run the Vitest suite. |
| `pnpm db:push` | Generate and apply Drizzle migrations (`drizzle-kit generate && migrate`). |
| `pnpm qr` | Generate a QR code for the dev server. |
| `eas build` | Build with [EAS](https://docs.expo.dev/build/introduction/) using the profiles in `eas.json` (`development`, `preview` → Android APK, `production` with auto-increment). |

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
- `crossedMilestones(...)` records *every* level crossed by a single deposit, but skips levels already hit.
- Withdrawals never roll back milestones or streaks.

### Recurring deposits

- Cadences: `daily`, `weekly`, `biweekly`, `monthly`.
- `runDueRecurring(...)` deterministically applies missed occurrences and advances `nextDate` past "now", bounded to at most 366 occurrences per call.

### Persistence

`lib/savings-store.tsx` persists the jar list to `AsyncStorage` under `saving-jar:v3`, keeps a one-generation backup (`saving-jar:v3:backup`), and migrates legacy `v1`/`v2` stores (converting float dollars → minor units).

---

## API surface

### tRPC (client → server)

| Router / procedure | Type | Access | Description |
|---|---|---|---|
| `auth.me` | query | public | Returns the current authenticated user (or `null`). |
| `auth.logout` | mutation | public | Clears the session cookie. |
| `system.health` | query | public | Health check (`{ ok: true }`). |
| `system.notifyOwner` | mutation | admin | Sends an owner notification. |

> Add feature routers in `server/routers.ts`. `protectedProcedure` and `adminProcedure` are exported from `server/_core/trpc.ts`.

### REST (OAuth / auth)

| Method & path | Description |
|---|---|
| `GET /api/health` | Server health check. |
| `GET /api/oauth/callback` | Web OAuth callback; exchanges code, sets session cookie, redirects to the frontend. |
| `GET /api/oauth/mobile` | Native OAuth exchange; returns `{ app_session_id, user }`. |
| `GET /api/auth/me` | Current user (cookie or Bearer token). |
| `POST /api/auth/logout` | Clears the session cookie. |
| `POST /api/auth/session` | Establishes a session cookie from a Bearer token (used by the iframe preview). |

---

## Theming

Theme tokens are defined in `theme.config.js` and consumed by both NativeWind and the runtime theme provider (`lib/theme-provider.tsx`).

- Modes: **light**, **dark**, **system** (default is `system`).
- The chosen mode is persisted to `AsyncStorage` (`saving-jar:appearance`).
- Jar accent colors (coral, amber, mint, ocean, berry, clay) remain recognizable in both themes.

Design tokens (`theme.config.js`):

| Token | Light | Dark |
|---|---|---|
| `primary` | `#3B2D24` | `#9C6C53` |
| `background` | `#F6F1E8` | `#201B18` |
| `surface` | `#FFFDF9` | `#2D2722` |
| `foreground` | `#2C231D` | `#F6EDE2` |
| `muted` | `#7E7167` | `#C5B7AA` |
| `border` | `#E6DCD0` | `#4A4039` |
| `success` | `#4A9579` | `#7BC6A7` |
| `warning` | `#B88322` | `#E4BD61` |
| `error` | `#B5534D` | `#E98C85` |

---

## Testing & quality checks

The domain layer is the most heavily tested part of the codebase.

```bash
pnpm test     # Vitest
pnpm check    # tsc --noEmit
pnpm lint     # ESLint (Expo config)
pnpm format   # Prettier
```

Test coverage (`tests/`):

- `savings-core.test.ts` — money conversion, amount sanitization, milestones, deposits/withdrawals, habit streaks, recurring catch-up.
- `saving-jar.helpers.test.ts` — progress helpers, currency formatting, accent colors.
- `auth.logout.test.ts` — session-cookie clearing (currently `.skip`ped pending auth wiring).

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

- **Package name:** `package.json` still names the project `app-template` (cosmetic; the app itself is "Saving Jar" via `app.config.ts`).
- **Money math:** always integer minor units — never floats.
- **Paths:** `@/*` maps to the project root; `@shared/*` maps to `shared/`.
- **Native folders** (`ios/`, `android/`) are generated and git-ignored.
- **Sensitive data:** never commit `.env` files; use `.env.example` as the source of truth for required variables.
- **Auth (web):** uses cookies; **auth (native):** uses a Bearer token stored in `expo-secure-store`.

---

## License

Private / proprietary. No open-source license is provided in this repository.