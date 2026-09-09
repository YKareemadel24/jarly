# Jarly S-Tier UI/UX — Design Spec (Option A + 3 delights)

Date: 2026-09-09 | Branch: `jarly-uiux-redesign` | Goal: premium & polished, full vision slices, iOS + Android equally.

## 1. Problem
The app works but feels B-tier: `Georgia` hardcoded in 5 screens (Android falls back to sans), `#3B2D24` hardcoded on balance/FAB/deposit buttons (muddy on dark `#201B18`), all sheets are bare `Modal transparent` (no swipe/outside-tap/keyboard handling), Home has two competing deposit CTAs, keypad targets are 45dp, heatmap greens are hardcoded light values that clash in dark mode. Fix the system once, every screen gets premium free.

Non-goals: no new nav, no chart lib, no widgets, no custom font files, no `@gorhom/bottom-sheet` dep.

## 2. System first

### 2.1 Typography — reuse `Fonts`, delete `Georgia`
`lib/_core/theme.ts` already exports `Fonts.serif/sans/mono` (iOS `ui-serif`, Android `serif`, web `Georgia`). All screens must use it.
- Replace `fontFamily: "Georgia"` in `app/(tabs)/index.tsx`, `app/jar/[id].tsx`, `app/(tabs)/stats.tsx`, `app/(tabs)/activity.tsx`, `app/(tabs)/profile.tsx` (+ `monogramText`, `sheetTitle`) with `Fonts.serif`.
- Body/numbers stay system sans + `fontVariant: ["tabular-nums"]` (already used for money — keep).
- No `expo-font` custom files. Add when brand serif measurably beats system serif.

### 2.2 Color/contrast — stop hardcoding cocoa
- `balanceCard`, `quickAdd` (`index.tsx`), `deposit` (`[id].tsx`) switch from `#3B2D24`/`#FFFDF9` literals to `c.primary` bg + `#FFFDF9` text in both schemes (cocoa `#3B2D24` light and `#9C6C53` dark both hold white text above 4.5:1). No new token.
- `quickAddChipText {color: accent}` fails for amber. New helper `lib/jar-ink.ts`: `inkOnAccent(accentHex)` returns darkened accent for text on tint (darken 32% via simple RGB mix with `#2C231D`). Chip bg stays `${accent}1F`, text uses ink. Same helper reused in Activity rows, detail hero `heroProgress`, rhythm days.
- `stats.tsx` heatmap: replace `#CFE8DD/#9AD3B9/#5FB894` literals with 4-step scale derived from `c.success` at opacities `0.22/0.45/0.75/1.0` over `c.surface`, empty = `c.border`. No new tokens.
- `theme.config.js` unchanged except: none. All fixes consume existing 8 tokens + accents. Skipped radius/shadow token file — add when 3rd screen needs it; until then colocated `StyleSheet` stays.

### 2.3 One `Sheet` component — no new dep
`@gorhom/bottom-sheet` is NOT installed; `reanimated + gesture-handler` ARE (and `GestureHandlerRootView` is already in `app/_layout.tsx`). Build `components/sheet.tsx` (~80 lines): `Modal transparent + fade` backdrop (`Pressable` outside-tap closes), inner `Animated.View` slide-up via reanimated, drag-handle, `accessibilityViewIsModal`, per-sheet local `error` state (fixes current shared-`error` leak across deposit/recurring/edit in `[id].tsx`).
- Migrate in order: deposit/withdraw → recurring → edit → currency picker + PIN (`profile.tsx` `sheetOverlay/sheetCard`). Delete `sheetOverlay/sheetCard` styles after.
- Swipe-to-dismiss: tap-outside + Cancel close in v1; pan-gesture dismiss added when gesture work measurably improves completion.

## 3. Home `app/(tabs)/index.tsx`
- One CTA: delete floating `quickAdd` FAB. Keep contextual `nextAction` card, relabel CTA to `Add · Usual $X` (uses existing `depositPresets` usual amount). Removes decision paralysis + tab-bar collision (`bottom:14 absolute` vs gesture nav).
- `GoalCard`: un-absolute the chip. Row becomes `[vessel | copy flex:1 | chip inline, 44dp min]`, delete `paddingRight:42` + `position:absolute` chip styles. Chip keeps `+ Add`, bg `${accent}1F`, text `inkOnAccent`.
- Track `height:5 → 8`, add tip dot. Keep `${progress}%` single source (`percent(jar)`).
- Loading: replace bare `ActivityIndicator` with 3 skeleton cards (surface + border, shimmer via reanimated opacity pulse, respects `useReducedMotion`).
- Press: card `onPress` adds `feedback.tap()`; keep `opacity .86 scale .98` (no new spring system yet).

## 4. Deposit takeover `app/jar/[id].tsx` (delight #1)
- Amount entry: `AmountKeypad` keys `height:45 → 56`, `gap:5 → 8`, radius 13→14. Long-press backspace clears (gesture-handler `onLongPress`). Live preview line: `{currency}{grouped} → {newBalance} · {pct}%` with tabular-nums; replaces raw `{amount||"0"}` Text. Validation stays: `>0`, withdraw ≤ balance, error per-sheet.
- Success: keep `coinDropKey` + `crossedMilestones` + `feedback.milestone()`. `celebration` modal becomes takeover: large `JarVessel` at snapshot progress, `{level}%` number, copy `is now {level}% funded`, single CTA `Keep saving`. Confetti = 12 reanimated dots burst (no lib), skipped entirely when `useReducedMotion`.
- `expectedMarker` keeps position math, add caption `● you · ◆ needed pace` (one line, muted 11px).
- Entry icons `south/north` → `add/remove` (same tint logic). `Toast` `bottom:24 → 96` so it clears tab bar + keyboard; keep 5.5s + Undo compensating entry (milestones never re-trigger — invariant preserved).

## 5. Insights/Activity/Profile (delight #2 + #3 hygiene)
- Insights: bars get empty state (`Your rhythm starts with the first deposit`), tap shows value via `accessibilityLabel` + title; allocation bar `minWidth:6` per segment, delete `gap:2` (fixes overflow-hidden seam). No range toggle in v1 — `weeklyDepositTotals(active,12)` stays; `4w/12w` segmented added when users ask for ranges.
- Activity: add `All/Deposits/Withdrawals` filter chips (pure filter over existing `groups` memo, no store change). Same `add/remove` icon swap.
- Profile: `monogram SJ` → first active jar emoji or `SJ`; `themeChoice minHeight:40 → 48`; currency + PIN overlays migrate to shared `Sheet`. Nothing else.

## 6. Cross-cutting
- Safe-area: FAB deletion removes worst offender; `Toast` + remaining sheets anchor via `useSafeAreaInsets().bottom + 16`, never raw `bottom:14/24`.
- A11y: every bar/heat cell keeps value label; sheets set `accessibilityViewIsModal`; deposit amount input `autoFocus` (recurring already does); all touch targets ≥44dp after keypad/chip fixes.
- Motion: `JarVessel` spring/coin logic untouched (already reduced-motion aware). New motion (skeleton pulse, celebration pop, confetti) all gated on `useReducedMotion`.
- Money invariant untouched: integer minor units via `toMinor/fromMinor`; withdrawals never roll back milestones/streaks; `reminders.ts`/`notifications.ts` guards unchanged.

## 7. Files touched (max 10)
`components/sheet.tsx` (new), `lib/jar-ink.ts` (new, ~15 lines), `components/amount-keypad.tsx`, `components/empty-state.tsx` (new, unifies Home/Activity skeletons + empty), `app/(tabs)/index.tsx`, `app/jar/[id].tsx`, `app/(tabs)/stats.tsx`, `app/(tabs)/activity.tsx`, `app/(tabs)/profile.tsx`, `components/toast.tsx`.

Explicitly NOT touched: `lib/savings-core.ts`, `lib/savings-store.tsx`, `lib/reminders.ts`, `lib/notifications.ts`, `lib/_core/*`, `server/*`, `drizzle/*`, `ios/*`, `android/*`.

## 8. Verification
`pnpm check` + `pnpm test` must pass. Manual: light + dark screenshots of Home/Detail/Insights/Activity/Profile; deposit + withdraw + undo on iOS + Android (or Expo web + one native); reduced-motion on; 320dp width (chip no-overlap); TalkBack/VoiceOver pass on sheets + bars.
