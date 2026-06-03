import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { loadData, saveData, clearAll as storeClearAll } from '../utils/storage';
import { themes } from '../theme/colors';

const AppContext = createContext(null);

const DEFAULT_HABITS = [
  { id: '1', name: 'Drink 8 glasses of water', icon: '💧', type: 'volume', volumeGoal: 8, createdAt: '2025-01-01' },
  { id: '2', name: 'Exercise for 30 minutes', icon: '🏃', type: 'daily', volumeGoal: 1, createdAt: '2025-01-01' },
  { id: '3', name: 'Read for 20 minutes', icon: '📚', type: 'daily', volumeGoal: 1, createdAt: '2025-01-01' },
  { id: '4', name: 'Meditate', icon: '🧘', type: 'daily', volumeGoal: 1, createdAt: '2025-01-01' },
];

const DEFAULT_REMINDERS = [
  { id: 'morning', label: 'Morning Reminder', time: { hour12: 8, minute: 0, ampm: 'AM' }, enabled: true },
  { id: 'evening', label: 'Evening Reminder', time: { hour12: 8, minute: 0, ampm: 'PM' }, enabled: true },
];

const DEFAULT_SETTINGS = {
  notificationsEnabled: true,
  reminders: DEFAULT_REMINDERS,
  soundEnabled: true,
  hapticsEnabled: true,
  theme: 'light',
};

const STARTER_CHALLENGE = {
  id: 'starter',
  name: '3-Day Kickstart',
  description: 'Complete all your habits for 3 days in a row to build your foundation.',
  days: 3,
  completedDays: [],
  completed: false,
  startDate: new Date().toISOString().split('T')[0],
  linkedHabitIds: ['1', '2', '3', '4'],
};

function todayStrWithOffset(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().split('T')[0];
}

// Assign a tier based on completion ratio
export function getChallengeTier(completedCount, totalDays) {
  const ratio = totalDays > 0 ? completedCount / totalDays : 0;
  if (ratio >= 1.0) return 'platinum';
  if (ratio >= 0.75) return 'gold';
  if (ratio >= 0.50) return 'silver';
  if (ratio >= 0.25) return 'copper';
  return 'none';
}

export const TIER_STYLES = {
  platinum: { bg: '#CCFFFE', border: '#22D3EE', text: '#0E7490', badge: '💎', trophy: '🏆' },
  gold:     { bg: '#FEF3C7', border: '#F59E0B', text: '#92400E', badge: '🥇', trophy: '🏆' },
  silver:   { bg: '#F1F5F9', border: '#94A3B8', text: '#475569', badge: '🥈', trophy: '🥈' },
  copper:   { bg: '#FDE8D8', border: '#CD7F32', text: '#9A3412', badge: '🥉', trophy: '🥉' },
  none:     { bg: null, border: null, text: null, badge: '📋', trophy: '📋' },
};

function migrateSettings(s) {
  if (!s) return DEFAULT_SETTINGS;
  if (s.reminders && Array.isArray(s.reminders)) {
    return {
      ...DEFAULT_SETTINGS,
      ...s,
      reminders: s.reminders.map(r => ({
        ...r,
        time: r.time || { hour12: 8, minute: 0, ampm: 'AM' },
        enabled: r.enabled !== false,
      })),
    };
  }
  const migrateTime = (t, fallback) => {
    if (!t) return fallback;
    if (typeof t === 'object' && t.hour12 !== undefined) return t;
    const parts = String(t).split(':');
    const h = parseInt(parts[0]) || 8;
    const m = parseInt(parts[1]) || 0;
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    return { hour12, minute: m, ampm };
  };
  return {
    ...DEFAULT_SETTINGS,
    notificationsEnabled: s.notificationsEnabled ?? true,
    soundEnabled: s.soundEnabled ?? true,
    hapticsEnabled: s.hapticsEnabled ?? true,
    theme: s.theme ?? 'light',
    reminders: [
      { id: 'morning', label: 'Morning Reminder', time: migrateTime(s.morningTime, { hour12: 8, minute: 0, ampm: 'AM' }), enabled: true },
      { id: 'evening', label: 'Evening Reminder', time: migrateTime(s.eveningTime, { hour12: 8, minute: 0, ampm: 'PM' }), enabled: true },
    ],
  };
}

// Migrate challenges to ensure linkedHabitIds field exists
function migrateChallenges(chs) {
  if (!Array.isArray(chs)) return [];
  return chs.map(ch => {
    const migrated = { linkedHabitIds: [], ...ch };
    // Back-fill default habit links for the starter challenge
    if (migrated.id === 'starter' && migrated.linkedHabitIds.length === 0) {
      migrated.linkedHabitIds = ['1', '2', '3', '4'];
    }
    return migrated;
  });
}

export function AppProvider({ children }) {
  const [habits, setHabits] = useState(DEFAULT_HABITS);
  const [completions, setCompletions] = useState({});
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [challenges, setChallenges] = useState([STARTER_CHALLENGE]);
  const [pastChallenges, setPastChallenges] = useState([]);
  const [hasOnboarded, setHasOnboarded] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [dailySnapshot, setDailySnapshot] = useState({});
  const [dateOffset, setDateOffset] = useState(0);

  // Cross-screen navigation request: { tab: number } — consumed by AppNavigator
  const [requestedTab, setRequestedTab] = useState(null);
  // When set, HabitsScreen opens "Add Habit" modal and links it to this challengeId on save
  const [pendingHabitLinkChallenge, setPendingHabitLinkChallenge] = useState(null);
  // Set true whenever any bottom-sheet / modal is open, to block swipe navigation
  const [modalOpen, setModalOpen] = useState(false);

  const todayStr = useCallback(() => todayStrWithOffset(dateOffset), [dateOffset]);

  useEffect(() => {
    (async () => {
      const [h, c, s, ch, ob, ds, pc] = await Promise.all([
        loadData('habits'),
        loadData('completions'),
        loadData('settings'),
        loadData('challenges'),
        loadData('hasOnboarded'),
        loadData('dailySnapshot'),
        loadData('pastChallenges'),
      ]);
      if (h) setHabits(h);
      if (c) setCompletions(c);
      setSettings(migrateSettings(s));
      if (ch) {
        setChallenges(migrateChallenges(Array.isArray(ch) ? ch : [ch]));
      } else {
        const oldCh = await loadData('challenge');
        if (oldCh) setChallenges(migrateChallenges([oldCh]));
      }
      if (ob !== null) setHasOnboarded(ob);
      if (ds) setDailySnapshot(ds);
      if (pc) setPastChallenges(pc);
      setLoaded(true);
    })();
  }, []);

  useEffect(() => { if (loaded) saveData('habits', habits); }, [habits, loaded]);
  useEffect(() => { if (loaded) saveData('completions', completions); }, [completions, loaded]);
  useEffect(() => { if (loaded) saveData('settings', settings); }, [settings, loaded]);
  useEffect(() => { if (loaded) saveData('challenges', challenges); }, [challenges, loaded]);
  useEffect(() => { if (loaded) saveData('hasOnboarded', hasOnboarded); }, [hasOnboarded, loaded]);
  useEffect(() => { if (loaded) saveData('dailySnapshot', dailySnapshot); }, [dailySnapshot, loaded]);
  useEffect(() => { if (loaded) saveData('pastChallenges', pastChallenges); }, [pastChallenges, loaded]);

  useEffect(() => {
    if (!loaded) return;
    const today = todayStr();
    setDailySnapshot(prev => ({
      ...prev,
      [today]: habits.map(h => ({ id: h.id, name: h.name, icon: h.icon, volumeGoal: h.volumeGoal })),
    }));
  }, [habits, loaded, todayStr]);

  // ── Completion helpers ──────────────────────────────────────────────────────

  const getTodayCompletions = useCallback(() => completions[todayStr()] || {}, [completions, todayStr]);

  const getHabitCount = useCallback((habitId) => {
    const today = completions[todayStr()] || {};
    return today[habitId] || 0;
  }, [completions, todayStr]);

  const isHabitDone = useCallback((habit) => {
    return getHabitCount(habit.id) >= habit.volumeGoal;
  }, [getHabitCount]);

  const getCompletedCount = useCallback(() => {
    return habits.filter(h => isHabitDone(h)).length;
  }, [habits, isHabitDone]);

  const isAllDone = useCallback(() => {
    return habits.length > 0 && habits.every(h => isHabitDone(h));
  }, [habits, isHabitDone]);

  // Is all done for the specific habits linked to a challenge
  const isChallengeHabitsDone = useCallback((challenge) => {
    const ids = challenge.linkedHabitIds || [];
    const relevant = ids.length > 0 ? habits.filter(h => ids.includes(h.id)) : habits;
    return relevant.length > 0 && relevant.every(h => isHabitDone(h));
  }, [habits, isHabitDone]);

  // ── Habit mutations ─────────────────────────────────────────────────────────

  const incrementHabit = useCallback((habitId) => {
    const habit = habits.find(h => h.id === habitId);
    if (!habit) return false;
    const today = todayStr();
    const current = (completions[today] || {})[habitId] || 0;
    if (current >= habit.volumeGoal) return false;
    const next = current + 1;
    setCompletions(prev => ({
      ...prev,
      [today]: { ...(prev[today] || {}), [habitId]: next },
    }));
    setDailySnapshot(prev => {
      if (prev[today]) return prev;
      return {
        ...prev,
        [today]: habits.map(h => ({ id: h.id, name: h.name, icon: h.icon, volumeGoal: h.volumeGoal })),
      };
    });
    return next >= habit.volumeGoal;
  }, [completions, habits, todayStr]);

  const decrementHabit = useCallback((habitId) => {
    const today = todayStr();
    const current = (completions[today] || {})[habitId] || 0;
    if (current <= 0) return;
    setCompletions(prev => ({
      ...prev,
      [today]: { ...(prev[today] || {}), [habitId]: current - 1 },
    }));
  }, [completions, todayStr]);

  const addHabit = useCallback((habit) => {
    const newHabit = { ...habit, id: Date.now().toString(), createdAt: todayStr() };
    setHabits(prev => [...prev, newHabit]);
    return newHabit.id;
  }, [todayStr]);

  const updateHabit = useCallback((id, updates) => {
    setHabits(prev => prev.map(h => h.id === id ? { ...h, ...updates } : h));
  }, []);

  const deleteHabit = useCallback((id) => {
    setHabits(prev => prev.filter(h => h.id !== id));
    setChallenges(prev => prev.map(ch => ({
      ...ch,
      linkedHabitIds: (ch.linkedHabitIds || []).filter(hid => hid !== id),
    })));
    // Remove any synced reminder entry for this habit
    setSettings(prev => ({
      ...prev,
      reminders: prev.reminders.filter(r => r.id !== `habit-${id}`),
    }));
  }, []);

  const updateSettings = useCallback((updates) => {
    setSettings(prev => ({ ...prev, ...updates }));
  }, []);

  // ── Challenge actions ───────────────────────────────────────────────────────

  const markChallengeDay = useCallback((challengeId) => {
    const today = todayStr();
    setChallenges(prev => prev.map(ch => {
      if (ch.id !== challengeId) return ch;
      if (ch.completedDays.includes(today)) return ch;
      const newDays = [...ch.completedDays, today];
      return { ...ch, completedDays: newDays, completed: newDays.length >= ch.days };
    }));
  }, [todayStr]);

  const unmarkChallengeDay = useCallback((challengeId) => {
    const today = todayStr();
    setChallenges(prev => prev.map(ch => {
      if (ch.id !== challengeId) return ch;
      return { ...ch, completedDays: ch.completedDays.filter(d => d !== today), completed: false };
    }));
  }, [todayStr]);

  const editChallenge = useCallback((challengeId, updates) => {
    setChallenges(prev => prev.map(ch => ch.id === challengeId ? { ...ch, ...updates } : ch));
  }, []);

  const createChallenge = useCallback((name, description, days, icon = '🏆') => {
    setChallenges(prev => {
      if (prev.length >= 3) return prev;
      return [...prev, {
        id: Date.now().toString(),
        name, description, days, icon,
        completedDays: [],
        completed: false,
        startDate: todayStr(),
        linkedHabitIds: [],
      }];
    });
  }, [todayStr]);

  const deleteChallenge = useCallback((challengeId) => {
    setChallenges(prev => {
      const ch = prev.find(c => c.id === challengeId);
      if (ch) {
        const tier = getChallengeTier(ch.completedDays.length, ch.days);
        setPastChallenges(p => [{ ...ch, archivedAt: todayStr(), tier }, ...p]);
      }
      return prev.filter(c => c.id !== challengeId);
    });
  }, [todayStr]);

  // Archive a challenge immediately when the user completes the final day early
  const completeChallengeImmediately = useCallback((challengeId) => {
    const today = todayStr();
    setChallenges(prev => {
      const ch = prev.find(c => c.id === challengeId);
      if (!ch) return prev;
      const updatedDays = ch.completedDays.includes(today)
        ? ch.completedDays
        : [...ch.completedDays, today];
      const tier = getChallengeTier(updatedDays.length, ch.days);
      setPastChallenges(p => {
        if (p.some(pc => pc.id === ch.id)) return p;
        return [{ ...ch, completedDays: updatedDays, archivedAt: today, tier, completed: true }, ...p];
      });
      return prev.filter(c => c.id !== challengeId);
    });
  }, [todayStr]);

  // Set every habit to its goal for today (used by Select All)
  const selectAllHabitsToday = useCallback(() => {
    const today = todayStr();
    setCompletions(prev => {
      const next = { ...(prev[today] || {}) };
      habits.forEach(h => { next[h.id] = h.volumeGoal; });
      return { ...prev, [today]: next };
    });
  }, [habits, todayStr]);

  // Reset every habit to 0 for today (used by Unselect All)
  const resetAllHabitsToday = useCallback(() => {
    const today = todayStr();
    setCompletions(prev => {
      const next = { ...(prev[today] || {}) };
      habits.forEach(h => { next[h.id] = 0; });
      return { ...prev, [today]: next };
    });
  }, [habits, todayStr]);

  // Archive a challenge that has expired based on calendar date
  const archiveExpiredChallenge = useCallback((challengeId) => {
    setChallenges(prev => {
      const ch = prev.find(c => c.id === challengeId);
      if (!ch) return prev;
      const tier = getChallengeTier(ch.completedDays.length, ch.days);
      setPastChallenges(p => {
        if (p.some(pc => pc.id === ch.id)) return p; // already archived
        return [{ ...ch, archivedAt: todayStr(), tier, completed: tier !== 'none' }, ...p];
      });
      return prev.filter(c => c.id !== challengeId);
    });
  }, [todayStr]);

  // Link/unlink habits to a challenge
  const linkHabitToChallenge = useCallback((challengeId, habitId) => {
    setChallenges(prev => prev.map(ch => {
      if (ch.id !== challengeId) return ch;
      const ids = ch.linkedHabitIds || [];
      if (ids.includes(habitId)) return ch;
      return { ...ch, linkedHabitIds: [...ids, habitId] };
    }));
  }, []);

  const unlinkHabitFromChallenge = useCallback((challengeId, habitId) => {
    setChallenges(prev => prev.map(ch => {
      if (ch.id !== challengeId) return ch;
      return { ...ch, linkedHabitIds: (ch.linkedHabitIds || []).filter(id => id !== habitId) };
    }));
  }, []);

  const linkAllHabitsToChallenge = useCallback((challengeId) => {
    setChallenges(prev => prev.map(ch => {
      if (ch.id !== challengeId) return ch;
      return { ...ch, linkedHabitIds: habits.map(h => h.id) };
    }));
  }, [habits]);

  // ── Onboarding / reset ──────────────────────────────────────────────────────

  const completeOnboarding = useCallback(() => setHasOnboarded(true), []);

  const resetAll = useCallback(async () => {
    await storeClearAll();
    setHabits(DEFAULT_HABITS);
    setCompletions({});
    setSettings(DEFAULT_SETTINGS);
    setChallenges([STARTER_CHALLENGE]);
    setPastChallenges([]);
    setDailySnapshot({});
    setHasOnboarded(false);
    setDateOffset(0);
  }, []);

  // ── Streak / progress helpers ───────────────────────────────────────────────

  const getStreakForHabit = useCallback((habitId) => {
    let streak = 0;
    const date = new Date();
    date.setDate(date.getDate() + dateOffset);
    while (true) {
      const dateStr = date.toISOString().split('T')[0];
      const dayCompletions = completions[dateStr] || {};
      const habit = habits.find(h => h.id === habitId);
      if (!habit) break;
      if ((dayCompletions[habitId] || 0) >= habit.volumeGoal) {
        streak++;
        date.setDate(date.getDate() - 1);
      } else break;
    }
    return streak;
  }, [completions, habits, dateOffset]);

  const getOverallStreak = useCallback(() => {
    let streak = 0;
    const date = new Date();
    date.setDate(date.getDate() + dateOffset);
    while (true) {
      const dateStr = date.toISOString().split('T')[0];
      const dayCompletions = completions[dateStr] || {};
      const snapshot = dailySnapshot[dateStr];
      const dayHabits = snapshot || habits;
      const allDone = dayHabits.length > 0 && dayHabits.every(h => (dayCompletions[h.id] || 0) >= h.volumeGoal);
      if (allDone) { streak++; date.setDate(date.getDate() - 1); }
      else break;
    }
    return streak;
  }, [completions, habits, dailySnapshot, dateOffset]);

  const getLastNDays = useCallback((n) => {
    const days = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() + dateOffset - i);
      const dateStr = d.toISOString().split('T')[0];
      const dayCompletions = completions[dateStr] || {};
      const snapshot = dailySnapshot[dateStr];
      const dayHabits = snapshot || habits.map(h => ({ id: h.id, name: h.name, icon: h.icon, volumeGoal: h.volumeGoal }));
      const done = dayHabits.filter(h => (dayCompletions[h.id] || 0) >= h.volumeGoal).length;
      days.push({ date: dateStr, completed: done, total: dayHabits.length, habits: dayHabits });
    }
    return days;
  }, [completions, habits, dailySnapshot, dateOffset]);

  const getLast30Days = useCallback(() => getLastNDays(30), [getLastNDays]);

  const theme = themes[settings.theme] || themes.light;

  if (!loaded) return null;

  return (
    <AppContext.Provider value={{
      habits, completions, settings, challenges, pastChallenges, hasOnboarded, theme,
      dateOffset, setDateOffset,
      modalOpen, setModalOpen,
      requestedTab, setRequestedTab,
      pendingHabitLinkChallenge, setPendingHabitLinkChallenge,
      getTodayCompletions, getHabitCount, isHabitDone, getCompletedCount, isAllDone,
      isChallengeHabitsDone,
      incrementHabit, decrementHabit,
      addHabit, updateHabit, deleteHabit,
      updateSettings,
      markChallengeDay, unmarkChallengeDay, editChallenge, createChallenge, deleteChallenge,
      archiveExpiredChallenge, completeChallengeImmediately,
      selectAllHabitsToday, resetAllHabitsToday,
      linkHabitToChallenge, unlinkHabitFromChallenge, linkAllHabitsToChallenge,
      completeOnboarding, resetAll,
      getStreakForHabit, getOverallStreak, getLast30Days, getLastNDays,
      todayStr,
    }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
