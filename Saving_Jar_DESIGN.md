# Saving Jar — Detailed Product & UI Design Specification

> **Document purpose:** Design source of truth for the Saving Jar prototype and the future mobile Flutter implementation.
>
> **Current artifact:** The prototype is implemented in Lovable as a mobile-first web prototype. This document describes the intended product experience, current prototype structure, reusable visual system, and the design rules that should survive the transition to Flutter.

---

## 1. Product Definition

### 1.1 Product concept

Saving Jar is a visual savings app built around the metaphor of a physical jar: money is something tangible that accumulates, becomes visible, and eventually reaches a meaningful goal.

The MVP supports two saving mechanics:

- **Goal jars:** a named financial target such as `Japan Trip`, `Emergency Fund`, or `New Laptop`, optionally with a deadline.
- **Habit jars:** a repeated savings behavior such as a daily or weekly contribution, optionally supported by a streak.

A jar can also have a recurring contribution rule. Round-up savings and bank/card linking are **not part of the MVP** and should remain outside the current core flow.

### 1.2 Product principles

1. **Make saving feel physical.** Progress should look and feel like something accumulating in a real container.
2. **Keep money information obvious.** The visual layer is emotional, but the numeric amount and percentage are always explicit.
3. **Celebrate progress without becoming noisy.** Milestones should reward consistency, not distract from the user's goal.
4. **Reduce friction around the core loop.** Open jar → see progress → deposit → receive immediate feedback.
5. **Use a warm consumer-product language.** Avoid bank-dashboard aesthetics, dense tables, and overly corporate UI.
6. **Design for trust.** Financial figures must be clear, deterministic, and easy to understand.
7. **Be accessible without removing the personality.** Animation and color are enhancements, never the only source of meaning.

The original product plan emphasizes a warm, tactile visual identity, custom jar-fill animation, individualized jar colors/icons, expressive amount typography, haptics, milestone celebrations, and accessible numeric equivalents.

---

## 2. MVP Scope

### Included

- Onboarding
- Optional biometric lock concept
- Create / edit / delete jars
- Jar name, icon/emoji, color
- Target amount
- Optional deadline
- Manual deposits
- Manual withdrawals
- Transaction history
- Recurring deposits
- Daily / weekly / biweekly / monthly cadence
- Reminder-oriented habit UX
- Jar progress visualization
- 25% / 50% / 75% / 100% milestones
- Total saved summary
- Active jar summary
- Streak visibility for habit jars
- Stats
- Profile/settings
- Light and dark themes

### Deferred to v2

- Bank/card linking
- Automated round-up savings
- Shared/group jars
- Home-screen widgets
- CSV/export and monthly reporting

### Future growth

- Badges and challenges
- Multi-currency
- Interest/investment integrations

---

## 3. Primary User Journey

```text
Onboarding
   ↓
Create first jar
   ↓
Home / jars dashboard
   ↓
Open jar
   ├── Deposit
   ├── Withdraw
   ├── View history
   └── Configure recurring deposit
   ↓
Milestone celebration
   ↓
Return to jar / home
   ↓
Stats / Profile
```

### Core emotional loop

```text
Goal → Small contribution → Visible progress → Positive feedback → Repeat
```

The design should make the **smallest possible contribution feel meaningful**. The user should never need to open a complicated financial workflow to save a small amount.

---

# 4. Brand & Visual Direction

## 4.1 Personality

The product should feel:

- Warm
- Tactile
- Optimistic
- Calm
- Personal
- Rewarding
- Trustworthy
- Slightly playful

It should **not** feel:

- Like a spreadsheet
- Like an investment terminal
- Like a traditional banking portal
- Excessively gamified
- Childish
- Overly glossy or futuristic

## 4.2 Physical-material metaphor

The main visual language is:

**paper + glass + coins + liquid + soft light**

Use this hierarchy:

1. Neutral paper-like application background
2. Raised paper/card surfaces
3. Colorful semi-transparent jar shapes
4. A liquid/progress layer inside the jar
5. Small highlight/reflection details
6. Coins or particles only during meaningful interactions

The jar itself is the hero visual. Cards and charts should support it rather than compete with it.

---

# 5. Color System

The current prototype defines six semantic jar colors:

| Token | Meaning / Use |
|---|---|
| `jar-coral` | Energetic / personal goals |
| `jar-amber` | Habit / everyday saving |
| `jar-mint` | Safety / calm |
| `jar-ocean` | Travel / larger goal |
| `jar-berry` | Lifestyle / personal goals |
| `jar-clay` | Practical / neutral goal |

### Current design tokens

```text
jar-coral = oklch(0.72 0.16 28)
jar-amber = oklch(0.82 0.15 72)
jar-mint  = oklch(0.76 0.12 165)
jar-ocean = oklch(0.70 0.12 232)
jar-berry = oklch(0.66 0.15 340)
jar-clay  = oklch(0.68 0.09 45)
```

The exact color values should remain implementation details; the important rule is that every jar receives a distinct semantic accent while the application chrome stays neutral.

### Light theme

The light theme uses a warm off-white/paper background rather than pure white.

Primary characteristics:

- warm neutral page background
- dark brown/charcoal foreground
- nearly-white surfaces
- muted beige secondary surfaces
- warm borders
- dark primary actions

### Dark theme

Dark mode keeps the same warmth rather than switching to cold blue-black.

Primary characteristics:

- warm charcoal background
- warm light foreground
- elevated warm-gray surfaces
- subdued borders
- jar colors remain recognizable and bright

### Color rules

- Never communicate a jar's state by color alone.
- Always pair color with text, amount, icon, or shape.
- Use red/destructive styling only for actual destructive/error states.
- Do not use finance-red/finance-green conventions for every normal state.
- Keep the main UI neutral so jar colors visually pop.

---

# 6. Typography

The current prototype establishes two type families:

### Display / money type

`Fraunces`

Use for:

- total saved
- jar saved amount
- target amount
- milestone percentage
- major numeric callouts
- emotionally important titles

Money figures should feel like **physical printed numbers**, not spreadsheet cells.

### UI type

`Plus Jakarta Sans`

Use for:

- buttons
- labels
- helper text
- navigation
- metadata
- form fields
- transaction descriptions
- settings

### Typography rules

- Use tabular numerals for money.
- Tighten tracking on large monetary figures.
- Avoid all-caps for primary UI copy.
- Use hierarchy rather than excessive font weight.
- Keep paragraph/helper text compact but readable.
- Numeric progress must remain legible at a glance.

---

# 7. Shape, Radius & Surface System

The current prototype establishes a rounded system based around a default radius of approximately `1.25rem`.

### Recommended hierarchy

- Small control: `0.5–0.75rem`
- Standard field/button: `0.875–1rem`
- Card: `1.25rem`
- Hero card / modal: `1.5–2rem`
- Jar container: very rounded / organic

Avoid sharp rectangular blocks except where a table or dense data representation genuinely benefits from them.

### Elevation

Use soft, low-contrast shadows:

- **Card:** subtle separation from background
- **Jar:** stronger depth because it is the visual object
- **Modal / sheet:** strongest elevation

Avoid heavy black shadows.

The prototype uses three conceptual shadow levels:

- `shadow-card`
- `shadow-jar`
- `shadow-lift`

---

# 8. Motion System

Motion is part of the product identity.

## 8.1 Animation goals

Every animation should communicate at least one of:

- Money entering the jar
- Progress changing
- Milestone achieved
- Context transition
- Success confirmation

Do not animate unrelated UI simply to make the app feel busy.

## 8.2 Core motion primitives

The prototype defines these concepts:

### Fill rise

Used when a jar's liquid/progress level increases.

Behavior:

- starts slightly below final level
- gently scales into place
- settles with a tactile easing curve

### Coin drop

Used after a deposit.

Behavior:

- coin enters from above
- slight rotational movement
- settles with a subtle bounce

### Pop-in

Used for:

- new content
- modal/celebration
- newly achieved milestone indicators

### Float-up

Used for decorative reward particles or lightweight post-deposit effects.

### Shimmer

Used sparingly on elevated jar surfaces or highlight reflections.

## 8.3 Motion timing

Suggested range:

- Micro feedback: `150–250ms`
- Control/state transition: `200–350ms`
- Card/dialog entrance: `300–450ms`
- Jar fill: `700–1100ms`
- Celebration effects: `800–1500ms`

The prototype's tactile easing is approximately:

```text
cubic-bezier(0.22, 1.2, 0.36, 1)
```

## 8.4 Reduced motion

When reduced-motion accessibility is enabled:

- stop particle animation
- replace jar fill animation with a fast/instant transition
- remove decorative bouncing
- keep the numeric value update
- keep milestone confirmation, but use opacity/scale transition only

---

# 9. Jar Visual Design

## 9.1 Jar anatomy

A jar component should contain:

```text
┌───────────────────────┐
│   glass highlight     │
│                       │
│       emoji/icon      │
│                       │
│      liquid fill      │
│~~~~~~~~~~~~~~~~~~~~~~~│ ← progress surface
│                       │
│                       │
└─────────┬─────────────┘
          │ base
```

### Layers

1. Outer glass silhouette
2. Colored glow
3. Internal liquid/progress fill
4. Surface highlight
5. Optional coin/deposit effect
6. Icon/emoji
7. Numeric progress text

### Accessibility rule

The jar image must **never be the only progress indicator**.

Always pair it with:

```text
Saved: EGP 2,685
Target: EGP 4,200
64%
```

---

# 10. Core Screens

## 10.1 Onboarding

### Purpose

Explain the concept quickly and lead the user to creating the first jar.

### Structure

1. Brand / app identity
2. Visual jar hero
3. One-sentence value proposition
4. Primary CTA: `Create your first jar`
5. Secondary option where appropriate

### Tone

Avoid a long tutorial. The user should reach the first meaningful action quickly.

### Recommended messaging

- “Give your goals somewhere to grow.”
- “Save for what matters, one deposit at a time.”

Avoid promising financial returns or investment performance.

---

## 10.2 First Jar Creation

This is a **guided moment**, not a generic CRUD form.

### Step 1 — What are you saving for?

Examples:

- Japan Trip
- Emergency Fund
- New Laptop
- Espresso Machine

Allow a custom name.

### Step 2 — Pick an icon

Emoji/icon is a personality layer.

### Step 3 — Choose jar color

Display six color swatches as tactile chips.

### Step 4 — Set target

Large amount input using a number pad.

### Step 5 — Optional deadline

Allow the user to skip it.

### Step 6 — Create

Show a small preview of the completed jar before committing.

### Important design behavior

Do not overwhelm the user with secondary configuration during first creation. Recurring contributions can be introduced after the jar exists.

---

# 11. Home / Dashboard

## 11.1 Objective

The home screen should answer immediately:

- How much have I saved?
- What am I saving for?
- Which jars need attention?
- What is my next saving action?

### Suggested hierarchy

```text
Greeting
↓
Total saved
↓
Small supporting metric
↓
Jar grid/list
↓
Primary add action
```

### Total saved hero

Use the expressive display amount.

Example:

```text
You've saved

EGP 417,300

across 4 jars
```

### Jar card

Each card should expose:

- icon
- name
- jar type
- saved amount
- target
- progress percentage
- optional deadline
- optional streak
- recurring indicator when active

Avoid making the user open a jar just to understand its status.

---

# 12. Jar Detail

The jar detail page is the center of the core loop.

## 12.1 Header

- back
- jar icon
- jar name
- overflow/edit action

## 12.2 Hero jar

Large jar visualization with:

- current liquid level
- saved amount
- target
- percentage
- deadline when present

## 12.3 Primary actions

Two clear actions:

- `Deposit`
- `Withdraw`

Deposit should visually have the highest emphasis.

## 12.4 Progress summary

Example:

```text
64% complete
EGP 2,685 saved
EGP 1,515 to go
```

## 12.5 Recurring contribution card

When configured:

```text
EGP 120 every week
Next save: Tuesday
[Edit]
```

When not configured:

```text
Build the habit
Set up a recurring deposit
```

## 12.6 Transaction history

Each item:

- date
- description/note
- automatic/manual indicator
- signed amount

Deposits and withdrawals should be visually distinguishable without relying only on green/red.

---

# 13. Deposit Flow

## 13.1 Number input

The current prototype includes an `AmountPad`.

The input should feel intentional and large.

### Layout

```text
        EGP 250

      [ number pad ]

[ optional note ]

       Add to jar
```

### Rules

- Keep currency visible.
- Prevent ambiguous negative input.
- Allow optional note.
- Provide immediate validation.
- Confirm the transaction visually without requiring a secondary confirmation dialog for normal valid deposits.

### Success behavior

On submit:

1. amount updates
2. jar liquid rises
3. optional coin-drop effect
4. haptic feedback on mobile
5. milestone check runs
6. milestone celebration appears if needed

---

# 14. Withdrawal Flow

Withdrawal is deliberately secondary to deposit.

### Design intent

The app should never make the user feel punished for using their savings.

Use calm language:

- `Withdraw`
- `Take money out`
- `Amount`

Avoid language implying failure.

### Validation

The amount cannot exceed the current jar balance.

Show the resulting balance before submission when useful.

---

# 15. Recurring Deposit

## Goal

Turn intention into habit.

### Fields

- amount
- cadence
- next date
- active/inactive status

### Cadences supported

- Daily
- Weekly
- Biweekly
- Monthly

### Suggested interaction

```text
Save automatically

EGP 500
Every week
Next deposit: Friday

[ Enable recurring saving ]
```

### Habit-specific support

When used with a habit jar, show streak context:

```text
🔥 12-day saving streak
```

Do not make streaks the primary financial metric.

---

# 16. Milestone Celebration

Milestones are:

- 25%
- 50%
- 75%
- 100%

## Celebration anatomy

1. Strong percentage
2. Jar visual
3. Short congratulatory sentence
4. Optional particle/confetti treatment
5. Continue CTA

Example:

```text
50% 🎉

Halfway there.

Japan Trip
EGP 2,100 / EGP 4,200

[ Keep saving ]
```

### 100% completion

The completion state should feel meaningfully different but not excessive.

Possible UI:

- full jar
- stronger glow
- completion badge
- concise celebration
- next-step suggestion such as “Create another jar”

Do not display investment/return messaging.

---

# 17. Stats Screen

The stats page should remain simple in MVP.

### Primary metrics

- Total saved
- Active jars
- Completed jars
- Current saving streak

### Suggested visualizations

- contribution trend over time
- progress by jar
- deposit frequency

Avoid a complicated financial analytics dashboard.

### Chart rules

- neutral chart base
- jar colors can map to jar series
- numeric summaries accompany charts
- labels remain understandable without hovering

---

# 18. Profile / Settings

### Sections

#### Account
- profile
- sign-in/auth state

#### App
- light/dark/system theme
- notifications
- biometric lock

#### Preferences
- default currency
- reminder behavior

#### Support
- privacy
- terms
- help/about

Keep destructive actions at the bottom and clearly separated.

---

# 19. Navigation

The prototype uses a mobile-oriented navigation model.

Recommended primary destinations:

```text
Home
Stats
Profile
```

The jar itself is entered from Home.

A prominent floating/add action can be used for:

- Create jar
- Quick deposit

However, avoid having multiple competing floating actions.

---

# 20. Responsive Behavior

The prototype is mobile-first even though it is rendered as a web prototype.

### Mobile

- single-column layout
- bottom navigation
- full-width primary action
- horizontal scrolling only when genuinely useful
- large touch targets

### Tablet

- wider card grid
- centered content column
- slightly larger jar visualization

### Desktop prototype

The app should retain the feel of a phone product rather than becoming a generic dashboard.

Recommended approach:

```text
wide viewport
    ↓
centered app canvas / responsive content shell
    ↓
mobile-inspired interaction hierarchy
```

Do not simply stretch the mobile card grid across the entire desktop screen.

---

# 21. Component System

The current prototype already contains reusable domain components. The design system should preserve this modularity.

## Jar components

### `JarVessel`

Responsible for the physical jar visualization.

Inputs conceptually include:

- color
- progress
- icon
- size
- animation state
- accessibility label

### `JarCard`

Compact jar summary for Home.

### `ProgressBar`

Accessible numeric-friendly linear progress representation.

---

## Prototype interaction components

### `AmountPad`

Reusable money input.

### `MilestoneCelebration`

Reusable milestone feedback overlay/screen.

### `BottomNav`

Primary mobile navigation.

### `ScreenHeader`

Consistent page title/action area.

### `PhoneShell`

Prototype-specific wrapper for presenting the app as a mobile product.

---

# 22. Domain/Data Model

The current prototype already mirrors the intended domain using four core concepts:

```text
Jar
Txn
RecurringRule
Milestone
```

## Jar

Conceptual fields:

```text
id
name
emoji
color
kind
target
saved
createdAt
deadline?
recurring?
streak?
milestonesHit[]
```

Where:

```text
kind = goal | habit
color = coral | amber | mint | ocean | berry | clay
target = money value
saved = money value
```

## Transaction

```text
id
jarId
amount
date
note?
auto?
```

The prototype uses the convention:

```text
positive amount = deposit
negative amount = withdrawal
```

For the production Flutter app, consider representing transaction type explicitly as:

```text
transactionType = deposit | withdrawal
```

while still storing an integer money amount rather than floating-point currency.

## RecurringRule

```text
amount
cadence
nextDate
active
```

Cadence:

```text
daily
weekly
biweekly
monthly
```

## Milestone

The MVP uses milestone thresholds:

```text
25
50
75
100
```

A production implementation may normalize these into records if milestone history becomes richer.

---

# 23. Flutter Translation Guidance

The prototype is currently a React/TypeScript/TanStack Start implementation. It is a **visual/product prototype**, not the final Flutter codebase.

The future Flutter app should preserve the design system, not the React component names verbatim.

## Suggested Flutter structure

```text
lib/
├── app/
│   ├── app.dart
│   ├── router.dart
│   └── theme/
│       ├── app_colors.dart
│       ├── app_typography.dart
│       ├── app_spacing.dart
│       ├── app_radii.dart
│       └── app_motion.dart
│
├── core/
│   ├── currency/
│   ├── formatting/
│   ├── accessibility/
│   └── storage/
│
├── features/
│   ├── onboarding/
│   ├── jars/
│   │   ├── data/
│   │   ├── domain/
│   │   └── presentation/
│   ├── deposits/
│   ├── recurring/
│   ├── stats/
│   └── profile/
│
└── shared/
    ├── widgets/
    │   ├── jar_vessel.dart
    │   ├── jar_card.dart
    │   ├── amount_pad.dart
    │   ├── progress_indicator.dart
    │   └── milestone_celebration.dart
    └── animations/
```

## State management

The original plan suggests Riverpod or Bloc.

For a feature-heavy but still relatively compact MVP, Riverpod is a strong fit if the team wants:

- simple dependency injection
- testable providers
- predictable state boundaries
- easy UI subscriptions

Do not let UI widgets become the source of truth for financial calculations.

---

# 24. Production Data/Architecture Direction

The original plan recommends:

- Flutter
- Riverpod or Bloc
- Supabase or Firebase
- Supabase Auth or Firebase Auth
- FCM for notifications
- PostHog or Firebase Analytics
- Codemagic or GitHub Actions + Fastlane
- local-first persistence using SQLite/Drift as an option

For a money-tracking product, the architecture should be local-first enough that temporary network failure does not destroy confidence.

### Important implementation rule

Money should never be represented as a floating-point number.

Prefer an integer minor-unit representation:

```text
EGP 25.50 → 2550
```

The exact minor-unit strategy can depend on the supported currencies when multi-currency is introduced.

---

# 25. Accessibility

## Required

- minimum comfortable touch targets
- visible focus states
- semantic labels for jar controls
- accessible progress text
- sufficient contrast
- screen-reader-friendly transaction descriptions
- reduced-motion mode

## Progress accessibility

Never announce only:

```text
A jar that is 64% full
```

Prefer:

```text
Japan Trip. 64% complete. EGP 2,685 saved out of EGP 4,200.
```

The visual jar is a supplement to this information.

---

# 26. Empty States

Empty states are especially important because the app's first interaction is emotional.

## No jars

Show:

- empty jar illustration
- one-line explanation
- primary CTA to create first jar

Example:

```text
Your first goal deserves a jar.

Start small. Give it somewhere to grow.

[ Create a jar ]
```

## No transaction history

```text
Nothing saved yet.
Your deposits will appear here.
```

## No recurring rule

```text
Make saving automatic.
Set a daily, weekly, or monthly contribution.
```

---

# 27. Error States

Errors should be calm and actionable.

### Invalid amount

```text
Enter an amount greater than EGP 0.
```

### Withdrawal above balance

```text
You can withdraw up to EGP 2,685 from this jar.
```

### Missing target

```text
Add a target amount to see your progress.
```

### Recurring setup failure

```text
We couldn't save this schedule.
Your jar balance hasn't changed.
```

The last statement is important in a financial product: clearly separate failed setup from successful money movement.

---

# 28. Microcopy Rules

Use:

- `Save`
- `Deposit`
- `Withdraw`
- `Target`
- `Saved`
- `To go`
- `Complete`
- `Next deposit`
- `Saving streak`

Avoid:

- complicated financial terminology
- “portfolio”
- “yield”
- “returns”
- “investment performance”

unless those concepts become actual supported features later.

### Tone

Short, encouraging, factual.

Good:

> “You’re halfway there.”

Avoid:

> “You are absolutely crushing your financial goals!!! 🚀🔥”

The product should feel mature enough to trust with money.

---

# 29. Financial UX Rules

1. Every monetary value must show currency context when ambiguity is possible.
2. The user must understand whether an action adds or removes money.
3. Withdrawals must never accidentally look like deposits.
4. Automatic/recurring deposits must clearly say they are scheduled.
5. A visual animation must not imply a transaction has happened before the underlying state is committed.
6. Completion celebrations should only trigger after the milestone is actually reached.
7. The UI must never imply guaranteed financial returns.
8. Round-ups/bank linking remain outside the MVP.

---

# 30. Prototype-to-Production Mapping

| Prototype concept | Flutter production equivalent |
|---|---|
| `JarVessel` | `JarVessel` widget |
| `JarCard` | `JarCard` widget |
| `AmountPad` | `AmountPad` widget |
| `MilestoneCelebration` | `MilestoneCelebration` widget |
| `BottomNav` | app navigation shell |
| `ScreenHeader` | shared page header |
| `prototype-store` | repositories + providers/state management |
| seeded demo jars | local/test fixtures |
| prototype transaction mutation | repository/service transaction command |
| theme tokens | Flutter `ThemeData` + custom extensions |
| CSS animations | Flutter `AnimationController` / implicit animations |

---

# 31. Design QA Checklist

Before approving a screen:

### Visual

- [ ] Does the jar remain the visual focus?
- [ ] Is the UI warm rather than bank-like?
- [ ] Are jar colors visually distinct?
- [ ] Is typography hierarchy obvious?
- [ ] Are surfaces and shadows subtle?

### UX

- [ ] Is the primary action obvious?
- [ ] Can the user understand the state without opening another screen?
- [ ] Are financial values unambiguous?
- [ ] Are errors recoverable?
- [ ] Is the next action obvious?

### Accessibility

- [ ] Is progress available numerically?
- [ ] Is color supported by text/icon?
- [ ] Are controls touch-friendly?
- [ ] Does reduced motion work?

### Motion

- [ ] Does animation explain a state change?
- [ ] Is the animation fast enough?
- [ ] Is there a reduced-motion alternative?
- [ ] Does the animation happen after state confirmation?

---

# 32. Design Priorities

When trade-offs occur, use this order:

```text
1. Financial clarity
2. Core saving flow usability
3. Trust / predictability
4. Accessibility
5. Jar visual identity
6. Motion polish
7. Decorative detail
```

A beautiful jar that makes the balance unclear is a failed design.

---

# 33. Current Prototype Status

The current Lovable prototype includes routes/components corresponding to:

```text
Home
New Jar
Jar Detail
Recurring Deposit
Stats
Profile
```

It also includes reusable implementation pieces for:

```text
JarVessel
JarCard
ProgressBar
AmountPad
MilestoneCelebration
BottomNav
ScreenHeader
PhoneShell
```

The prototype's internal store currently models:

```text
Jar
Txn
RecurringRule
Celebration
```

and uses seeded example jars/transactions to demonstrate the experience.

This is intentionally a **prototype data layer**, not a production persistence model.

---

# 34. Source / Scope Notes

This design document is grounded primarily in:

- the supplied Saving Jar project plan
- the current Lovable prototype structure and design tokens

Where this document proposes production Flutter architecture, accessibility implementation details, or implementation conventions beyond the prototype, those sections are design recommendations rather than facts already implemented in the prototype.

The original project plan explicitly recommends validating wireframes/prototypes before building the Flutter foundation and placing bank-linked round-ups in v2 due to regional/compliance complexity.

---

# 35. Final Design North Star

> **Saving should feel like watching something real grow.**

The app should make a user feel three things repeatedly:

**I know what I'm saving for.**

**I can see myself getting closer.**

**Making the next contribution feels easy.**

Everything else exists to support that loop.
