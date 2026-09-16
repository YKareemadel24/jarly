# Saving Jar — Mobile Interface Design Plan

## Experience direction

Saving Jar is a warm, tactile savings companion for portrait mobile use. The experience makes progress feel physical through colorful glass jars, visible liquid fills, tactile rounded cards, and a calm paper-like backdrop. Every visual progress cue is reinforced by an explicit saved amount, target amount, and percentage so the product remains clear and accessible.

The interface follows an iOS-native hierarchy: a quiet, content-led home screen, a persistent bottom tab bar, large touch targets, and sheets for focused actions. The primary user loop is intentionally short: open a jar, add a contribution, immediately see the jar fill, and return to the dashboard with confidence.

## Screen list

| Screen | Primary content | Core actions |
|---|---|---|
| Home | Total saved summary, active jar hero, jar collection, per-jar `+ Add` quick-deposit chips, quick-add entry point | Open a jar, add money, create a jar, inspect the overview |
| Jar detail | Large visual jar, saved/target figures, remaining and deposit-count stat cards, progress, deadline, deposit and withdrawal actions, transaction history | Deposit, withdraw, manage recurring saving, review activity |
| Create jar sheet | Goal name, emoji, semantic jar color, target amount, optional deadline, live preview | Create a goal jar |
| Deposit sheet | Selected jar, amount entry, balance impact, confirmation | Add a manual contribution and trigger progress feedback |
| Activity view | Recent contributions and withdrawals grouped by jar | Review transaction history |
| Insights | Saving rate, goal progress, habit consistency, 6-month contribution chart, closest-goal spotlight | Review progress patterns |
| Profile / settings | Theme (light/dark/system), saving reminders toggle, biometric/PIN app lock, default currency, archived jars | Change personal preferences, lock the app, restore or permanently delete archived jars |

## Core user flows

### Add money to a goal

The user opens the home screen, taps the primary **Add money** action, taps a jar card's `+ Add` chip, or opens a jar card directly, then enters an amount and confirms the deposit. The deposit sheet previews the transition from the current balance to the new balance alongside the resulting percentage before confirmation. The jar fill and numeric amount update together, accompanied by a short success acknowledgement. A milestone is shown only when one is reached.

### Create a goal jar

The user opens the create-jar sheet from the dashboard, names the goal, picks an emoji and semantic color, sets a target, and optionally enters a deadline. The preview updates throughout the flow. On creation, the goal appears immediately in the jar collection and becomes available for deposits.

### Check progress and activity

The user opens a jar card to see its physical jar visualization paired with saved, target, and percentage values. The detail screen exposes recent contributions and a focused activity link rather than overwhelming the dashboard with dense financial data.

### Gentle support: reminders and OS notifications

Home shows at most one reminder card (`nextReminder`): a due recurring deposit (today/tomorrow, top priority) or an approaching deadline (within 3 days). Completed and archived jars never remind. The same guards drive OS local notifications (`dueNotifications`): at most one ping per jar, fired at 09:00 local on the due day. Every ping has a matching card; cards may appear without a ping.

The schedule is rebuilt on every app foreground and on every jars/settings change (cancel-all-then-schedule, so edits and deposits self-heal). The Profile toggle requests OS permission on enable; denial leaves the toggle off with a note pointing at system Settings, and disabling is an instant kill-switch. Web is a no-op; Android uses a `reminders` channel. No push, no background tasks, no generic daily repeater.

### Lock, currency, and archiving

Profile holds theme, default currency (all amounts re-render in it), biometric lock, and PIN lock (SecureStore on native, AsyncStorage on web). Archiving removes a jar from active goals while keeping history; archived jars can be restored or permanently deleted with confirmation.

## Layout and interaction rules

The home screen uses a 9:16 portrait hierarchy. A compact greeting and profile affordance sit above the total-saved callout. The active goal receives the visual emphasis as a large rounded card. Secondary jars appear as compact but touch-friendly rows or cards lower in the screen, each ending in a small accent-tinted `+ Add` chip so a quick deposit is always one tap away without opening the jar. The floating/add action remains reachable with one hand and never obscures tab navigation.

Focused entry tasks use bottom sheets with clear cancellation and confirmation actions. Money fields use a large numeric treatment, adequate contrast, and clear currency labels. Deposits show a live preview row (current balance → new balance, with the resulting percentage) while withdrawals preview the remaining balance, so both directions are unambiguous before committing. Icons support labels rather than replacing them. Primary controls provide restrained press feedback; destructive actions remain visually distinct and must require confirmation.

Below the jar-detail hero sit two compact stat cards — **Remaining** (amount to goal) and **Deposits** (contribution count) — giving at-a-glance momentum without opening the activity log.

## Color choices

The neutral app base is warm paper and dark cocoa: background **#F6F1E8**, elevated surface **#FFFDF9**, primary ink **#2C231D**, secondary ink **#7E7167**, and soft border **#E6DCD0**. The action color is cocoa **#3B2D24**. Six jar accents provide identity without changing application chrome: coral **#DE7D68**, amber **#E5B847**, mint **#73BDA3**, ocean **#6FA8BF**, berry **#B981AB**, and clay **#B68767**.

Dark mode retains warm charcoal rather than blue-black, using **#201B18** for the canvas, **#2D2722** for surfaces, **#F6EDE2** for primary text, and muted warm-gray borders. Jar colors remain recognizable in both themes.

## Visual components

The reusable visual system contains a `Jar` component with a glass silhouette, translucent colored fill, highlight layer, icon, and accessible numeric label; an `AmountDisplay` component for high-emphasis money; rounded `SurfaceCard` variants; color swatches; a `ProgressPill`; and action buttons with strong active feedback. The jar visual may animate its fill when value changes, but the rendered amount and percentage must always remain the source of truth.

## Implementation decisions

Savings data is device-local: jars persist to AsyncStorage (`saving-jar:v3`, one-generation backup, migrates legacy v1/v2 float stores to integer minor units); PIN uses SecureStore on native. Money is always integer minor units. Withdrawals never roll back milestones or streaks. Recurring rules (daily/weekly/biweekly/monthly, pausable) catch up deterministically, capped at 366 occurrences per call. The main navigation consists of Home, Activity, Insights, and Profile tabs, with jar detail and creation/deposit experiences presented as routes or bottom sheets. Insights derives entirely from local entries (6-month `monthlyDeposits`, streaks, closest goal); no server data. The server provides auth/system plumbing only.
