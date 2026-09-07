# Saving Jar UI/UX Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the supplied UI/UX redesign into a decision-focused, accessible Expo experience without changing Saving Jar's local-first domain model.

**Architecture:** Add small pure presentation selectors to the established `savings-core` domain layer, then consume them in the existing Expo routes. Screens remain route-owned; the jar vessel remains the one reusable visual component. Existing `paceProjection`, storage, recurring deposits, undo behavior, and notification edits stay authoritative.

**Tech Stack:** Expo SDK 54, React Native, Expo Router, TypeScript, Reanimated, Material Icons, Vitest.

**Spec:** `docs/superpowers/specs/2026-09-08-savings-jar-uiux-design.md`

## Global Constraints

- Reuse `paceProjection`; do not create another pace model.
- Add no dependencies, font downloads, server calls, or web-only libraries.
- Preserve all existing uncommitted changes in `app/jar/[id].tsx`.
- Keep currency values as integer minor units; call `useMoney()` for display.
- Provide accessible labels and honor reduced-motion settings.

---

### Task 1: Add testable presentation selectors

**Files:**
- Modify: `lib/savings-core.ts`
- Modify: `tests/savings-core.test.ts`

**Interfaces:**
- Produces `depositTotalsByDay(jars, days, now)`, `depositTotalsByWeek(jars, weeks, now)`, `depositPresets(jar, pace)`, and `groupEntriesByPeriod(entries, now)`.
- Consumes `Jar`, `Entry`, and `PaceProjection` already exported by `savings-core`.

- [ ] **Step 1: Write failing selector tests**

```ts
expect(depositTotalsByDay([jar({ entries: [dep(300, 1)] })], 3, now)).toEqual([0, 300, 0]);
expect(depositPresets(jar({ balance: 2_000, target: 10_000 }), behindPace))
  .toContainEqual({ kind: "weekly-pace", amount: 1_000 });
expect(groupEntriesByPeriod([entry], now)[0]).toMatchObject({ label: "Today", entries: [entry] });
```

- [ ] **Step 2: Verify the tests fail because the selectors are not exported**

Run: `pnpm vitest run tests/savings-core.test.ts`

Expected: TypeScript or Vitest failure naming the missing selector.

- [ ] **Step 3: Implement the smallest selectors**

```ts
export type DepositPreset = { kind: "usual" | "weekly-pace" | "milestone" | "finish"; amount: number; level?: number };

export function depositPresets(jar: Jar, pace: PaceProjection): DepositPreset[] {
  // return positive, de-duplicated amounts only; cap at four choices
}
```

Use local calendar-day buckets, include deposits only, never create a finish preset for a funded jar, and preserve entry order within each group.

- [ ] **Step 4: Verify the new tests pass**

Run: `pnpm vitest run tests/savings-core.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit the selector slice**

```bash
git add lib/savings-core.ts tests/savings-core.test.ts
git commit -m "feat: add savings UI selectors"
```

### Task 2: Simplify Home into a hero, one action, and jars

**Files:**
- Modify: `app/(tabs)/index.tsx`

**Interfaces:**
- Consumes `paceProjection` and the active jar list.
- Produces a single tappable next-best-action row that navigates to `?action=deposit`.

- [ ] **Step 1: Add a focused failing selector test for action priority**

```ts
expect(nextBestJar([onTrackJar, behindJar])).toBe(behindJar.id);
expect(nextBestJar([onTrackJar])).toBe(onTrackJar.id);
```

Place `nextBestJar` in `lib/savings-core.ts` only if it keeps the test pure; otherwise keep it as a small local function and verify through the next screen smoke check.

- [ ] **Step 2: Verify the test fails**

Run: `pnpm vitest run tests/savings-core.test.ts`

Expected: failure because `nextBestJar` is absent.

- [ ] **Step 3: Implement Home hierarchy**

Replace the separate nudge, reminder, and featured cards with: a total-saved hero showing weekly deposits and active/funded counts; one action row for the behind jar or closest active jar; and the jar list. Keep the floating Add Money action and visible per-card `+ Add` control.

- [ ] **Step 4: Verify types and focused test**

Run: `pnpm vitest run tests/savings-core.test.ts; pnpm check`

Expected: both pass.

- [ ] **Step 5: Commit Home**

```bash
git add app/(tabs)/index.tsx lib/savings-core.ts tests/savings-core.test.ts
git commit -m "feat: focus the home saving action"
```

### Task 3: Upgrade the transaction sheet without changing mutations

**Files:**
- Modify: `app/jar/[id].tsx`
- Modify: `components/jar-vessel.tsx`

**Interfaces:**
- Consumes `depositPresets(jar, paceProjection(jar))`.
- Keeps `addEntry(id, amountMinor, direction, note)` as the only transaction mutation.
- Extends `JarVessel` with an optional `previewProgress?: number` prop.

- [ ] **Step 1: Write a failing test for preset deduplication and milestone gap selection**

```ts
expect(depositPresets(jar({ balance: 2_000, target: 10_000 }), behindPace))
  .toEqual(expect.arrayContaining([{ kind: "milestone", amount: 500, level: 25 }]));
```

- [ ] **Step 2: Verify it fails, then implement only the selector behavior**

Run: `pnpm vitest run tests/savings-core.test.ts`

Expected: failure before the selector behavior is added, then PASS after it is added.

- [ ] **Step 3: Replace the manual amount input with an accessible keypad**

Render a 3×4 `Pressable` grid for digits, decimal point, and backspace. Keep `TextInput` for optional notes and recurring/edit forms. Limit entry to one decimal separator, two fraction digits, and seven numeric digits; reset errors after valid key input.

- [ ] **Step 4: Add goal-aware chips and preview**

Show the current balance, post-entry balance, and percent change. Pass the post-deposit percentage as `previewProgress` to `JarVessel`; show an inline milestone message when a deposit crosses 25/50/75/100%. Reject a withdrawal above balance before calling `addEntry`.

- [ ] **Step 5: Preserve existing detail behavior and validate**

Keep deep-linked deposit opening, recurring controls, archival menu, notification-related changes, and withdrawal undo. Run: `pnpm check; pnpm lint; pnpm vitest run tests/savings-core.test.ts`

Expected: all pass.

- [ ] **Step 6: Commit detail and vessel changes**

```bash
git add app/jar/[id].tsx components/jar-vessel.tsx lib/savings-core.ts tests/savings-core.test.ts
git commit -m "feat: add guided deposit flow"
```

### Task 4: Add templates and live creation math

**Files:**
- Modify: `app/jar/new.tsx`
- Modify: `lib/savings-core.ts`
- Modify: `tests/savings-core.test.ts`

**Interfaces:**
- Produces `savingRate(targetMinor, months): { perWeekMinor: number; perDayMinor: number }`.
- Consumes the current `addJar` input contract unchanged.

- [ ] **Step 1: Write a failing rate test**

```ts
expect(savingRate(12_000, 3)).toEqual({ perWeekMinor: 934, perDayMinor: 134 });
```

- [ ] **Step 2: Verify it fails**

Run: `pnpm vitest run tests/savings-core.test.ts`

Expected: failure because `savingRate` does not exist.

- [ ] **Step 3: Implement the integer-only rate helper and templates**

Add six in-file template constants (Emergency fund, Trip abroad, New laptop, No-spend days, Gift fund, Something else). Template selection must fill existing name, icon, target, accent, kind, and deadline state. Use an accessible native range/input control that works on web and native, six explicit timeline buttons, and display the helper's formatted per-week and per-day values in the preview.

- [ ] **Step 4: Verify test, type check, and lint**

Run: `pnpm vitest run tests/savings-core.test.ts; pnpm check; pnpm lint`

Expected: all pass.

- [ ] **Step 5: Commit creation flow**

```bash
git add app/jar/new.tsx lib/savings-core.ts tests/savings-core.test.ts
git commit -m "feat: add guided jar templates"
```

### Task 5: Turn Insights into a trend and consistency view

**Files:**
- Modify: `app/(tabs)/stats.tsx`
- Modify: `lib/savings-core.ts`
- Modify: `tests/savings-core.test.ts`

**Interfaces:**
- Consumes `depositTotalsByDay` and `depositTotalsByWeek` from Task 1.
- Displays a 12-week bar trend, 84-day heatmap, allocation rows, and count of jars with `paceProjection(jar).status === "behind"`.

- [ ] **Step 1: Write failing chart-series tests**

```ts
expect(depositTotalsByWeek([jar({ entries: [dep(500, 2)] })], 2, now)).toEqual([0, 500]);
expect(depositTotalsByDay([], 84, now)).toHaveLength(84);
```

- [ ] **Step 2: Verify the test fails**

Run: `pnpm vitest run tests/savings-core.test.ts`

Expected: failure until the series functions handle empty and dated input.

- [ ] **Step 3: Implement the derived views**

Replace the six-month monthly chart with a 12-week trend. Add an 84-cell deposit heatmap with four nonzero intensity levels, a compact allocation bar/list guarded against a zero total, and a need-attention tile. Keep the existing total, best streak, deposits, and closest-goal information where it remains useful.

- [ ] **Step 4: Verify the full selector and screen build**

Run: `pnpm vitest run tests/savings-core.test.ts; pnpm check; pnpm lint`

Expected: all pass.

- [ ] **Step 5: Commit Insights**

```bash
git add app/(tabs)/stats.tsx lib/savings-core.ts tests/savings-core.test.ts
git commit -m "feat: add saving trends and consistency insights"
```

### Task 6: Polish progress, activity, and celebration

**Files:**
- Modify: `app/jar/[id].tsx`
- Modify: `components/jar-vessel.tsx`

**Interfaces:**
- Consumes `groupEntriesByPeriod` and `PaceProjection`.
- Leaves the existing milestone callback and persisted milestone semantics unchanged.

- [ ] **Step 1: Write a failing activity-grouping test**

```ts
expect(groupEntriesByPeriod([todayEntry, previousEntry], now).map((group) => group.label))
  .toEqual(["Today", "This week"]);
```

- [ ] **Step 2: Verify it fails**

Run: `pnpm vitest run tests/savings-core.test.ts`

Expected: failure until group labels are derived correctly.

- [ ] **Step 3: Implement the detail polish**

Add 25/50/75 markers plus an expected-progress marker to the detail progress rail. Present pace as text with the required weekly amount, days remaining, and average deposit. Render activity group headers and use notes as titles when present. Add a short, reduced-motion-safe accent burst and spring entrance to the current celebration modal; do not change its dismissal or milestone trigger.

- [ ] **Step 4: Verify and smoke test**

Run: `pnpm test; pnpm check; pnpm lint`

Expected: all pass. Start the web app and verify Home, Insights, new jar, jar detail, deposit, withdrawal, and a milestone at viewport widths 390px and 1280px.

- [ ] **Step 5: Commit polish**

```bash
git add app/jar/[id].tsx components/jar-vessel.tsx lib/savings-core.ts tests/savings-core.test.ts
git commit -m "feat: polish jar progress and activity"
```

### Task 7: Final regression and documentation check

**Files:**
- Modify only if verification exposes a specific defect.

- [ ] **Step 1: Run the full verification suite**

Run: `pnpm test; pnpm check; pnpm lint`

Expected: all commands exit zero.

- [ ] **Step 2: Inspect the diff for scope**

Run: `git diff --check; git diff --stat; git status --short`

Expected: no whitespace errors, and changes limited to the redesign plus its tests/docs.

- [ ] **Step 3: Report the verification evidence**

State which commands passed and identify any pre-existing uncommitted files left untouched.
