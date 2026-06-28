-- Enable RLS and add user-scoped policies on all core app tables.
-- These tables were created via the Supabase dashboard without RLS,
-- meaning any authenticated user could read or write any other user's
-- data using only the public anon key.

-- habits
alter table if exists habits enable row level security;

drop policy if exists "Users can manage own habits" on habits;
create policy "Users can manage own habits" on habits
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- completions
alter table if exists completions enable row level security;

drop policy if exists "Users can manage own completions" on completions;
create policy "Users can manage own completions" on completions
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- challenges
alter table if exists challenges enable row level security;

drop policy if exists "Users can manage own challenges" on challenges;
create policy "Users can manage own challenges" on challenges
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- past_challenges
alter table if exists past_challenges enable row level security;

drop policy if exists "Users can manage own past challenges" on past_challenges;
create policy "Users can manage own past challenges" on past_challenges
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- settings
alter table if exists settings enable row level security;

drop policy if exists "Users can manage own settings" on settings;
create policy "Users can manage own settings" on settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- daily_snapshots
alter table if exists daily_snapshots enable row level security;

drop policy if exists "Users can manage own snapshots" on daily_snapshots;
create policy "Users can manage own snapshots" on daily_snapshots
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
