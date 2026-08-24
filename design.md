# Saving Jar — Mobile Interface Design Plan

## Experience direction

Saving Jar is a warm, tactile savings companion for portrait mobile use. The experience makes progress feel physical through colorful glass jars, visible liquid fills, tactile rounded cards, and a calm paper-like backdrop. Every visual progress cue is reinforced by an explicit saved amount, target amount, and percentage so the product remains clear and accessible.

The interface follows an iOS-native hierarchy: a quiet, content-led home screen, a persistent bottom tab bar, large touch targets, and sheets for focused actions. The primary user loop is intentionally short: open a jar, add a contribution, immediately see the jar fill, and return to the dashboard with confidence.

## Screen list

| Screen | Primary content | Core actions |
|---|---|---|
| Home | Total saved summary, active jar hero, jar collection, quick-add entry point | Open a jar, add money, create a jar, inspect the overview |
| Jar detail | Large visual jar, saved/target figures, progress, deadline, deposit and withdrawal actions, transaction history | Deposit, withdraw, manage recurring saving, review activity |
| Create jar sheet | Goal name, emoji, semantic jar color, target amount, optional deadline, live preview | Create a goal jar |
| Deposit sheet | Selected jar, amount entry, balance impact, confirmation | Add a manual contribution and trigger progress feedback |
| Activity view | Recent contributions and withdrawals grouped by jar | Review transaction history |
| Insights | Saving rate, goal progress, habit consistency, monthly contribution view | Review progress patterns |
| Profile / settings | Theme, reminders, security concept, app preferences | Change personal preferences |

## Core user flows

### Add money to a goal

The user opens the home screen, taps the primary **Add money** action or a jar card, selects or confirms the goal jar, enters an amount, and confirms the deposit. The jar fill and numeric amount update together, accompanied by a short success acknowledgement. A milestone is shown only when one is reached.

### Create a goal jar

The user opens the create-jar sheet from the dashboard, names the goal, picks an emoji and semantic color, sets a target, and optionally enters a deadline. The preview updates throughout the flow. On creation, the goal appears immediately in the jar collection and becomes available for deposits.

### Check progress and activity

The user opens a jar card to see its physical jar visualization paired with saved, target, and percentage values. The detail screen exposes recent contributions and a focused activity link rather than overwhelming the dashboard with dense financial data.

## Layout and interaction rules

The home screen uses a 9:16 portrait hierarchy. A compact greeting and profile affordance sit above the total-saved callout. The active goal receives the visual emphasis as a large rounded card. Secondary jars appear as compact but touch-friendly rows or cards lower in the screen. The floating/add action remains reachable with one hand and never obscures tab navigation.

Focused entry tasks use bottom sheets with clear cancellation and confirmation actions. Money fields use a large numeric treatment, adequate contrast, and clear currency labels. Icons support labels rather than replacing them. Primary controls provide restrained press feedback; destructive actions remain visually distinct and must require confirmation.

## Color choices

The neutral app base is warm paper and dark cocoa: background **#F6F1E8**, elevated surface **#FFFDF9**, primary ink **#2C231D**, secondary ink **#7E7167**, and soft border **#E6DCD0**. The action color is cocoa **#3B2D24**. Six jar accents provide identity without changing application chrome: coral **#DE7D68**, amber **#E5B847**, mint **#73BDA3**, ocean **#6FA8BF**, berry **#B981AB**, and clay **#B68767**.

Dark mode retains warm charcoal rather than blue-black, using **#201B18** for the canvas, **#2D2722** for surfaces, **#F6EDE2** for primary text, and muted warm-gray borders. Jar colors remain recognizable in both themes.

## Visual components

The reusable visual system contains a `Jar` component with a glass silhouette, translucent colored fill, highlight layer, icon, and accessible numeric label; an `AmountDisplay` component for high-emphasis money; rounded `SurfaceCard` variants; color swatches; a `ProgressPill`; and action buttons with strong active feedback. The jar visual may animate its fill when value changes, but the rendered amount and percentage must always remain the source of truth.

## Implementation decisions

The first build will keep data local to the device using in-memory state with AsyncStorage-ready structures, because cross-device synchronization was not requested. The main navigation consists of Home, Activity, Insights, and Profile tabs, with jar detail and creation/deposit experiences presented as routes or bottom sheets. The app should be usable with seeded demonstration data until the user creates and adjusts their own jars.
