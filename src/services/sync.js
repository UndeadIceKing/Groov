import { supabase } from '../utils/supabase';

// ── Transformers ──────────────────────────────────────────────────────────────

const habitToRow = (habit, userId) => ({
  id: habit.id,
  user_id: userId,
  name: habit.name,
  icon: habit.icon ?? null,
  type: habit.type,
  volume_goal: habit.volumeGoal ?? 1,
  created_at: habit.createdAt,
});

const rowToHabit = (row) => ({
  id: row.id,
  name: row.name,
  icon: row.icon,
  type: row.type,
  volumeGoal: row.volume_goal,
  createdAt: row.created_at,
});

const completionsToRows = (completions, userId) => {
  const rows = [];
  for (const [date, habitMap] of Object.entries(completions)) {
    for (const [habitId, count] of Object.entries(habitMap)) {
      if (count > 0) rows.push({ user_id: userId, date, habit_id: habitId, count });
    }
  }
  return rows;
};

const rowsToCompletions = (rows) => {
  const completions = {};
  for (const row of rows) {
    if (!completions[row.date]) completions[row.date] = {};
    completions[row.date][row.habit_id] = row.count;
  }
  return completions;
};

const challengeToRow = (ch, userId) => ({
  id: ch.id,
  user_id: userId,
  name: ch.name,
  description: ch.description ?? null,
  days: ch.days,
  completed_days: ch.completedDays ?? [],
  completed: ch.completed ?? false,
  start_date: ch.startDate,
  linked_habit_ids: ch.linkedHabitIds ?? [],
  icon: ch.icon ?? null,
});

const rowToChallenge = (row) => ({
  id: row.id,
  name: row.name,
  description: row.description,
  days: row.days,
  completedDays: row.completed_days,
  completed: row.completed,
  startDate: row.start_date,
  linkedHabitIds: row.linked_habit_ids,
  icon: row.icon,
});

const pastChallengeToRow = (ch, userId) => ({
  ...challengeToRow(ch, userId),
  archived_at: ch.archivedAt,
  tier: ch.tier ?? 'none',
});

const rowToPastChallenge = (row) => ({
  ...rowToChallenge(row),
  archivedAt: row.archived_at,
  tier: row.tier,
});

const settingsToRow = (settings, userId) => ({
  user_id: userId,
  theme: settings.theme ?? 'light',
  notifications_enabled: settings.notificationsEnabled ?? true,
  sound_enabled: settings.soundEnabled ?? true,
  haptics_enabled: settings.hapticsEnabled ?? true,
  reminders: settings.reminders ?? [],
});

const rowToSettings = (row) => ({
  theme: row.theme,
  notificationsEnabled: row.notifications_enabled,
  soundEnabled: row.sound_enabled,
  hapticsEnabled: row.haptics_enabled,
  reminders: row.reminders ?? [],
});

// ── Bulk operations ───────────────────────────────────────────────────────────

export async function pushAllLocalData(userId, { habits, completions, settings, challenges, pastChallenges, dailySnapshot }) {
  const ops = [];

  if (habits.length > 0)
    ops.push(supabase.from('habits').upsert(habits.map(h => habitToRow(h, userId))));

  const completionRows = completionsToRows(completions, userId);
  if (completionRows.length > 0)
    ops.push(supabase.from('completions').upsert(completionRows));

  if (challenges.length > 0)
    ops.push(supabase.from('challenges').upsert(challenges.map(c => challengeToRow(c, userId))));

  if (pastChallenges.length > 0)
    ops.push(supabase.from('past_challenges').upsert(pastChallenges.map(c => pastChallengeToRow(c, userId))));

  ops.push(supabase.from('settings').upsert(settingsToRow(settings, userId)));

  const snapshotRows = Object.entries(dailySnapshot).map(([date, snapshot]) => ({
    user_id: userId, date, snapshot,
  }));
  if (snapshotRows.length > 0)
    ops.push(supabase.from('daily_snapshots').upsert(snapshotRows));

  const results = await Promise.allSettled(ops);
  results.forEach((r, i) => {
    if (r.status === 'rejected') console.warn(`pushAllLocalData[${i}] rejected:`, r.reason);
    else if (r.value?.error) console.warn(`pushAllLocalData[${i}] error:`, r.value.error.message);
  });
}

export async function pullAllData(userId) {
  const [habitsRes, completionsRes, challengesRes, pastRes, settingsRes, snapshotsRes] = await Promise.all([
    supabase.from('habits').select('*').eq('user_id', userId),
    supabase.from('completions').select('*').eq('user_id', userId),
    supabase.from('challenges').select('*').eq('user_id', userId),
    supabase.from('past_challenges').select('*').eq('user_id', userId),
    supabase.from('settings').select('*').eq('user_id', userId).maybeSingle(),
    supabase.from('daily_snapshots').select('*').eq('user_id', userId),
  ]);

  return {
    habits: habitsRes.data ? habitsRes.data.map(rowToHabit) : null,
    completions: completionsRes.data ? rowsToCompletions(completionsRes.data) : null,
    challenges: challengesRes.data ? challengesRes.data.map(rowToChallenge) : null,
    pastChallenges: pastRes.data ? pastRes.data.map(rowToPastChallenge) : null,
    settings: settingsRes.data ? rowToSettings(settingsRes.data) : null,
    dailySnapshot: snapshotsRes.data
      ? Object.fromEntries(snapshotsRes.data.map(r => [r.date, r.snapshot]))
      : null,
  };
}

export async function deleteAllUserData(userId) {
  await Promise.allSettled([
    supabase.from('habits').delete().eq('user_id', userId),
    supabase.from('completions').delete().eq('user_id', userId),
    supabase.from('challenges').delete().eq('user_id', userId),
    supabase.from('past_challenges').delete().eq('user_id', userId),
    supabase.from('settings').delete().eq('user_id', userId),
    supabase.from('daily_snapshots').delete().eq('user_id', userId),
    supabase.from('ai_nudges').delete().eq('user_id', userId),
    supabase.from('ai_reflections').delete().eq('user_id', userId),
    supabase.from('profiles').delete().eq('user_id', userId),
  ]);
}

export async function syncProfile(userId, displayName) {
  const { error } = await supabase.from('profiles').upsert({
    user_id: userId,
    display_name: displayName,
    updated_at: new Date().toISOString(),
  });
  if (error) console.warn('syncProfile:', error.message);
}

export async function fetchProfile(userId) {
  const { data, error } = await supabase.from('profiles')
    .select('display_name')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) console.warn('fetchProfile:', error.message);
  return data;
}

// ── Individual mutation syncs ─────────────────────────────────────────────────

export async function syncHabit(userId, habit) {
  const { error } = await supabase.from('habits').upsert(habitToRow(habit, userId));
  if (error) console.warn('syncHabit:', error.message);
}

export async function deleteHabitSync(userId, habitId) {
  const { error } = await supabase.from('habits').delete().eq('id', habitId).eq('user_id', userId);
  if (error) console.warn('deleteHabitSync:', error.message);
}

export async function syncCompletion(userId, date, habitId, count) {
  if (count <= 0) {
    const { error } = await supabase.from('completions').delete()
      .eq('user_id', userId).eq('date', date).eq('habit_id', habitId);
    if (error) console.warn('syncCompletion delete:', error.message);
  } else {
    const { error } = await supabase.from('completions')
      .upsert({ user_id: userId, date, habit_id: habitId, count });
    if (error) console.warn('syncCompletion upsert:', error.message);
  }
}

export async function syncCompletionsForDate(userId, date, habitMap) {
  await supabase.from('completions').delete().eq('user_id', userId).eq('date', date);
  const rows = Object.entries(habitMap)
    .filter(([, count]) => count > 0)
    .map(([habitId, count]) => ({ user_id: userId, date, habit_id: habitId, count }));
  if (rows.length > 0) {
    const { error } = await supabase.from('completions').insert(rows);
    if (error) console.warn('syncCompletionsForDate:', error.message);
  }
}

export async function syncChallenge(userId, challenge) {
  const { error } = await supabase.from('challenges').upsert(challengeToRow(challenge, userId));
  if (error) console.warn('syncChallenge:', error.message);
}

export async function deleteChallengeSync(userId, challengeId) {
  const { error } = await supabase.from('challenges').delete().eq('id', challengeId).eq('user_id', userId);
  if (error) console.warn('deleteChallengeSync:', error.message);
}

export async function syncPastChallenge(userId, challenge) {
  const { error } = await supabase.from('past_challenges').upsert(pastChallengeToRow(challenge, userId));
  if (error) console.warn('syncPastChallenge:', error.message);
}

export async function syncSettings(userId, settings) {
  const { error } = await supabase.from('settings').upsert(settingsToRow(settings, userId));
  if (error) console.warn('syncSettings:', error.message);
}

export async function syncDailySnapshot(userId, date, snapshot) {
  const { error } = await supabase.from('daily_snapshots')
    .upsert({ user_id: userId, date, snapshot });
  if (error) console.warn('syncDailySnapshot:', error.message);
}
