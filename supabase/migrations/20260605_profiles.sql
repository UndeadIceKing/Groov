-- profiles: stores user display names (accessible to edge functions via service role)
create table if not exists profiles (
  user_id      uuid         references auth.users(id) on delete cascade primary key,
  display_name text         not null default '',
  updated_at   timestamptz  default now()
);

alter table profiles enable row level security;

create policy "Users can manage own profile" on profiles
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
