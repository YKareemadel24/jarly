# Saving Jar

A warm, tactile savings companion for mobile and web. Saving Jar turns everyday goals into colorful, glass "jars" you fill with deposits — making financial progress feel physical, clear, and rewarding.

> **Note:** Saving Jar is a _progress tracker_. It records your savings goals and habits; it never moves or touches your real money.

![Expo SDK 57](https://img.shields.io/badge/Expo_SDK-57-4630EB?logo=expo)
![React Native 0.86](https://img.shields.io/badge/React_Native-0.86-61DAFB)
![React 19.2](https://img.shields.io/badge/React-19.2-61DAFB)
![TypeScript 6.0](https://img.shields.io/badge/TypeScript-6.0-3178C6)
![pnpm 9.12](https://img.shields.io/badge/pnpm-9.12-F69220)

---

## Table of contents

- [What is Saving Jar?](#what-is-saving-jar)
- [Recent upgrades](#recent-upgrades)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Available scripts](#available-scripts)
- [Domain & data model](#domain--data-model)
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

## Recent upgrades

### Expo SDK 57 / React Native 0.86

- **Runtime jump** — Expo SDK 54 → 57, React Native 0.81 → 0.86, React 19.2, TypeScript 6.0, `react-native-reanimated` 4 with `react-native-worklets`, `expo-updates`, and `expo-dev-client` (a dev build is now required for native, since Expo Go no longer covers these versions).
- **Old architecture removed** — `newArchEnabled` and `edgeToEdgeEnabled` are dropped from `app.config.ts`; the new architecture and edge-to-edge are now the only options.
- **Style API modernisation** — legacy `shadowColor`/`shadowOffset`/`shadowRadius`/`elevation` props replaced by the single cross-platform `boxShadow` shorthand, and `StyleSheet.absoluteFillObject` replaced by `StyleSheet.absoluteFill`.
- **Web console noise gone** — `expo-notifications` is now imported lazily and never on web. A static import ran a push-token auto-registration side effect that warned on every web load; `lib/notifications.ts` awaits a memoised loader instead, and registers the notification handler once.
- **Stray style files moved** — `app/jar/jar-detail.styles.ts` and `app/(tabs)/home.styles.ts` moved to `components/`, so a component under `components/` no longer imports from a route folder (and Expo Router stops treating them as screens).
- **Typed system colour** — the theme provider narrows `useSystemColorScheme()` to `"light" | "dark"` instead of relying on a nullish fallback.
- **Lint** — `eslint.config.mjs` ignores `dist/**`, and the `react-hooks/purity` and `react-hooks/set-state-in-effect` rules (new in the Expo config) are turned off; the store and resync effects legitimately set state on mount.

### Earlier milestones

- Savings core split into focused modules under `lib/domain/` (`money`, `jar`, `schedule`, `insights`, `presets`, `badges`) with `lib/savings-core.ts` kept as the public entry point.
- App lock (biometric or PIN), currency selection, and reminders.

---

## Features

- **Goal jars** — one-time goals with a target, optional deadline, emoji, and semantic accent color.
- **Habit jars** — repeatable savings with calendar-day streaks.
- **Deposits & withdrawals** — record contributions and take money back out (withdrawals never undo milestones or streaks). The deposit sheet previews the balance → new-balance transition and resulting percentage before confirming.
- **Quick deposit** — every jar card on Home exposes a `+ Add` chip that opens its deposit sheet directly (long-press also works).
- **Recurring saving** — schedule automatic deposits on a daily, weekly, biweekly, or monthly cadence, with deterministic catch-up of missed occurrences.
- **Milestones** — progress is tracked at 25/50/75/100%, with a celebratory overlay when a level is crossed.
- **Insights dashboard** — total saved, active/completed jars, best streak, deposit count, and closest-to-goal view.
- **Activity feed** — a chronological log of every deposit and withdrawal across your jars.
- **Badges & nudges** — a badge catalogue driven by the pure domain layer, plus deadline countdowns and pace hints.
- **Device-to-device transfer** — move personal jars to a new phone over chained QR frames. No account, no server, no cable.
- **App lock** — optional biometric or PIN lock. The PIN is stored as a salted SHA-256 in `SecureStore`, with an escalating lockout after five failed attempts.
- **Reminders** — local notifications for recurring deposits (1 day ahead) and approaching deadlines (3 days ahead), resynced whenever the jar list changes.
- **Multi-currency display** — balances stay integer minor units; only the displayed symbol changes (USD, EUR, GBP, EGP, SAR, AED, JPY, INR, CAD, AUD).
- **Local-first persistence** — data is stored on-device with `AsyncStorage`, one-generation backup, and automatic migration from legacy formats.
- **Light / dark / system theming** — a white-first modern palette with warm, complete dark-mode tokens, persisted per user.
- **Tactile feedback** — haptics on success/error and confirmation for destructive actions.
- **Accessibility** — descriptive labels, explicit numeric progress, and large touch targets.

---

## Tech stack

| Layer           | Technology                                                                                                                          |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| App framework   | [Expo](https://expo.dev) SDK 57 (React Native 0.86, React 19.2)                                                                     |
| Routing         | [Expo Router](https://docs.expo.dev/router/introduction/) v7 (file-based, typed routes)                                             |
| Styling         | [NativeWind](https://www.nativewind.dev/) v4 (Tailwind CSS 3) + custom design tokens, plus `boxShadow` for cross-platform elevation |
| Animation       | `react-native-reanimated` 4 + `react-native-worklets`, `react-native-gesture-handler`, `expo-haptics`, `react-native-svg`           |
| Device features | `expo-local-authentication` + `expo-secure-store` (app lock), `expo-notifications` (reminders), `expo-updates`, `expo-dev-client`   |
| Client state    | React Context + `AsyncStorage` (savings, settings)                                                                                  |
| Testing         | [Vitest](https://vitest.dev)                                                                                                        |
| Tooling         | TypeScript 6, ESLint 9 (Expo flat config), Prettier 3                                                                               |
| Package manager | pnpm 9.12                                                                                                                           |

---

## Architecture

The project is a **local-first Expo app**: an Expo Router client with all data stored on-device in `AsyncStorage`.

```
┌──────────────────────────────┐
│  Client (Expo Router)        │
│  app/  components/  lib/     │
│  - Screens & navigation      │
│  - Savings domain + store    │
│  - AsyncStorage persistence  │
└──────────────────────────────┘
```

Key decisions:

- **Domain logic is pure and isolated** behind `lib/savings-core.ts`, which re-exports the focused modules in `lib/domain/` (`money`, `jar`, `schedule`, `insights`, `presets`, `badges`). This layer has no React or I/O, which keeps it fully unit-testable, and screens import only from the entry point so the split stays internal.
- **The React store** (`lib/savings-store.tsx`) is a thin context wrapper around the pure domain layer, persisting to `AsyncStorage`. Settings that are not jars (appearance, reminders, app lock, currency) live separately in `lib/settings-store.tsx`.
- **All savings data is device-local.** Jars live only in `AsyncStorage` — there is no server and no account system.
- **Money is always integer minor units** (cents). Floats are never used for balances; see [Domain & data model](#domain--data-model).

---

## Project structure

```
jarly/
├── app/                        # Expo Router file-based routes
│   ├── _layout.tsx             # Root layout: providers, theme, navigation stack
│   ├── (tabs)/                 # Bottom-tab shell
│   │   ├── _layout.tsx         # Home / Activity / Insights / Profile tab bar
│   │   ├── index.tsx           # Home dashboard
│   │   ├── activity.tsx        # Chronological deposit & withdrawal log
│   │   ├── stats.tsx           # Insights screen
│   │   └── profile.tsx         # Appearance, currency, reminders, app lock
│   ├── jar/
│   │   ├── new.tsx             # Create-goal screen (with live preview)
│   │   └── [id].tsx            # Jar detail: deposit/withdraw/recurring/edit/archive
│   ├── transfer/
│   │   ├── index.tsx           # Transfer hub
│   │   ├── send.tsx            # Render a snapshot as chained QR frames
│   │   └── receive.tsx         # Scan frames in any order and rebuild the jars
│   ├── dev/
│   │   └── theme-lab.tsx       # Theme development playground
├── components/                 # Reusable UI (styles live beside their components)
│   ├── home.styles.ts          # Home dashboard styles
│   ├── jar-detail.styles.ts    # Jar detail + every sheet that shares its look
│   ├── jar-vessel.tsx          # Animated glass-jar visualization
│   ├── lock-screen.tsx         # Biometric / PIN app lock
│   ├── qr-code.tsx             # QR rendering + scanning for transfers
│   ├── deposit-sheet.tsx       # Deposit / withdrawal sheet
│   ├── edit-jar-sheet.tsx      # Rename, retarget, restyle
│   ├── recurring-sheet.tsx     # Recurring cadence editor
│   ├── toast.tsx               # Transient messages with an optional action
│   ├── screen-container.tsx    # Safe-area aware screen wrapper
│   ├── themed-view.tsx         # Theme-aware View
│   ├── notification-resync.tsx # Reschedules reminders when the jar list changes
│   └── ui/                     # Low-level primitives (icons, collapsible, …)
├── constants/                  # Public constants (theme tokens)
├── docs/superpowers/           # Design specs and implementation plans
├── hooks/                      # use-colors, use-color-scheme, use-jar-accents
├── lib/                        # Client domain + infrastructure
│   ├── savings-core.ts         # Public entry point re-exporting lib/domain
│   ├── domain/                 # PURE modules: money, jar, schedule, insights, presets, badges
│   ├── savings-store.tsx       # Jar context provider + AsyncStorage persistence
│   ├── settings-store.tsx      # Appearance, currency, reminders, biometric/PIN lock
│   ├── notifications.ts        # Lazy expo-notifications wrapper + scheduling
│   ├── reminders.ts            # Which reminder, if any, is due
│   ├── theme-provider.tsx      # Light/dark/system theme provider
│   ├── store-error.ts          # Typed store error seam
│   ├── error-reporting.ts      # Client-side error capture
│   ├── haptics.ts              # Cross-platform haptic helpers
│   └── utils.ts                # cn() class merge helper
├── shared/                     # Pure, dependency-free codecs
│   └── transfer.ts             # QR frame codec for device-to-device transfer
├── scripts/                    # QR generation
├── tests/                      # Vitest unit tests
├── assets/                     # App icons, splash, and images
├── app.config.ts               # Expo app configuration
├── eas.json                    # EAS Build profiles (development / preview / production)
├── eslint.config.mjs           # ESLint flat config (Expo preset + project rules)
├── tailwind.config.js          # Tailwind/NativeWind theme mapping
├── theme.config.js             # Design tokens (light/dark color swatches)
├── package.json
└── pnpm-lock.yaml
```

---

## Getting started

### 1. Install dependencies

**Node.js 20+** and **pnpm 9.12** (`corepack enable` picks up the version declared in `package.json`) are required. **Expo Go** on a device, or a simulator, for native development.

```bash
pnpm install
```

### 2. Run the app

Start the Expo web preview:

```bash
pnpm dev
```

- **Expo web** → http://localhost:8081

For **native (iOS/Android)**:

```bash
pnpm android   # or: pnpm ios
```

> **Expo Go no longer covers SDK 57.** Native development needs a dev build
> (`expo-dev-client` is installed):
>
> ```bash
> pnpm exec expo run:android   # or run:ios — builds and installs the dev client
> ```
>
> The web preview at `localhost:8081` has no such requirement.

---

## Available scripts

| Command                     | Description                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `pnpm dev`                  | Start Expo for web on port 8081.                                                                                                                                         |
| `pnpm android` / `pnpm ios` | Start Expo for the respective native platform.                                                                                                                           |
| `pnpm check`                | Type-check the whole project (`tsc --noEmit`).                                                                                                                           |
| `pnpm lint`                 | Run ESLint via Expo.                                                                                                                                                     |
| `pnpm format`               | Format the codebase with Prettier.                                                                                                                                       |
| `pnpm format:check`         | Verify formatting without writing (this is the CI gate).                                                                                                                 |
| `pnpm test`                 | Run the Vitest suite.                                                                                                                                                    |
| `pnpm qr`                   | Generate a QR code for the dev server.                                                                                                                                   |
| `eas build`                 | Build with [EAS](https://docs.expo.dev/build/introduction/) using the profiles in `eas.json` (`development`, `preview` → Android APK, `production` with auto-increment). |

---

## Domain & data model

The savings domain lives in `lib/domain/` behind the `lib/savings-core.ts` entry point, and is deliberately pure and framework-agnostic.

| Module               | Responsibility                                                      |
| -------------------- | ------------------------------------------------------------------- |
| `domain/money.ts`    | Minor-unit conversion, `Intl` formatting, deposit-input sanitising. |
| `domain/jar.ts`      | Jar/entry types, milestones, habit streaks, `applyEntry`.           |
| `domain/schedule.ts` | Recurring-deposit catch-up and cadence maths.                       |
| `domain/insights.ts` | Monthly charts, deadline countdowns, pace, nudges.                  |
| `domain/presets.ts`  | One-tap deposit suggestions.                                        |
| `domain/badges.ts`   | Badge catalogue and progress.                                       |

### Money

- All monetary values are **integer minor units** (cents). Changing the display currency never rescales a balance.
- `toMinor(25.5)` → `2550`; `fromMinor(2550)` → `25.5`.
- `money(minor, currency?)` formats using `Intl.NumberFormat`; the currency comes from settings and defaults to **USD**.

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

Non-jar settings live in `lib/settings-store.tsx` under their own keys, so clearing jars never clears preferences:

| Key                         | Contents                                                    |
| --------------------------- | ----------------------------------------------------------- |
| `saving-jar:appearance`     | `light` / `dark` / `system`.                                |
| `saving-jar:currency`       | Display currency code.                                      |
| `saving-jar:reminders`      | Reminder toggle.                                            |
| `saving-jar:biometric-lock` | Biometric app-lock toggle.                                  |
| `saving-jar:pin-lock`       | PIN app-lock settings (salted hash lives in `SecureStore`). |

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

All four checks (typecheck, format, lint, tests) run on every push to `master` and on every pull request via GitHub Actions (`.github/workflows/ci.yml`).

**Tests across multiple files.** Coverage (`tests/`):

- `savings-core.test.ts` — money conversion, amount sanitization, milestones, deposits/withdrawals, habit streaks, recurring catch-up.
- `saving-jar.helpers.test.ts` — progress helpers, currency formatting, accent colors.
- `badges.test.ts`, `quick-presets.test.ts` — badge thresholds and deposit presets.
- `notifications.test.ts`, `reminders.test.ts` — reminder scheduling and the permission gate.

---

## Design documentation

- [`design.md`](design.md) — mobile interface design plan: screen list, user flows, layout rules, visual components.
- [`docs/superpowers/specs/`](docs/superpowers/specs) — feature design specs (local notifications).
- [`docs/superpowers/plans/`](docs/superpowers/plans) — the implementation plans those specs were built from.

---

## Roadmap

Notable open items:

- [ ] Publish over-the-air updates once `expo-updates` is configured for the production channel.

---

## Conventions & notes

- **Money math:** always integer minor units — never floats. Changing the display currency never rescales a balance.
- **Paths:** `@/*` maps to the project root.
- **Native folders** (`ios/`, `android/`) are generated and git-ignored.
- **All data is device-local.** Jars and settings persist in `AsyncStorage` — there is no server, no account system, and no network dependency.
- **Styles:** RN 0.86 — use the `boxShadow` shorthand and `StyleSheet.absoluteFill`. The legacy `shadow*`/`elevation` props and `absoluteFillObject` are gone.
- **New architecture only:** do not reintroduce `newArchEnabled`/`edgeToEdgeEnabled`; SDK 57 removed the old architecture.
- **`expo-notifications` is imported lazily** via the loader in `lib/notifications.ts`. A static import triggers push-token auto-registration and warns on every web load — keep OS-touching calls behind that loader.
- **Styles live in `components/`**, not in `app/`. Anything in a route folder is a route to Expo Router.
- **Pure domain code stays pure.** `lib/domain/*` takes data and returns data: no React, no `AsyncStorage`, no network.

---

## License

Private / proprietary. No open-source license is provided in this repository.
