-- HackPay: agent-facing repo submissions (Supabase / Postgres)
-- Run in Supabase SQL Editor. DronaHQ agents should use the service role
-- or a dedicated DB user — not the anon key from the browser.

create table if not exists public.repo_submissions (
  id text primary key,
  hackathon_id text not null,
  hackathon_name text not null default '',
  wallet_address text not null,
  participant_name text not null default 'Participant',
  idea text not null default '',
  github_url text not null default '',
  track text,
  assessment jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists repo_submissions_wallet_idx
  on public.repo_submissions (wallet_address);

create index if not exists repo_submissions_hackathon_idx
  on public.repo_submissions (hackathon_id);

create index if not exists repo_submissions_pending_idx
  on public.repo_submissions (updated_at desc)
  where assessment is null;

alter table public.repo_submissions enable row level security;

-- No anon/authenticated policies: only service_role (bypasses RLS) for server + DronaHQ.
-- Optionally add a locked-down policy later for authenticated organizers.

comment on table public.repo_submissions is
  'HackPay Git submissions mirrored for DronaHQ agents. App UI still uses DynamoDB.';
