-- ============================================================
-- Life Decision Simulator — Database Schema
-- Run this in Supabase Dashboard → SQL Editor → New Query
-- Safe to run once on a fresh project. Re-running will error on
-- "already exists" — that's expected and harmless.
-- ============================================================

-- Enable UUID generation (usually already on in Supabase, but safe to repeat)
create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------
-- 1. PROFILES
-- Stores the name/age/email collected before generating a plan.
-- One row per user. Linked to Supabase Auth's auth.users via id
-- when auth is enabled; until then, id is generated client-side
-- and stored in localStorage so anonymous users still get history.
-- ----------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid references auth.users(id) on delete cascade, -- null until auth is wired up
  name text not null,
  age int not null check (age > 0 and age < 130),
  email text not null,
  goals text,                 -- free-text long-term goals, used for personalization
  preferences jsonb default '{}'::jsonb, -- structured preference data (risk tolerance, priorities, etc.)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_email on public.profiles(email);
create index if not exists idx_profiles_auth_user_id on public.profiles(auth_user_id);

-- ----------------------------------------------------------------
-- 2. DECISIONS
-- One row per simulation a user runs. Stores the scenario, the
-- generated analysis, and the chosen path, for history + future
-- personalization (e.g. "last time you chose paths favoring stability").
-- ----------------------------------------------------------------
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete cascade,
  scenario text not null,
  follow_up_answers jsonb default '[]'::jsonb, -- adaptive Q&A collected before analysis
  analysis jsonb not null,        -- full Analysis object (paths, pros/cons, recommendation)
  chosen_path_title text,         -- filled in if/when the user indicates a final pick
  created_at timestamptz not null default now()
);

create index if not exists idx_decisions_profile_id on public.decisions(profile_id);
create index if not exists idx_decisions_created_at on public.decisions(created_at desc);

-- ----------------------------------------------------------------
-- 3. CRISIS_EVENTS
-- Secure log of any prompt flagged by the self-harm/crisis detector.
-- This table is intentionally NOT readable via the anon key (see RLS
-- below) — only the service_role key (server-side only) can write
-- to or read from it. Never expose this table to client-side code.
-- ----------------------------------------------------------------
create table if not exists public.crisis_events (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid references public.profiles(id) on delete set null, -- nullable: user may be anonymous
  user_identifier text,           -- email, session id, or 'anonymous' — whatever is available, never inferred
  prompt_excerpt text not null,   -- the flagged input, stored for review; treat as sensitive
  detection_method text not null, -- 'keyword' | 'ai_classifier' | 'both'
  source text not null default 'scenario', -- scenario | profile_followup | deep_dive_chat | server_analyze
  reviewed boolean not null default false, -- admin can mark as reviewed
  created_at timestamptz not null default now()
);

alter table public.crisis_events
  add column if not exists source text not null default 'scenario';

create index if not exists idx_crisis_events_created_at on public.crisis_events(created_at desc);
create index if not exists idx_crisis_events_reviewed on public.crisis_events(reviewed);
create index if not exists idx_crisis_events_source on public.crisis_events(source);

-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

alter table public.profiles enable row level security;
alter table public.decisions enable row level security;
alter table public.crisis_events enable row level security;

-- PROFILES: a user can read/write only their own profile.
-- Until auth is wired up, we match on auth_user_id being null and
-- rely on the app layer; once auth is added, tighten this to
-- auth.uid() = auth_user_id only.
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = auth_user_id or auth_user_id is null);

create policy "profiles_insert_own" on public.profiles
  for insert with check (true); -- anyone can create a profile (no auth yet)

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = auth_user_id or auth_user_id is null);

-- DECISIONS: a user can read/write only decisions tied to their profile.
create policy "decisions_select_own" on public.decisions
  for select using (
    profile_id in (
      select id from public.profiles
      where auth.uid() = auth_user_id or auth_user_id is null
    )
  );

create policy "decisions_insert_own" on public.decisions
  for insert with check (true); -- app layer validates profile_id ownership

-- CRISIS_EVENTS: NO policies for anon/authenticated roles.
-- This means the table is fully inaccessible via the public anon key.
-- Only the service_role key (used exclusively in server-side API
-- routes, never shipped to the browser) can read or write here,
-- because service_role bypasses RLS entirely by design.
-- Do not add select/insert policies for 'anon' or 'authenticated' roles.

-- ============================================================
-- Done. Next steps (see code comments in /lib/supabase.ts):
-- 1. Confirm these tables appear under Table Editor in Supabase.
-- 2. Add your rotated keys to .env.local (never commit them).
-- 3. Restart your Next.js dev server so it picks up the new env vars.
-- ============================================================
