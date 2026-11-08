# AGENTS.md — AI Agent Rules for Saving Jar (jarly)

This file defines mandatory rules for any AI coding agent working on this repository.

---

## Documentation Maintenance

### README.md

- **Always** review `README.md` after making changes that affect:
  - Tech stack versions (Flutter, Dart, go_router, Riverpod, key pub dependencies)
  - Project structure (new/removed directories, renamed files under `lib/`)
  - Available commands (anything documented under "Available commands")
  - Persistence keys or storage layout (`saving-jar:*`)
  - Architecture decisions or API surface changes (domain barrel, controllers, services)
  - Getting started instructions
  - Conventions & notes
- Update badges at the top of `README.md` when major dependency versions change or the test count moves.
- Keep the project structure tree in sync with the actual `lib/` layout.

### design.md

- **Always** review `design.md` after making changes that affect:
  - UI components, screens, or navigation structure
  - Visual design tokens (colors, spacing, typography)
  - User flows or interaction patterns
  - Animation behavior or library changes
  - Theming system (light/dark mode, color schemes)
- Update the "Last updated" line at the top when changes are made.

### When in doubt, update both.

It is better to make a small doc update than to leave documentation stale.

---

## Git & Push Rules

- **Default branch:** `master`
- **Always push to `master`** after completing work unless explicitly told otherwise.
- Write clear, imperative commit messages (e.g., "Fix transfer merge rejecting RN-produced frames", not "fix stuff").
- Group related changes into a single commit; don't commit broken intermediate states.
- Run `flutter analyze` and `flutter test` before committing when code changes are involved.

---

## Code Conventions

- **Money math:** always integer minor units — never floats.
- **Pure domain code stays pure.** `lib/domain/*` and `lib/transfer/*` take data and return data: no Flutter imports, no storage, no network. Screens import domain types from the `domain.dart` barrel only.
- **State lives in Riverpod controllers** (`lib/state/`); screens and widgets watch providers rather than holding duplicate state.
- **UI files:** reusable widgets belong in `lib/ui/widgets/`; only routes live in `lib/ui/screens/` (they map to go_router paths).
- **Colors:** prefer `Palette` tokens and `Color(0xAARRGGBB)` literals; use the `hexAlpha`/`parseHex` helpers (`lib/core/hex_color.dart`) only when porting RN-style `#RRGGBBAA` tints.
- **Platform plugins** (`flutter_local_notifications`, `local_auth`, `share_plus`, `file_picker`) are touched only through `lib/services/*`. Web must stay a no-op there — check `notificationsSupported` / `kIsWeb` guards before calling anything OS-level.
- **The transfer codec (`lib/transfer/transfer.dart`) is wire-compatible with the original RN app.** Never change the frame format, prefix, or validation limits without a deliberate migration.
- **Platform folders are tracked.** `android/` and `ios/` are normal Flutter hosts — edit and commit them; their inner `.gitignore` files already exclude generated artifacts. Regenerate launcher icons/splash with the documented commands instead of hand-editing generated resources.
- **Dart style:** follow `flutter_lints` (via `analysis_options.yaml`); run `dart format` on touched files. Doc comments (`///`) at the top of every file should say what it ports or owns.

---

## Sensitive Data

- Never commit `.env` files (the app currently has none — keep it that way).
- The PIN is stored only as a salted SHA-256 record in `flutter_secure_storage` (native) / `shared_preferences` (web). Never store it in plaintext in a new code path.
- All savings data is device-local: no server, no account, no uploaded data. Keep it that way unless a backend is deliberately reintroduced.
