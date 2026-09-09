# Jarly S-Tier UI/UX Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Option A system polish + 3 delights so Home, Detail, sheets, and Insights feel premium on iOS and Android in light + dark.

**Architecture:** Fix tokens/typography first, then introduce one shared `Sheet` (Modal + reanimated, no new dep), then rework Home CTA/cards, deposit takeover, and chart/profile hygiene. Pure helper (`jar-ink`) is unit-tested; UI tasks verify via `pnpm check` + existing Vitest suite + manual checklist.

**Tech Stack:** Expo Router, React Native + Reanimated + gesture-handler (already installed), NativeWind, Vitest (node env).

**Spec:** `docs/superpowers/specs/2026-09-09-jarly-s-tier-uiux-design.md`

## Global Constraints

- Package manager is `pnpm` only (9.12 pinned). Never npm/yarn.
- Money stays integer minor units via `toMinor`/`fromMinor`/`money` from `lib/savings-core.ts`.
- Withdrawals never roll back milestones or streaks.
- `reminders.ts` / `notifications.ts` guards stay in sync — do not touch them.
- No feature code in `*_core/` dirs, `server/`, `drizzle/`, `ios/`, `android/`.
- No new dependencies (no `@gorhom/bottom-sheet`, no chart lib, no font files). Reuse `Fonts` from `@/lib/_core/theme`, reanimated, gesture-handler.
- New colors need both light and dark tokens — this plan adds none.
- Before finishing any change: `pnpm check` and `pnpm test` must pass.
- `ios/` and `android/` are generated — never edit.

---

### Task 1: Ink-on-accent helper (pure, tested)

**Files:**
- Create: `lib/jar-ink.ts`
- Test: `tests/jar-ink.test.ts`

**Interfaces:**
- Consumes: nothing (pure string math).
- Produces: `inkOnAccent(accentHex: string): string` — `#RRGGBB` in, darkened `#RRGGBB` out. Used by Tasks 3, 5, 6.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from "vitest";
import { inkOnAccent } from "../lib/jar-ink";

describe("inkOnAccent", () => {
  it("darkens amber toward cocoa ink", () => {
    expect(inkOnAccent("#E5B847")).toBe("#aa883a");
  });
  it("passes through invalid input unchanged", () => {
    expect(inkOnAccent("ocean")).toBe("ocean");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test tests/jar-ink.test.ts`
Expected: FAIL with "Failed to resolve import ../lib/jar-ink"

- [ ] **Step 3: Write minimal implementation**

```ts
// Darkens an accent hex toward cocoa ink (#2C231D) so text on tint passes contrast.
export function inkOnAccent(accentHex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(accentHex.trim());
  if (!m) return accentHex;
  const ink = [0x2c, 0x23, 0x1d];
  const hex = m[1].toLowerCase();
  const rgb = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const mixed = rgb.map((v, i) => Math.round(v * 0.68 + ink[i] * 0.32));
  return "#" + mixed.map((v) => v.toString(16).padStart(2, "0")).join("");
}
```

Note: amber `#E5B847` mixes to `#aa883a` (E5→aa, B8→88, 47→3a). Test expects exactly that.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test tests/jar-ink.test.ts`
Expected: PASS (2 passed)

- [ ] **Step 5: Commit**

```bash
git add lib/jar-ink.ts tests/jar-ink.test.ts
git commit -m "feat: add inkOnAccent for chip text contrast"
```

### Task 2: Typography — kill hardcoded Georgia

**Files:**
- Modify: `app/(tabs)/index.tsx` (greeting, sectionTitle, balanceValue, emptyTitle)
- Modify: `app/jar/[id].tsx` (heroName, amount)
- Modify: `app/(tabs)/stats.tsx` (title, trendTotal, metricValue)
- Modify: `app/(tabs)/activity.tsx` (title, emptyTitle)
- Modify: `app/(tabs)/profile.tsx` (title, monogramText, sheetTitle)

**Interfaces:**
- Consumes: `Fonts` from `@/lib/_core/theme` (already exported via `@/constants/theme`).
- Produces: no new API; visual parity with system serif on both platforms.

- [ ] **Step 1: Add the import to each file (no behavior change yet)**

```ts
import { Fonts } from "@/constants/theme";
```

- [ ] **Step 2: Replace every `fontFamily: "Georgia"` with `fontFamily: Fonts.serif`**

In each `makeStyles` block, e.g. `app/(tabs)/index.tsx`:
```ts
// before
greeting: { color: c.foreground, fontFamily: "Georgia", fontSize: 29, ... },
// after
greeting: { color: c.foreground, fontFamily: Fonts.serif, fontSize: 29, ... },
```
Do all ~10 occurrences across the 5 files. `grep -rn 'Georgia' app/` must return empty after.

- [ ] **Step 3: Verify typecheck + tests**

Run: `pnpm check`
Expected: PASS (no errors)
Run: `pnpm test`
Expected: PASS (existing suite untouched)

- [ ] **Step 4: Manual check (Expo web + one native)**

Open Home / Detail / Insights / Activity / Profile in light + dark. Serif renders on iOS, Android (system `serif`), web (Georgia). No layout shift.

- [ ] **Step 5: Commit**

```bash
git add app/\(tabs\)/index.tsx "app/jar/[id].tsx" app/\(tabs\)/stats.tsx app/\(tabs\)/activity.tsx app/\(tabs\)/profile.tsx
git commit -m "style: use Fonts.serif instead of hardcoded Georgia"
```

### Task 3: Button + heatmap contrast fixes

**Files:**
- Modify: `app/(tabs)/index.tsx` (balanceCard, quickAdd removed later — here only recolor to `c.primary`; chip text to `inkOnAccent`)
- Modify: `app/jar/[id].tsx` (deposit button bg `c.primary`; `heroProgress` + entry amounts via `inkOnAccent`; entry icons `south/north` → `add/remove`)
- Modify: `app/(tabs)/stats.tsx` (heatmap scale from `c.success`; allocation bar `minWidth`)
- Modify: `app/(tabs)/activity.tsx` (same icon swap + `inkOnAccent` amounts)

**Interfaces:**
- Consumes: `inkOnAccent` from Task 1, `useColors()` palette.
- Produces: no new API.

- [ ] **Step 1: Recolor hardcoded cocoa buttons to theme primary**

```ts
// before (index.tsx balanceCard/quickAdd, [id].tsx deposit)
backgroundColor: "#3B2D24"
// after
backgroundColor: c.primary
```
Button text stays `#FFFDF9` in both schemes. Verify dark mode: `#9C6C53` + white text.

- [ ] **Step 2: Chip/amount text via inkOnAccent**

```tsx
import { inkOnAccent } from "@/lib/jar-ink";
// before
<Text style={[styles.quickAddChipText, { color: accent }]}>+ Add</Text>
// after
<Text style={[styles.quickAddChipText, { color: inkOnAccent(accent) }]}>+ Add</Text>
```
Apply to: Home chip, detail `heroProgress`, detail + activity entry amounts (`color: isDeposit ? inkOnAccent(accent) : colors.error`).

- [ ] **Step 3: Heatmap + allocation (stats.tsx)**

```tsx
// before
const backgroundColor = amount === 0 ? colors.border : ratio < .25 ? "#CFE8DD" : ratio < .5 ? "#9AD3B9" : ratio < .8 ? "#5FB894" : colors.success;
// after
const backgroundColor = amount === 0 ? colors.border : ratio < .25 ? `${colors.success}38` : ratio < .5 ? `${colors.success}73` : ratio < .8 ? `${colors.success}BF` : colors.success;
```
Allocation bar: each segment `style={{ flex: jar.balance, minWidth: 6, backgroundColor: accents[jar.accent] }}`, remove `gap: 2` from `allocationBar`.

- [ ] **Step 4: Entry icons**

```tsx
// before
<MaterialIcons name={isDeposit ? "south" : "north"} ... />
// after
<MaterialIcons name={isDeposit ? "add" : "remove"} ... />
```
In both `[id].tsx` and `activity.tsx`.

- [ ] **Step 5: Verify**

Run: `pnpm check`
Expected: PASS
Run: `pnpm test`
Expected: PASS. Manual: dark-mode screenshots of all four screens; amber jar chip legible.

- [ ] **Step 6: Commit**

```bash
git add app/\(tabs\)/index.tsx "app/jar/[id].tsx" app/\(tabs\)/stats.tsx app/\(tabs\)/activity.tsx
git commit -m "style: fix button/heatmap/chip contrast for dark mode"
```

### Task 4: Shared Sheet + deposit/withdraw migration

**Files:**
- Create: `components/sheet.tsx`
- Modify: `app/jar/[id].tsx` (deposit/withdraw modal → Sheet; split `error` state per sheet)

**Interfaces:**
- Consumes: reanimated, `useReducedMotion`.
- Produces: `Sheet({visible, onClose, children, label}: {visible: boolean; onClose: () => void; children: React.ReactNode; label: string})` — backdrop-tap closes, slide-up enter, `accessibilityViewIsModal`.

- [ ] **Step 1: Create `components/sheet.tsx`**

```tsx
import { useEffect } from "react";
import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring, withTiming } from "react-native-reanimated";
import { useColors } from "@/hooks/use-colors";

export function Sheet({ visible, onClose, children, label }: { visible: boolean; onClose: () => void; children: React.ReactNode; label: string }) {
  const colors = useColors();
  const reduce = useReducedMotion();
  const y = useSharedValue(60);
  const opacity = useSharedValue(0);
  useEffect(() => {
    if (!visible) return;
    y.value = reduce ? withTiming(0, { duration: 90 }) : withSpring(0, { damping: 26, stiffness: 260 });
    opacity.value = withTiming(1, { duration: 150 });
  }, [visible, y, opacity, reduce]);
  const body = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return (
    <Modal transparent animationType="none" visible={visible} onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, fade]}>
          <Pressable accessibilityLabel="Close dialog" onPress={onClose} style={StyleSheet.absoluteFill} />
        </Animated.View>
        <Animated.View accessibilityViewIsModal accessibilityLabel={label} style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }, body]}>
          <View style={styles.handle} />
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(0,0,0,.35)" },
  backdrop: { ...StyleSheet.absoluteFillObject },
  card: { borderTopLeftRadius: 28, borderTopRightRadius: 28, borderWidth: 1, borderBottomWidth: 0, padding: 20, paddingBottom: 28, maxHeight: "92%" },
  handle: { alignSelf: "center", width: 40, height: 4, borderRadius: 999, backgroundColor: "rgba(120,110,100,.4)", marginBottom: 12 },
});
```

- [ ] **Step 2: Migrate deposit/withdraw modal in `[id].tsx`**

Replace `<Modal transparent animationType="slide" visible={Boolean(direction)} ...>` wrapper with `<Sheet visible={Boolean(direction)} onClose={() => { setDirection(null); setSheetError(""); }} label={direction === "deposit" ? "Add to jar" : "Take money out"}>`. Split shared `error`: add `const [sheetError, setSheetError] = useState("")` for the amount sheet; keep existing `error` for recurring/edit. Replace `setError` calls inside `record()` amount validation with `setSheetError`.

- [ ] **Step 3: Verify**

Run: `pnpm check`
Expected: PASS
Run: `pnpm test`
Expected: PASS. Manual: open deposit via Home chip + detail button; backdrop tap closes; validation error shows per-sheet and clears on close; withdraw over-balance error correct.

- [ ] **Step 4: Commit**

```bash
git add components/sheet.tsx "app/jar/[id].tsx"
git commit -m "feat: shared bottom sheet for deposit flow"
```

### Task 5: Home — one CTA + inline chip + skeleton

**Files:**
- Modify: `app/(tabs)/index.tsx`
- Create: `components/empty-state.tsx` (skeleton + empty card shared by Home/Activity)

**Interfaces:**
- Consumes: `Sheet` (no), `inkOnAccent` (Task 1), existing `depositPresets`/`paceProjection`/`percent`.
- Produces: `EmptyState({title, copy, ctaLabel, onCta})` + `JarSkeleton()` used here; Activity reuses in Task 7.

- [ ] **Step 1: Delete floating FAB, upgrade nextAction CTA**

Delete the `{nextJar ? <Pressable style={styles.quickAdd} ...>Add money</...> : null}` block at bottom of `HomeScreen` and `quickAdd/quickAddText` styles. Change `nextCta` text: `{behind ? "Catch up" : `Add · ${format(usual)}`}` where `const usual = depositPresets(nextJar, nextPace).find(p => p.kind === "usual")?.amount`. Fallback `"Add"`.

- [ ] **Step 2: Inline GoalCard chip**

```tsx
// before: goalCopy has paddingRight:42, chip absolute right:12 top:50%
// after styles:
goalCopy: { flex: 1, alignSelf: "stretch", justifyContent: "center" },
quickAddChip: { borderRadius: 11, paddingHorizontal: 11, minHeight: 44, justifyContent: "center" },
// JSX: chip becomes sibling after goalCopy inside goalCard row (remove absolute positioning)
```
Track `height: 5 → 8` + tip dot: add `<View style={[styles.trackTip, { left: `${progress}%`, backgroundColor: accent }]} />` with `trackTip: { position: "absolute", top: -2, width: 12, height: 12, borderRadius: 999, marginLeft: -6 }`.

- [ ] **Step 3: Skeleton loading**

```tsx
import { Pressable, Text, View } from "react-native";
import { useColors } from "@/hooks/use-colors";

export function EmptyState({ title, copy, ctaLabel, onCta }: { title: string; copy: string; ctaLabel: string; onCta: () => void }) {
  const colors = useColors();
  return (
    <View style={{ backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 26, padding: 26, alignItems: "center" }}>
      <Text style={{ color: colors.foreground, fontSize: 22, fontWeight: "800", marginTop: 6, textAlign: "center" }}>{title}</Text>
      <Text style={{ color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 8 }}>{copy}</Text>
      <Pressable onPress={onCta} style={{ backgroundColor: colors.primary, minHeight: 52, borderRadius: 16, marginTop: 18, alignSelf: "stretch", alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: "#FFFDF9", fontSize: 14, fontWeight: "800" }}>{ctaLabel}</Text>
      </Pressable>
    </View>
  );
}

export function JarSkeleton() {
  const colors = useColors();
  return <View style={{ height: 114, borderRadius: 22, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, opacity: 0.7 }} />;
}
```
// in HomeScreen:
if (!ready) return <ScreenContainer><View style={{ padding: 20, gap: 12 }}><JarSkeleton /><JarSkeleton /><JarSkeleton /></View></ScreenContainer>;
```
(Pulse animation added only if trivial with reanimated; static skeleton acceptable v1.)

- [ ] **Step 4: Verify + commit**

Run: `pnpm check` → PASS; `pnpm test` → PASS. Manual: 320dp width chip never overlaps name; single CTA path Home→deposit works from card chip + nextAction; loading shows skeletons.
```bash
git add app/\(tabs\)/index.tsx components/empty-state.tsx
git commit -m "feat: home single CTA, inline chip, skeleton loading"
```

### Task 6: Keypad + deposit takeover + toast offset

**Files:**
- Modify: `components/amount-keypad.tsx` (56dp keys, gap 8, long-press clear)
- Modify: `app/jar/[id].tsx` (live preview line, celebration takeover, per-sheet error from Task 4)
- Modify: `components/toast.tsx` (`bottom: 24 → 96`)

**Interfaces:**
- Consumes: `Sheet` (Task 4), `inkOnAccent` (Task 1).
- Produces: no new API.

- [ ] **Step 1: Keypad targets**

```ts
// before
grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 5 },
key: { width: "32.2%", height: 45, borderRadius: 13, ... },
// after
grid: { flexDirection: "row", flexWrap: "wrap", marginTop: 10, gap: 8 },
key: { width: "31.8%", height: 56, borderRadius: 14, ... },
```
Add long-press clear on backspace: wrap backspace `Pressable` with `onLongPress={() => onChange("")}`.

- [ ] **Step 2: Live preview line in amount sheet**

Below `sheetAmount`, when `depositPreview !== null`:
```tsx
<Text style={styles.previewBalance}>
  {format(jar.balance)} → {format(depositPreview)} · {depositPreviewPct}%{milestonePreview ? ` · reaches ${milestonePreview}%` : ""}
</Text>
```
Uses existing `depositPreview`/`depositPreviewPct`/`milestonePreview` memos. Withdraw keeps `Leaves {format(withdrawPreview)}`.

- [ ] **Step 3: Celebration takeover copy (keep existing modal mechanics)**

Change celebration title/copy to include jar name + level (already does); enlarge CTA to `minHeight: 52`; gate any new confetti dots on `!reduceCelebration`. No new lib. Keep snapshot `{level, progress}` truthfulness comment.

- [ ] **Step 4: Toast offset**

```ts
// before
wrap: { position: "absolute", left: 20, right: 20, bottom: 24, ... },
// after
wrap: { position: "absolute", left: 20, right: 20, bottom: 96, ... },
```

- [ ] **Step 5: Verify + commit**

Run: `pnpm check` → PASS; `pnpm test` → PASS. Manual: deposit → coin drop + takeover + Keep saving; withdraw → toast + Undo restores with audit note; keypad long-press clears.
```bash
git add components/amount-keypad.tsx "app/jar/[id].tsx" components/toast.tsx
git commit -m "feat: keypad targets, deposit preview, takeover polish"
```

### Task 7: Insights/Activity/Profile hygiene

**Files:**
- Modify: `app/(tabs)/stats.tsx` (empty state for zero bars, tap labels — already has `accessibilityLabel` on heat days; add to bars)
- Modify: `app/(tabs)/activity.tsx` (All/Deposits/Withdrawals filter chips reusing `EmptyState`)
- Modify: `app/(tabs)/profile.tsx` (currency + PIN overlays → `Sheet`; `themeChoice minHeight: 40 → 48`; monogram → first active jar emoji)

**Interfaces:**
- Consumes: `Sheet` (Task 4), `EmptyState` (Task 5).
- Produces: nothing new.

- [ ] **Step 1: Insights zero-state + bar labels**

```tsx
{weekly.every((v) => v === 0) ? (
  <Text style={styles.heatCaption}>Your rhythm starts with the first deposit.</Text>
) : null}
```
Each bar column gets `accessibilityLabel={`${format(value)} saved`}`.

- [ ] **Step 2: Activity filter chips (pure, no store change)**

```tsx
const [filter, setFilter] = useState<"all" | "deposit" | "withdrawal">("all");
const rows = jars.filter(...).flatMap(...).filter((r) => filter === "all" || r.entry.direction === filter).sort(...);
```
Chips row above groups; reuses existing `grouped` logic. Empty filter result uses `EmptyState`.

- [ ] **Step 3: Profile sheet migration + targets**

Replace `sheetOverlay/sheetCard` blocks for currency + PIN with `<Sheet visible={...} onClose={...} label="...">`, delete old overlay styles. `themeChoice: { minHeight: 48 }`. Monogram: `const monogramEmoji = jars.find(j => !j.archived)?.icon` — if set show emoji `Text`, else `SJ`.

- [ ] **Step 4: Verify + commit**

Run: `pnpm check` → PASS; `pnpm test` → PASS. Manual: full light+dark pass all 5 tabs; filter chips; currency + PIN sheets open/close via backdrop.
```bash
git add app/\(tabs\)/stats.tsx app/\(tabs\)/activity.tsx app/\(tabs\)/profile.tsx
git commit -m "feat: insights/activity/profile hygiene + sheet migration"
```
