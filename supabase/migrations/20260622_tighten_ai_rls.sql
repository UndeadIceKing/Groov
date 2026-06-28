-- Tighten RLS on AI cache tables so users can only read their own records.
-- Edge functions write these records using the service role key, so users
-- having INSERT/UPDATE/DELETE access is unnecessary and opens a billing-abuse
-- vector (delete cached nudge → force re-generation → spam Anthropic API calls).

-- ai_nudges: replace FOR ALL policy with SELECT-only
drop policy if exists "Users can manage own nudges" on ai_nudges;
create policy "Users can read own nudges" on ai_nudges
  for select
  using (auth.uid() = user_id);

-- ai_reflections: replace FOR ALL policy with SELECT-only
drop policy if exists "Users can manage own reflections" on ai_reflections;
create policy "Users can read own reflections" on ai_reflections
  for select
  using (auth.uid() = user_id);
