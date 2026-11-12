# Saving Jar — Mobile Interface Design Plan

**Last updated:** 2026-11-12 (deadline validation and backup)

## Experience direction

Saving Jar is a warm, tactile savings companion for portrait mobile use. The experience makes progress feel physical through colorful glass jars, visible liquid fills, tactile rounded cards, and a calm paper-like backdrop. Every visual progress cue is reinforced by an explicit saved amount, target amount, and percentage so the product remains clear and accessible.

The interface follows an iOS-native hierarchy: a quiet, content-led home screen, a persistent bottom tab bar, large touch targets, and sheets for focused actions. The primary user loop is intentionally short: open a jar, add a contribution, immediately see the jar fill, and return to the dashboard with confidence.

## Screen list

| Screen             | Primary content                                                                                                                                         | Core actions                                                                           |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Home               | Total saved summary, reminders for every unfinished jar, jar collection, per-jar `+ Add` quick-deposit chips                                            | Open a jar, add money, create a jar, inspect the overview                              |
| Jar detail         | Large visual jar, saved/target figures, remaining and deposit-count stat cards, progress, deadline, deposit and withdrawal actions, transaction history | Deposit, withdraw, manage recurring saving, review activity                            |
| Create jar sheet   | Goal name, emoji, semantic jar color, target amount, optional deadline, live preview                                                                    | Create a goal jar                                                                      |
| Deposit sheet      | Selected jar, amount entry, balance impact, confirmation                                                                                                | Add a manual contribution and trigger progress feedback                                |
| Activity view      | Recent contributions and withdrawals grouped by local calendar day in a virtualized list                                                                | Review transaction history                                                             |
| Insights           | Saving rate, goal progress, habit consistency, 6-month contribution chart, closest-goal spotlight                                                       | Review progress patterns                                                               |
| Profile / settings | Theme (light/dark/system), saving reminders toggle, biometric/PIN app lock, default currency, archived jars                                             | Change personal preferences, lock the app, restore or permanently delete archived jars |

## Core user flows

### Add money to a goal

The user opens the home screen, taps a reminder or a jar card's `+ Add` chip, or opens a jar card directly, then enters an amount and confirms the deposit. The deposit sheet previews the transition from the current balance to the new balance alongside the resulting percentage before confirmation. The app shows a saving state while the write is pending. After the write completes, the jar fill and numeric amount update together with a short success acknowledgement and any milestone reached.

### Correct or undo a recorded transaction

A success toast offers Undo for either deposits or withdrawals; milestone celebrations finish before its timer starts. Tapping an entry in a jar’s history opens its amount/date/note editor, previous values, and an Undo action. Corrections preserve original values with a correction timestamp. Undo adds a linked opposite entry instead of deleting data, and cannot be repeated. Both audit rows remain visible; statistics, pace, and habit streaks exclude reversed contributions. Corrections reject future/invalid dates, unsafe money, and changes that leave an effective historical withdrawal unfunded. Legacy starting balances are preserved.

### Recover from a file backup

Profile exports a versioned `.jarly` file containing all jars and history, including archived/completed jars, reminders, and correction records. Export uses a browser download or the native share sheet; the user chooses where to save it. Restore picks a local file, validates its bounded contents, and previews export date, currency, counts, balance and merge outcome before an explicit Restore. Conflicts and mismatched currencies are refused atomically; unrelated local jars remain. PINs and app security settings are excluded. Backup files contain readable savings data and should be kept private.

### Create a goal jar

The user opens the create-jar sheet from the dashboard, names the goal, picks an emoji and semantic color, sets a target, and optionally enters a deadline. The preview updates throughout the flow. On creation, the goal appears immediately in the jar collection and becomes available for deposits.

### Check progress and activity

The user opens a jar card to see its physical jar visualization paired with saved, target, and percentage values. The detail screen exposes recent contributions and a focused activity link rather than overwhelming the dashboard with dense financial data.

New jars require a positive target in the selected currency. Amount conversion and deposits reject values outside safe integer minor-unit precision. A new or changed recurring schedule starts at its next cadence; resuming a paused schedule also begins from the resume time. Monthly dates clamp to the last valid day of the month, and bounded catch-up retains the first unapplied date for the next pass.

Due recurring entries and their next scheduled date are saved together on startup and foreground return. Archive suspends automatic contributions. Restore starts the next cadence from the restore time, and manually paused rules stay paused. The editor opens with the saved amount and cadence. Invalid stored schedules stay paused until repaired.

Accepted decimal amounts, currency displays, and amount prefills preserve exact cents through the supported limit of 90,071,992,547,409.91. Editing only a transaction note preserves its amount; target edits, presets, and recurring amount hints use the same exact decimal formatter.

Amount fields accept `1234.56`, `1234,56`, and grouped values with cents such as `1,234.56`. Ambiguous, signed, or over-precise input stays visible with guidance and cannot be saved.

Date-only deadlines (`YYYY-MM-DD`) and month-year deadlines (for example, `December 2026`) resolve to local calendar days. Countdown and pace calculations compare calendar dates so midnight and daylight-saving changes do not shift a deadline by a day.

Create, edit, QR transfer, and backup accept the same optional deadline formats, including ISO timestamps. The edit sheet explains how to replace or clear an invalid saved deadline.

If local jar storage cannot be read or a save fails, a persistent warning explains the problem. A failed mutation preserves the previously saved balance and leaves the transaction draft available to retry. Valid empty stores stay empty, and corrupt current data is not copied over a valid recovery backup.

The app shows a loading state while the ledger and security settings open. If either is unavailable, a retry screen keeps the savings routes closed. After loading, the app lock applies the saved policy and stays closed when the configured credential is unavailable. PIN reset requires biometric verification when available. Transfers reject invalid money and mixed code sessions; imports require matching currency and preserve local jars when histories conflict.

### Saving plans and activity filters

Jar details show an integer weekly amount based on actual calendar days left, recent deposits averaged over 28 days, and a qualified finish estimate after deposits on two separate recent days. A deadline within six days shows the full remaining amount by the deadline; due-today, overdue, undated and funded states have specific copy. The estimate may use the recurring schedule and can be delayed by withdrawals. Jar options allow editing or clearing the deadline. Activity filters combine jar, direction, and all/7/30-day local date ranges; Reset restores the full log and no-match states differ from no-history states.

### Gentle support: reminders and OS notifications

Home provides one compact reminder card per active, unfinished jar (`jarReminders`), ordered by the earliest active deposit or deadline, with undated jars last. The first two appear by default; a labeled expand/collapse control exposes all reminders and announces its expanded state to assistive technology. Remaining savings, next scheduled deposit (when active), and deadline (when set) appear on separate lines. Each reminder has a visible `+ Add` action and opens that jar's deposit sheet. These cards stay available independently of the OS notification toggle. Completed and archived jars never remind. OS local notifications also include a daily 09:00 local savings check-in with the total balance from active jars, plus at most one due-deposit or due-day deadline ping per jar using default reminders. The total reflects the latest app sync; local notifications cannot refresh savings while the app is closed.

The schedule is rebuilt on every app foreground and on every jars/settings change (cancel-all-then-schedule, so edits and deposits self-heal). Scheduling waits for both savings and settings to hydrate, and overlapping rebuilds coalesce so the latest setting wins. Scheduler errors go through the existing error capture; permission-check failures show an in-app notice. The Profile toggle requests OS permission on enable; denial leaves the toggle off with a note pointing at system Settings, and disabling is an instant kill-switch. Web is a no-op; Android uses a `reminders` channel. No push or background tasks.

Personal reminder settings start collapsed in jar detail. A labeled Set/Edit action exposes 24-hour local time, weekdays, enable/pause, one-day snooze and clear snooze. Saving preserves the pause state; these reminders never record deposits or change automatic recurring saving. The global Profile toggle and OS permission still govern native delivery; web only saves settings. Custom schedules share 63 one-shot OS slots, allocated round-robin across eligible jars, plus the separate repeating 09:00 summary. The queue is replenished on foreground and jar/settings changes; the app must be reopened before it is exhausted and after timezone changes. With more than 63 eligible jars, some jars have no queued slot. Local times skipped by daylight saving are omitted. Existing jars without custom settings keep their prior due-deposit/deadline behavior.

### Lock, currency, and archiving

Profile holds theme, default currency (all amounts re-render in it), biometric lock, and PIN lock (secure storage on native, shared_preferences on web). Archiving removes a jar from active goals while keeping history; archived jars can be restored or permanently deleted with confirmation.

Restore and automatic contributions use the full active balance to check the supported savings limit. A refused change leaves the saved ledger intact.

## Layout and interaction rules

The home screen uses a 9:16 portrait hierarchy. A compact greeting and profile affordance sit above the total-saved callout. The total card places the currency code in its heading and gives the numeric balance its own line to keep ordinary amounts readable on narrow screens; its accessibility label includes the full currency amount. Compact, accent-tinted reminder cards sit immediately below the total, replacing the single-jar milestone nudge and featured goal. Jars appear as compact but touch-friendly rows or cards lower in the screen, each showing a prominent saved amount, a separate quieter target line, and a single readable percentage beside its progress bar. Jar names and amounts wrap instead of truncating. The jar-opening area and the accent-tinted `+ Add` button are separate controls. Buttons use foreground-colored text for contrast; the labeled `New jar` action and deposit buttons remain at least 44 points high. Reminder details and jar metadata use larger supporting text; section headers and balance notes wrap on narrow screens. Deposits use the selected jar's reminder or `+ Add` chip; there is no floating Add money button.

Focused entry tasks use bottom sheets with clear cancellation and confirmation actions. Money fields use a large numeric treatment, adequate contrast, and clear currency labels. Deposits show a live preview row (current balance → new balance, with the resulting percentage) while withdrawals preview the remaining balance, so both directions are unambiguous before committing. Icons support labels rather than replacing them. Primary controls provide restrained press feedback; destructive actions remain visually distinct and must require confirmation.

A deposit or withdrawal confirmation can save one transaction. A failed save leaves the draft ready to retry. Cancelling clears the amount and note.

Below the jar-detail hero sit two compact stat cards — **Remaining** (amount to goal) and **Deposits** (contribution count) — giving at-a-glance momentum without opening the activity log.

## Color choices

The neutral app base is warm paper and dark cocoa: background **#F6F1E8**, elevated surface **#FFFDF9**, primary ink **#2C231D**, secondary ink **#6B5F55**, and soft border **#E6DCD0**. The action color is cocoa **#3B2D24**. Six jar accents provide identity without changing application chrome: coral **#DE7D68**, amber **#E5B847**, mint **#73BDA3**, ocean **#6FA8BF**, berry **#B981AB**, and clay **#B68767**.

Dark mode retains warm charcoal rather than blue-black, using **#201B18** for the canvas, **#2D2722** for surfaces, **#F6EDE2** for primary text, and muted warm-gray borders. Jar colors remain recognizable in both themes.

The Jarly launcher mark uses the same warm visual language at a smaller scale: a bold cocoa field, pale jar glass, teal savings fill, coral lid, and gold coin. The jar silhouette, liquid line, and coin are intentionally oversized and high-contrast so the mark remains recognizable in launcher grids and adaptive-icon masks.

## Visual components

The reusable visual system contains a `Jar` component with a glass silhouette, translucent colored fill, highlight layer, icon, and accessible numeric label; an `AmountDisplay` component for high-emphasis money; rounded `SurfaceCard` variants; color swatches; a `ProgressPill`; and action buttons with strong active feedback. The jar visual may animate its fill when value changes, but the rendered amount and percentage must always remain the source of truth.

## Implementation decisions

Savings data is device-local. The native ledger file or browser IndexedDB holds `saving-jar:v3` and its one-generation backup, with migration from older preference stores. The PIN record uses secure storage on native. Money is always integer minor units. Withdrawals never roll back milestones or streaks. Recurring rules (daily/weekly/biweekly/monthly, pausable) catch up deterministically, capped at 366 occurrences per call. The main navigation consists of Home, Activity, Insights, and Profile tabs, with jar detail and creation/deposit experiences presented as routes or bottom sheets. Insights derives entirely from local entries (6-month `monthlyDeposits`, streaks, closest goal). There is no server.

The app is implemented in Flutter 3.47 (Material 3) with go_router navigation, Riverpod controllers over a pure Dart domain layer, and flutter_local_notifications for reminders. The visual system above is reproduced 1:1: the same tokens, sheet behaviour, press feedback (opacity + 0.98 scale), and jar vessel animation as the original React Native build. Launcher icons and the native splash are generated from the same brand assets.
