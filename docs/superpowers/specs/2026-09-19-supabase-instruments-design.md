# Supabase instruments demo in jarly — design

Approved: reuse `jarly`, no `my-app` scaffold.

## Goal

Verify existing Supabase wiring and show `instruments` table read in Expo Router app.

## Context (existing)

- `lib/supabase.ts:getSupabase()` — lazy `createClient` with `AsyncStorage`, `persistSession`, `autoRefreshToken`, `detectSessionInUrl: Platform.OS === 'web'`, `flowType: pkce`.
- `constants/oauth.ts:isSupabaseConfigured()` guards unconfigured builds.
- `scripts/load-env.js` maps `SUPABASE_URL` → `EXPO_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` → `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
- Deps already present: `@supabase/supabase-js`, `@react-native-async-storage/async-storage`. No `expo-sqlite` / `react-native-url-polyfill` needed.
- Expo Router, no `App.tsx`. Demo goes at `app/dev/instruments.tsx`.

## SQL to paste (Supabase dashboard → SQL Editor → Run)

```sql
-- Create the table
create table instruments (
  id bigint primary key generated always as identity,
  name text not null
);

-- Insert sample data into the table
insert into instruments (name)
values
  ('violin'),
  ('viola'),
  ('cello');

-- Grant read access to anon
grant select on public.instruments to anon;

-- Enable row level security
alter table instruments enable row level security;

-- Public read policy
create policy "public can read instruments"
on public.instruments
for select to anon
using (true);
```

## Env

`cp .env.example .env`, fill `SUPABASE_URL=https://<ref>.supabase.co` and `SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`.
`EXPO_PUBLIC_*` derived automatically if unset.

## Demo route (`app/dev/instruments.tsx`)

- `useEffect` → `getSupabase().from('instruments').select()` → `useState<Instrument[]>`, `error` state.
- `FlatList` with `keyExtractor id`, unconfigured + error states via `isSupabaseConfigured()` / `SUPABASE_NOT_CONFIGURED`.
- No new deps, no change to `lib/supabase.ts`.

## Run

```bash
pnpm dev:server
pnpm dev:metro
# open /dev/instruments
```

## Skipped

`npx create-expo-app my-app`, `npx expo install ... expo-sqlite react-native-url-polyfill`, `.env` with secrets, `App.tsx` overwrite, `npx expo start`.
Add when: offline SQLite needed, URL polyfill error on Hermes, or standalone blank demo required.

## Self-review

- No TBDs. No contradictions. Single-plan scope. No ambiguity: user runs SQL, implementation only adds demo route + env verify.
