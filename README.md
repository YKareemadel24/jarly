# Saving Jar

A warm, tactile savings companion for Android, iOS, web, and Windows. Saving Jar turns everyday goals into colorful, glass "jars" you fill with deposits — making financial progress feel physical, clear, and rewarding.

> **Note:** Saving Jar is a _progress tracker_. It records your savings goals and habits; it never moves or touches your real money.

![Flutter 3.47](https://img.shields.io/badge/Flutter-3.47-02569B?logo=flutter)
![Dart 3.13](https://img.shields.io/badge/Dart-3.13-0175C2?logo=dart)
![Riverpod 3.5](https://img.shields.io/badge/Riverpod-3.5-2A5C8F)
![go_router 18](https://img.shields.io/badge/go__router-18-02569B)
![Tests 172](https://img.shields.io/badge/Dart_tests-172-4A9579)

> Saving Jar was ported from an Expo/React Native codebase to Flutter (October–November 2026). The transfer/backup wire format (`lib/transfer/transfer.dart`) is a faithful port of the original `shared/transfer.ts`, so QR codes and `.jarly` backups stay interchangeable across both generations of the app.

---

## Table of contents

- [What is Saving Jar?](#what-is-saving-jar)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Available commands](#available-commands)
- [Domain & data model](#domain--data-model)
- [Theming](#theming)
- [Testing & quality checks](#testing--quality-checks)
- [Design documentation](#design-documentation)
- [Conventions & notes](#conventions--notes)
- [License](#license)

---

## What is Saving Jar?

Saving Jar helps you set a savings goal (a "jar"), watch it fill as you add money, and stay consistent with optional recurring deposits and habit streaks. Each jar pairs an explicit saved amount, target amount, and percentage with a physical, animated jar visualization so progress always remains unambiguous.

The primary loop is intentionally short:

1. Open the **Home** dashboard.
2. Open a jar, tap its **+ Add** chip, or tap its reminder.
3. Add a contribution and immediately see the jar fill.
4. Return to the dashboard with confidence.

---

## Features

- **Per-jar home reminders** — unfinished jars are ordered by their earliest deposit or deadline, with undated jars last. The first two appear by default; expand to see all. Remaining amount, next deposit, and deadline appear on separate lines with a clear `+ Add` action.
- **Goal jars** — one-time goals with a target, optional deadline, emoji, and semantic accent color.
- **Habit jars** — repeatable savings with calendar-day streaks.
- **Deposits & withdrawals** — record contributions and take money back out (withdrawals never undo milestones or streaks). The deposit sheet previews the balance → new-balance transition and resulting percentage before confirming.
- **Quick deposit** — every jar card on Home exposes a separate `+ Add` button that opens its deposit sheet directly (long-press also works). Cards emphasize the saved amount, show the target on its own line, and display progress once. A labeled `New jar` button starts a new goal.
- **Recurring saving** — schedule automatic deposits on a daily, weekly, biweekly, or monthly cadence, with deterministic catch-up of missed occurrences.
- **Milestones** — progress is tracked at 25/50/75/100%, with a celebratory overlay when a level is crossed.
- **Insights dashboard** — total saved, active/completed jars, best streak, deposit count, and closest-to-goal view.
- **Activity feed** — a chronological log of deposits, withdrawals, corrections, and Undo records, filtered by jar, direction, and 7/30-day local date ranges.
- **Badges & nudges** — a badge catalogue driven by the pure domain layer, plus deadline countdowns and pace hints.
- **Transaction correction** — tap a jar-history entry to edit its amount/date/note or inspect previous values. A linked Undo record preserves the audit trail and rejects duplicate reversals.
- **File backups** — save or choose a `.jarly` file in Profile, review its date/currency/jars/history and planned merge, then explicitly restore. Existing jars are kept; malformed, oversized, mixed-currency, or conflicting data is refused.
- **Savings plans** — integer weekly requirements, recent deposit pace, and estimated completion after deposits on two recent days. Estimates are qualified and deadlines can be edited.
- **Personal reminders** — per-jar local time/weekdays, pause and one-day snooze; custom schedules stay separate from automatically recorded recurring deposits.
- **Device-to-device transfer** — move personal jars to a new phone over chained QR frames. No account, no server, no cable. Frames can also be shared as text.
- **App lock** — optional biometric or PIN lock. The PIN is stored as a salted SHA-256 in secure storage, with an escalating lockout after five failed attempts, and re-locks on every foreground return.
- **Reminders** — a daily 9 AM local savings check-in showing the active-jar total, plus local notifications for due recurring deposits and deadlines. Notifications resync when the app opens or savings change, and survive reboots on Android.
- **Multi-currency display** — balances stay integer minor units; only the displayed symbol changes (USD, EUR, GBP, EGP, SAR, AED, JPY, INR, CAD, AUD).
- **Local-first persistence** — data is stored on-device with `shared_preferences` (secure storage for the PIN), one-generation backup, and automatic migration from legacy formats.
- **Light / dark / system theming** — a white-first modern palette with warm, complete dark-mode tokens, persisted per user.
- **Tactile feedback** — haptics on success/error and confirmation for destructive actions.
- **Accessibility** — descriptive labels, explicit numeric progress, and large touch targets.

---

## Tech stack

| Layer           | Technology                                                                                                                        |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| App framework   | [Flutter](https://flutter.dev) 3.47 / Dart 3.13 — Material 3, no custom platform channels                                          |
| Routing         | [go_router](https://pub.dev/packages/go_router) 18 (`StatefulShellRoute` for the tab shell; the deep-link `?action=deposit` convention is preserved) |
| State           | [flutter_riverpod](https://pub.dev/packages/flutter_riverpod) 3 (`AsyncNotifier` controllers over the pure domain)                 |
| Persistence     | `shared_preferences` (jars, settings), `flutter_secure_storage` (PIN record)                                                       |
| App lock        | [local_auth](https://pub.dev/packages/local_auth) (biometrics) + the fail-closed policy in `lib/lock/lock_policy.dart`              |
| Notifications   | `flutter_local_notifications` + `timezone` + `flutter_timezone` (schedule rebuild is cancel-all-then-schedule)                     |
| Backup I/O      | `share_plus` (native share sheet), `file_picker`, `package:web` (browser download/upload)                                          |
| QR transfer     | [qr](https://pub.dev/packages/qr) encoder rendered with a single-path `CustomPainter`                                              |
| Testing         | `flutter_test` — 172 tests over the pure domain, codecs, persistence, and widgets                                                  |
| Tooling         | `flutter_lints` 6, `flutter_launcher_icons`, `flutter_native_splash`                                                               |

---

## Architecture

The project is a **local-first Flutter app**: a go_router client with all data stored on-device in `shared_preferences`.

```
┌────────────────────────────────────┐
│  Client (go_router + Riverpod)     │
│  lib/ui/  lib/state/  lib/domain/  │
│  - Screens & navigation            │
│  - Savings domain + controllers    │
│  - shared_preferences persistence  │
└────────────────────────────────────┘
```

Key decisions:

- **Domain logic is pure and isolated** behind `lib/domain/domain.dart`, the barrel export of focused modules (`money`, `jar`, `schedule`, `insights`, `presets`, `badges`, `transactions`, `reminder`, `time`, `util`). This layer has no Flutter or I/O imports, which keeps it fully unit-testable, and screens import only from the barrel so the split stays internal.
- **The Riverpod controllers** (`lib/state/savings_controller.dart`, `lib/state/settings_controller.dart`) are thin async notifiers around the pure domain layer, persisting to `KeyValueStorage` (`lib/data/key_value_storage.dart`). Appearance handling lives in `lib/state/providers.dart`.
- **All savings data is device-local.** Jars live only in on-device storage — there is no server and no account system.
- **Money is always integer minor units** (cents). Floats are never used for balances; see [Domain & data model](#domain--data-model).
- **The transfer codec is a faithful port of the RN app's** (`lib/transfer/transfer.dart` from the old `shared/transfer.ts`), so QR codes and `.jarly` backups remain interchangeable.

---

## Project structure

```
jarly/
├── android/  ios/  web/  windows/  # Platform hosts (all tracked)
├── lib/
│   ├── main.dart                   # Entry point: ProviderScope + JarlyApp
│   ├── app.dart                    # MaterialApp.router, theme, brightness bridge,
│   │                               #   lock gate / notification resync / storage warning
│   ├── core/                       # Formatting, hex-color helpers, QR matrix, theme tokens
│   │   ├── format.dart             #   money(minor, currency) via intl
│   │   ├── hex_color.dart          #   RN-style #RRGGBBAA helpers for ported call sites
│   │   ├── qr_matrix.dart          #   qr-package wrapper -> boolean module matrix
│   │   └── theme/                  #   palette.dart (light/dark tokens), jar_accents.dart
│   ├── domain/                     # PURE modules (barrel: domain.dart) — no Flutter, no I/O
│   ├── activity/                   # Pure day-grouping (activity_sections) + home reminders
│   ├── data/                       # KeyValueStorage, savings storage, settings repository
│   ├── state/                      # Riverpod controllers + providers (savings, settings, theme)
│   ├── lock/                       # Fail-closed app-lock policy
│   ├── notifications/              # Pure due-notification derivation
│   ├── transfer/                   # QR frame codec (transfer.dart), safe merge, .jarly backups
│   ├── services/                   # Platform plumbing: notification_service, haptics, backup I/O
│   └── ui/
│       ├── app_theme.dart          # ThemeData built from the token palette
│       ├── router.dart             # go_router tree mirroring the old Expo Router structure
│       ├── screens/                # Home, Activity, Insights, Profile, Jar detail, New jar,
│       │                           #   Transfer hub/send/receive, Lock gate
│       └── widgets/                # JarVessel, sheets, ActionSheet, AppToast, QrCodeView,
│                                   #   BackupPanel, ScreenContainer, Pressable, ...
├── test/                           # flutter_test suite (one file per domain module/codec)
├── assets/images/                  # Brand icons + splash source images
├── docs/superpowers/               # Design specs and implementation plans
├── analysis_options.yaml           # flutter_lints configuration
└── pubspec.yaml                    # Dependencies + icon/splash generator config
```

---

## Getting started

### 1. Install dependencies

**Flutter 3.47+** (Dart 3.13) is required. Platform SDKs are needed for the targets you build: Android SDK (or Android Studio) for Android, Xcode for iOS, Visual Studio with the "Desktop development with C++" workload for Windows, and any Chromium browser for web.

```bash
flutter pub get
```

### 2. Run the app

```bash
flutter run                     # picks a connected device
flutter run -d chrome           # web (no native toolchain needed)
flutter run -d windows          # Windows desktop
```

There is no backend and no `.env` file: the app is fully device-local, so a fresh clone runs as-is.

---

## Available commands

| Command                                   | Description                                                                        |
| ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `flutter run`                             | Run on a connected device or emulator.                                             |
| `flutter analyze`                         | Static analysis (`flutter_lints` 6) — must be clean before committing.             |
| `flutter test`                            | Run the Dart test suite.                                                           |
| `dart format .`                           | Format the Dart code.                                                              |
| `flutter build web`                       | Release web bundle into `build/web`.                                               |
| `flutter build apk` / `flutter build ios` | Native release builds.                                                             |
| `dart run flutter_launcher_icons`         | Regenerate launcher icons from `assets/images/` (config in `pubspec.yaml`).        |
| `dart run flutter_native_splash:create`   | Regenerate native splash screens from `assets/images/`.                            |

---

## Domain & data model

The savings domain lives in `lib/domain/` behind the `domain.dart` barrel, and is deliberately pure and framework-agnostic.

| Module                     | Responsibility                                                      |
| -------------------------- | -------------------------------------------------------------------- |
| `domain/money.dart`        | Minor-unit conversion, `intl` formatting, deposit-input sanitising.  |
| `domain/jar.dart`          | Jar/entry types, milestones, habit streaks, `applyEntry`.            |
| `domain/schedule.dart`     | Recurring-deposit catch-up and cadence maths.                        |
| `domain/insights.dart`     | Monthly charts, deadline countdowns, pace, nudges.                   |
| `domain/presets.dart`      | One-tap deposit suggestions.                                         |
| `domain/badges.dart`       | Badge catalogue and progress.                                        |
| `domain/transactions.dart` | Corrections, Undo records, effective-entry derivation.               |
| `domain/reminder.dart`     | Personal reminder schedules (`nextReminderDates`).                   |

### Money

- All monetary values are **integer minor units** (cents). Changing the display currency never rescales a balance.
- `toMinor('25.50')` → `2550`; decimal text is parsed exactly through the safe minor-unit limit. `minorToDecimal(2550)` → `'25.50'` is the exact formatter for amount inputs.
- Numeric `toMinor(25.5)` and `fromMinor(2550)` retain legacy floating-point conversion behavior; legacy v1/v2 numeric storage migration is unchanged. Use decimal text for user-entered amounts.
- `money(minor, currency)` formats integer whole units and cents separately via `intl`; the currency comes from settings and defaults to **USD**.

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
- `runDueRecurring(...)` deterministically applies missed occurrences and advances `nextDate` past "now", bounded to at most 366 occurrences per call. Startup skips a catch-up that would make the active savings total exceed safe integer precision.

### Persistence

`lib/state/savings_controller.dart` persists the jar list to on-device key/value storage under `saving-jar:v3`, keeps a one-generation backup (`saving-jar:v3:backup`), and migrates legacy `v1`/`v2` stores (converting float dollars → minor units). The storage selection and ordered-write logic live in `lib/data/savings_storage.dart`.

An intentionally empty v3 list is preserved. If the current list is corrupt, the store tries its valid backup before older migrations and does not overwrite the corrupt source when recovery fails. Writes run in order; storage read/write failures show a persistent warning in the app.

Non-jar settings live under their own keys, so clearing jars never clears preferences (`lib/data/settings_repository.dart`):

| Key                         | Contents                                                                                     |
| --------------------------- | --------------------------------------------------------------------------------------------- |
| `saving-jar:appearance`     | `light` / `dark` / `system`.                                                                   |
| `saving-jar:currency`       | Display currency code.                                                                         |
| `saving-jar:reminders`      | Reminder toggle.                                                                               |
| `saving-jar:biometric-lock` | Biometric app-lock toggle.                                                                     |
| `saving-jar:pin-lock`       | PIN app-lock toggle.                                                                           |
| `saving-jar:pin-attempts`   | Failed-attempt throttle state.                                                                 |
| `saving-jar.app-lock.pin`   | Salted SHA-256 PIN record — `flutter_secure_storage` on native, `shared_preferences` on web.   |

---

## Theming

Theme tokens are defined in `lib/core/theme/palette.dart` and consumed by both `MaterialApp` (`lib/ui/app_theme.dart`) and the Riverpod palette provider.

- Modes: **light**, **dark**, **system** (default is `system`).
- The chosen mode is persisted (`saving-jar:appearance`); the app also bridges `MediaQuery.platformBrightnessOf` into the provider so non-Material widgets follow the OS.
- Jar accent colors (coral, amber, mint, ocean, berry, clay) have dedicated dark-scheme variants (`jarAccentDark`) so alpha-tinted chips stay legible.

Design tokens (`lib/core/theme/palette.dart`):

| Token        | Light     | Dark      |
| ------------ | --------- | --------- |
| `primary`    | `#3B2D24` | `#9C6C53` |
| `background` | `#F6F1E8` | `#201B18` |
| `surface`    | `#FFFDF9` | `#2D2722` |
| `foreground` | `#2C231D` | `#F6EDE2` |
| `muted`      | `#6B5F55` | `#C5B7AA` |
| `border`     | `#E6DCD0` | `#4A4039` |
| `success`    | `#4A9579` | `#7BC6A7` |
| `warning`    | `#B88322` | `#E4BD61` |
| `error`      | `#B5534D` | `#E98C85` |

---

## Testing & quality checks

The domain layer is the most heavily tested part of the codebase.

```bash
flutter test      # 172 tests
flutter analyze   # static analysis
dart format .     # formatting
```

All three checks run on every push to `master` and on every pull request via GitHub Actions (`.github/workflows/ci.yml`).

**Coverage (`test/`):**

- `money_test.dart`, `jar_test.dart` — money conversion, amount sanitization, milestones, deposits/withdrawals, habit streaks.
- `jar_detail_screen_test.dart` — exact large-amount previews, persisted deposits, and note-only corrections.
- `schedule_test.dart` — recurring catch-up boundaries.
- `insights_test.dart`, `badges_test.dart`, `presets_test.dart` — monthly charts, pace, badge thresholds, deposit presets.
- `transactions_test.dart` — safe corrections/Undo and audit history.
- `reminder_test.dart`, `due_notifications_test.dart`, `jar_reminders_test.dart` — reminder schedules, OS ping derivation, ordered home reminders.
- `activity_sections_test.dart` — local-day grouping, ordering, combined filters.
- `transfer_test.dart`, `transfer_merge_test.dart`, `backup_test.dart` — transfer validation (including frames produced by the original RN app), conflict-safe imports, bounded backup parsing.
- `savings_storage_test.dart` — empty-store preservation, backup recovery, ordered writes.
- `lock_policy_test.dart`, `pin_repository_test.dart` — lock gates and PIN record hashing/legacy upgrade.

---

## Design documentation

- [`design.md`](design.md) — mobile interface design plan: screen list, user flows, layout rules, visual components.
- [`docs/superpowers/specs/`](docs/superpowers/specs) — feature design specs (local notifications).
- [`docs/superpowers/plans/`](docs/superpowers/plans) — the implementation plans those specs were built from.

---

## Conventions & notes

- **Money math:** always integer minor units — never floats. Changing the display currency never rescales a balance.
- **Pure domain code stays pure.** `lib/domain/*` and `lib/transfer/*` take data and return data: no Flutter, no storage, no network. Import from `domain.dart`, not individual files, so the split stays internal.
- **Styles live in `lib/ui/`**, not in route widgets. Screens under `lib/ui/screens/` are routes to go_router; reusable pieces belong in `lib/ui/widgets/`.
- **Colors:** ported call sites build tints with the `hexAlpha`/`parseHex` helpers in `lib/core/hex_color.dart` (RN-style `#RRGGBBAA` suffixes). New code should prefer `Color(0xAARRGGBB)` or the palette directly.
- **All data is device-local.** Jars and settings persist in `shared_preferences` (secure storage for the PIN) — there is no server, no account system, and no network dependency. Keep it that way.
- **Notifications** go through `lib/services/notification_service.dart`. Web is a no-op there by design (`notificationsSupported`); never touch the plugin from a code path that also runs on web without that guard.
- **Platform folders are tracked.** `android/` and `ios/` are normal Flutter hosts now — commit changes to them; their inner `.gitignore` files exclude generated artifacts (`local.properties`, Pods, ephemeral).
- **Regenerate icons/splash** with the commands above after changing `assets/images/`; do not hand-edit generated launcher resources.

---

## License

Private / proprietary. No open-source license is provided in this repository.
