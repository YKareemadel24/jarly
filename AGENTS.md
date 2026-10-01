# AGENTS.md — AI Agent Rules for Saving Jar (jarly)

This file defines mandatory rules for any AI coding agent working on this repository.

---

## Documentation Maintenance

### README.md
- **Always** review `README.md` after making changes that affect:
  - Tech stack versions (Expo SDK, React Native, React, TypeScript, key dependencies)
  - Project structure (new/removed directories, renamed files)
  - Available scripts (`package.json` scripts)
  - Environment variables (new/removed/changed `.env` keys)
  - Architecture decisions or API surface changes
  - Getting started instructions
  - Conventions & notes
- Update badges at the top of `README.md` when major dependency versions change.
- Add entries under "Recent upgrades" for significant migrations or breaking changes.
- Keep the project structure tree in sync with actual directory layout.

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
- Write clear, imperative commit messages (e.g., "Fix Reanimated Babel plugin crash on SDK 57", not "fix stuff").
- Group related changes into a single commit; don't commit broken intermediate states.
- Run `pnpm check` (TypeScript) before committing when code changes are involved.

---

## Code Conventions

- **Money math:** always integer minor units — never floats.
- **Paths:** `@/*` maps to project root; `@shared/*` maps to `shared/`.
- **Styles:** use `boxShadow` shorthand and `StyleSheet.absoluteFill`. No legacy `shadow*`/`elevation` props.
- **New architecture only:** do not reintroduce `newArchEnabled`/`edgeToEdgeEnabled`; SDK 57 removed the old architecture.
- **`expo-notifications`:** always import lazily via `lib/notifications.ts` loader. Never static-import on web.
- **Styles live in `components/`**, not in `app/`. Route folders are routes to Expo Router.
- **Pure domain code stays pure.** `lib/domain/*` takes data and returns data: no React, no AsyncStorage, no network.
- **Babel plugins:** `react-native-worklets/plugin` must come before `react-native-reanimated/plugin`, and both must be explicitly listed in `babel.config.js` (see SDK 57 fix notes).

---

## Sensitive Data

- Never commit `.env` files. Use `.env.example` as the source of truth.
- Never put secrets in `EXPO_PUBLIC_*` variables.
- Never log Supabase secret keys or JWT tokens.
