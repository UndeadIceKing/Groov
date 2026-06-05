-- AI nudges: one generated nudge cached per user per day
create table if not exists ai_nudges (
  id           uuid         default gen_random_uuid() primary key,
  user_id      uuid         references auth.users(id) on delete cascade not null,
  date         text         not null,  -- YYYY-MM-DD (UTC)
  message      text         not null,
  generated_at timestamptz  default now(),
  unique (user_id, date)
);

alter table ai_nudges enable row level security;

create policy "Users can manage own nudges" on ai_nudges
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- AI reflections: one cached per user per period per period_start date
create table if not exists ai_reflections (
  id           uuid         default gen_random_uuid() primary key,
  user_id      uuid         references auth.users(id) on delete cascade not null,
  period       text         not null,  -- 'weekly' | 'monthly'
  period_start text         not null,  -- YYYY-MM-DD
  period_end   text         not null,  -- YYYY-MM-DD
  message      text         not null,
  generated_at timestamptz  default now(),
  unique (user_id, period, period_start)
);

alter table ai_reflections enable row level security;

create policy "Users can manage own reflections" on ai_reflections
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
