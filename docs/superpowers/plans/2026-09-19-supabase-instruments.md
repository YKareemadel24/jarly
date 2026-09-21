# Supabase Instruments Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Verify jarly Supabase wiring and display `instruments` rows in an Expo Router demo route.

**Architecture:** Reuse `lib/supabase.ts:getSupabase()` (AsyncStorage, PKCE); add only `app/dev/instruments.tsx` that queries `instruments` via `useEffect` + `FlatList`. No scaffold, no new deps.

**Tech Stack:** Expo SDK 54, expo-router v6, @supabase/supabase-js v2, @react-native-async-storage/async-storage, pnpm 9.12

**Spec:** `docs/superpowers/specs/2026-09-19-supabase-instruments-design.md`

## Global Constraints

- Reuse `lib/supabase.ts`, do not create second client.
- Do not run `create-expo-app`, do not add `expo-sqlite` or `react-native-url-polyfill`.
- Do not commit `.env`; use `.env.example` as source of truth.
- `EXPO_PUBLIC_*` inlined into bundle — never put secret key in one.
- Follow existing `app/dev/theme-lab.tsx` route patterns.

---

### Task 1: Verify env wiring

**Files:**
- Modify: `.env` (untracked, copy from `.env.example` — never commit)
- Verify: `constants/oauth.ts:35-37`, `scripts/load-env.js:38-46`, `lib/supabase.ts:26-47`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` (server env or `.env`)
- Produces: `EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for Expo bundle

- [ ] **Step 1: Copy example env if missing**

Run: `Test-Path .env || Copy-Item .env.example .env`
Expected: `.env` exists, git-ignored.

- [ ] **Step 2: Fill Supabase values in `.env`**

```text
SUPABASE_URL=https://<your-ref>.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

`scripts/load-env.js` maps these onto `EXPO_PUBLIC_*` when those are unset. Alternatively set `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` directly.

- [ ] **Step 3: Verify guard reports configured**

Run: `pnpm check`
Expected: PASS (typecheck covers `constants/oauth.ts`, `lib/supabase.ts`).

### Task 2: Add instruments demo route

**Files:**
- Create: `app/dev/instruments.tsx`
- Test: manual via Expo (`pnpm dev:metro`, open `/dev/instruments`)
- Verify: `lib/supabase.ts:26`

**Interfaces:**
- Consumes: `getSupabase(): SupabaseClient`, `isSupabaseConfigured(): boolean`, `SUPABASE_NOT_CONFIGURED: string`
- Produces: default export `InstrumentsScreen` React component

- [ ] **Step 1: Write minimal demo route**

```tsx
import { useEffect, useState } from "react";
import { FlatList, Text, View } from "react-native";
import { getSupabase, SUPABASE_NOT_CONFIGURED } from "@/lib/supabase";
import { isSupabaseConfigured } from "@/constants/oauth";

type Instrument = { id: number; name: string };

export default function InstrumentsScreen() {
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function getInstruments() {
      if (!isSupabaseConfigured()) {
        setError(SUPABASE_NOT_CONFIGURED);
        return;
      }
      const { data, error } = await getSupabase().from("instruments").select("id,name");
      if (error) {
        setError(error.message);
        return;
      }
      setInstruments(data ?? []);
    }
    getInstruments();
  }, []);

  if (error) {
    return (
      <View style={{ flex: 1, paddingTop: 50, paddingHorizontal: 16 }}>
        <Text>Error loading instruments: {error}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, paddingTop: 50, paddingHorizontal: 16 }}>
      <FlatList
        data={instruments}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => <Text style={{ padding: 16 }}>{item.name}</Text>}
      />
    </View>
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `pnpm check`
Expected: PASS

- [ ] **Step 3: Manual verify with data**

Pre-req — you already created the project; paste this in dashboard SQL Editor → Run:

```sql
create table instruments (
  id bigint primary key generated always as identity,
  name text not null
);
insert into instruments (name) values ('violin'), ('viola'), ('cello');
grant select on public.instruments to anon;
alter table instruments enable row level security;
create policy "public can read instruments"
on public.instruments for select to anon using (true);
```

Then run:

```bash
pnpm dev:server
pnpm dev:metro
```

Expected: `/dev/instruments` lists violin, viola, cello. Unconfigured build shows `SUPABASE_NOT_CONFIGURED` message.

- [ ] **Step 4: Commit (only if user requests)**

```bash
git add app/dev/instruments.tsx docs/superpowers/specs/2026-09-19-supabase-instruments-design.md docs/superpowers/plans/2026-09-19-supabase-instruments.md
git commit -m "feat: add instruments demo route"
```

Do not `git add .env`.
