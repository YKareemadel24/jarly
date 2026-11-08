# Migrate jarly (Saving Jar) from Expo/React Native to Flutter

## Context

jarly v2.1.0 is a fully local-first savings tracker (Expo SDK 57 / RN 0.86 / expo-router / Reanimated 4): ~8,300 lines of UI (12 routes, 31 components), ~4,100 lines of lib/domain + shared/transfer logic, 17 vitest suites. All data is device-local AsyncStorage JSON; no backend. Flutter 3.47.9 stable + Dart 3.13.7 are already installed at `C:\Users\karee\Documents\Codex\flutter-sdk\flutter`.

You chose: **Flutter at repo root** (RN removed at the end), **iOS + Android + web**, **Riverpod**, **in-app data migration** via the existing .jarly backup / QR code formats.

**Core principle: faithful behavioral port.** Exact theme tokens, exact domain logic, identical storage keys and wire formats so data flows between the old and new app.

## Dependency mapping

| RN | Flutter |
|---|---|
| expo-router (root stack + 4 tabs) | go_router (`StatefulShellRoute` + pushed pages, custom back buttons) |
| Context stores (savings/settings/theme) | Riverpod `Notifier`s |
| AsyncStorage JSON blobs | shared_preferences, **same keys** (`saving-jar:v3`, `:v3:backup`, `:v2`, `:v1`, `saving-jar:currency/appearance/...`) |
| expo-secure-store PIN | flutter_secure_storage + `crypto` (same `v1:<len>:<saltHex>:<sha256(salt:pin)>` format) |
| expo-local-authentication | local_auth (no-op on web) |
| expo-notifications | flutter_local_notifications + timezone |
| Reanimated (jar fill, coin drop) | AnimationController + spring simulations |
| react-native-svg, qrcode | CustomPainter + `qr` package (matrix → painter) |
| expo-haptics | HapticFeedback |
| expo-file-system/sharing/document-picker | path_provider + share_plus + file_picker (web: Blob download via conditional import) |
| Intl.NumberFormat | intl `NumberFormat.currency` |

## Project structure

`flutter create --project-name jarly --org com.app.savingjar --platforms android,ios,web,windows .` (windows target = local smoke-testing only on this machine; `flutter doctor` will confirm what's runnable).

```
pubspec.yaml (name jarly, version 2.1.0)
lib/
  main.dart, app.dart            MaterialApp + light/dark themes from exact token values
  core/theme/palette.dart        theme.config.js values verbatim (background #F6F1E8/#201B18,
                                 surface #FFFDF9/#2D2722, primary #3B2D24/#9C6C53, etc.) +
                                 jarAccent/jarAccentDark maps from lib/domain/jar.ts
  domain/                        PURE Dart, no Flutter imports — mirrors lib/domain/*:
                                 money, jar, schedule, insights, presets, badges,
                                 transactions, reminder
  transfer/transfer.dart         port of shared/transfer.ts — byte-identical JARLY1 v2 frames
  data/                          key_value_storage, jars_repository (load path + write queue +
                                 backup-key copy), settings_repository, pin_repository,
                                 backup_io
  state/                         savings/settings/theme/lock Riverpod controllers
  services/                      notifications_service, haptics, error_reporting
  ui/
    router.dart                  go_router: 4 tabs (home, activity, stats, profile) +
                                 /jar/:id, /jar/new, /transfer, /transfer/send, /transfer/receive;
                                 scheme jarly:// deep links incl. ?action=deposit
    screens/                     home_screen, activity_screen, stats_screen, profile_screen,
                                 jar_detail_screen, new_jar_screen, transfer_hub_screen,
                                 transfer_send_screen, transfer_receive_screen
    widgets/                     jar_vessel (CustomPainter glass + spring fill + coin drop +
                                 milestone ticks + sealed badge), goal_card, deposit_sheet,
                                 edit_entry_sheet, edit_jar_sheet, recurring_sheet,
                                 celebration_modal, action_sheet (Alert.alert is web no-op →
                                 in-app dialogs like today), lock_screen (custom keypad +
                                 biometric gate + lockout), backup_panel, savings_plan_card,
                                 jar_reminder_settings, toast, storage_warning,
                                 monthly_chart (CustomPainter), badge grid
test/                            ports of the 17 vitest suites (minus the component-render one)
```

Sheets/overlays use `showModalBottomSheet`/`showDialog` (replacing RN `<Modal>`). All 10 currencies via intl.

## Invariants to preserve exactly

- **Money**: integer minor units only; `toMinor` single ingress; sanitize input (≤2 fraction digits, no separators). BigInt for history replay/total-sums (matters on web where Dart int is a JS double).
- **Ledger**: `balance == openingBalance + Σ signed entries`, validated by BigInt backward replay incl. no historical over-withdrawal.
- **Undo** = compensating opposite entry with `undoOf`; `effectiveEntries` filters both sides; corrections append `EntryRevision` (cap 1000); full-history re-validation.
- **Recurring catch-up**: replay missed occurrences with their own timestamps, cap 366, cursor clamped to creation date.
- **Merge/import**: currency match, duplicate ids rejected, entry histories must be strict suffixes, atomic abort on conflict, safe-integer active-total guard.
- **Storage**: write-behind single-flight queue; copy current good value to `:backup` before each write; corrupt data → read-only mode + StorageWarning banner (never auto-destroyed).
- **Backups**: `jarly-backup` envelope v1, 512 KB cap, self-validating create, double validation on import.
- **PIN lockout**: 5 free attempts → 30s/60s/5m/15m escalating schedule.
- **Notifications**: single 63-notification OS budget round-robined across jars; per-jar custom reminder (up to 63 dates, DST-safe) → due-recurring 09:00 ping → deadline-today ping; daily 09:00 total-balance check-in; Android `reminders` channel; cancel-all-then-reschedule on foreground/changes.
- **Theme**: light/dark/system persisted; system-follow default.

## Phases (each ends green: `flutter analyze` + `flutter test`, then a commit)

1. **Scaffold + domain**: flutter create, deps, palette, full pure-Dart domain port + transfer codec; port vitest suites (money, jar, schedule, insights, presets, badges, transactions, reminder, transfer, merge, backup, lock-policy, activity-sections, due-notifications). Domain tests passing = proof of faithful port.
2. **Data + state**: storage/repositories (same keys + migration v1→v3), PIN (secure storage, same hash format, web → shared_preferences fallback), Riverpod controllers, money formatting, lock policy + lockout schedule + tests.
3. **UI shell + Home**: go_router, themed MaterialApp, screen container, custom tab bar (60 + padding, 11px/700 labels), Home (hero total card, weekly momentum, reminders list w/ view-all, GoalCards w/ 320ms long-press → deposit deep link, completed footer, empty state).
4. **Jar flows**: JarVessel painter + coin drop (honors reduced motion), jar detail (stat rows, deposit/withdraw sheet w/ presets + live balance preview, streak banner, recurring sheet, savings plan card, reminder settings, entries + EditEntrySheet corrections/undo, EditJarSheet, celebration modal at 25/50/75/100, toasts), New jar 3-step wizard (kind → icon+accent → target+deadline, live preview, haptics).
5. **Activity + Insights + Profile**: grouped/filtered activity list, stats (2×2 glance grid, closest goal, monthly bar chart, badges grid + ring), profile (appearance picker, toggles, currency sheet, backup panel w/ restore preview, archived jars restore/delete-forever).
6. **Transfer**: send (QR frames pager + share-as-text) and receive (paste-frames, progress, import summary) using the ported codec.
7. **Platform services**: notifications service + resync on app lifecycle, LockScreen gate + local_auth, app icon/splash from existing assets (portrait lock, adaptive icon, light/dark splash), web degradation paths (Blob download, file pick, no-op biometrics/notifications).
8. **RN removal + docs**: delete RN artifacts (package.json, pnpm-lock, app/, components/, hooks/, lib/, shared/, tests/, scripts/, app.config.ts, babel/metro/tailwind/theme configs, tsconfig, vitest/eslint/prettier configs, eas.json, .expo, dist, node_modules, .env.example) — keep assets/images; rewrite **README.md** (Flutter badges, structure, scripts), **design.md** (implementation notes now Flutter), **AGENTS.md** (Flutter rules: integer minor units, pure `lib/domain`, `flutter analyze`+`flutter test` before commit, push to master), and **.github/workflows/ci.yml** (flutter analyze/test).

Not ported (intentional): `app/dev/theme-lab` (NativeWind dev inspector), EAS OTA updates (no Flutter equivalent; store updates instead), dead Supabase `.env` vars. Deep-link scheme becomes `jarly://` (the `manus<timestamp>` scheme was generated cruft).

## Data migration (user path)

Flutter app implements identical .jarly + JARLY1 formats → export from the RN app (Profile → backup, or Transfer screen QR codes) → import in Flutter. PIN is re-created (security credential, not migrated); currency/appearance re-chosen.

## Verification

1. `flutter analyze` — zero errors.
2. `flutter test` — all ported domain/data suites green (this is the faithfulness gate).
3. Smoke run on whatever target `flutter doctor` shows available (Chrome web and/or Windows desktop): create jar → deposit → coin drop + milestone → correct/undo entry → recurring → export .jarly → wipe → re-import → QR send/receive round-trip → light/dark switch.
4. `flutter build web` (and `flutter build apk --debug` if Android SDK present).
5. Final commit(s) per phase history, push to `master` per AGENTS.md.

Scale note: this is a full rewrite (~12k lines TS → ~10–14k lines Dart). Phases land independently, so the repo stays green throughout; RN app remains functional until phase 8.