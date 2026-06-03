import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  TouchableOpacity,
} from 'react-native';
import { useApp } from '../context/AppContext';
import HabitCard from '../components/HabitCard';
import ProgressRing from '../components/ProgressRing';
import CelebrationOverlay from '../components/CelebrationOverlay';
import CompletionCelebration from '../components/CompletionCelebration';
import TrophyCelebration from '../components/TrophyCelebration';
import { playChime, playSuccessChime, playChallengeChime } from '../utils/sounds';
import { mediumImpact, heavyImpact, lightImpact, successNotification } from '../utils/haptics';

function getGreeting(offset = 0) {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function getDateString(offset = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
}

async function hapticFillSequence(hapticsEnabled) {
  if (!hapticsEnabled) return;
  const timings = [0, 70, 140, 200, 260, 310, 360, 410, 450, 490];
  for (const ms of timings) {
    setTimeout(() => lightImpact(), ms);
  }
  setTimeout(() => mediumImpact(), 530);
  setTimeout(() => mediumImpact(), 580);
  setTimeout(() => heavyImpact(), 680);
  setTimeout(() => heavyImpact(), 720);
  setTimeout(() => successNotification(), 780);
}

// Returns true if the challenge period has elapsed (today is after all challenge days)
function isChallengeExpiredFor(ch, today) {
  if (!ch.startDate) return false;
  const startMs = new Date(ch.startDate + 'T00:00:00').getTime();
  const todayMs = new Date(today + 'T00:00:00').getTime();
  const elapsed = Math.max(0, Math.floor((todayMs - startMs) / 86400000));
  return elapsed >= ch.days;
}

export default function TodayScreen() {
  const {
    habits, challenges, completions, getCompletedCount, isAllDone, incrementHabit, decrementHabit,
    isChallengeHabitsDone, settings, theme, markChallengeDay, unmarkChallengeDay,
    getHabitCount, dateOffset, todayStr,
    completeChallengeImmediately, selectAllHabitsToday, resetAllHabitsToday,
  } = useApp();

  const [celebrating, setCelebrating] = useState(false);
  const [fullCelebration, setFullCelebration] = useState(false);
  const [trophyCelebrating, setTrophyCelebrating] = useState(false);
  const allDoneCelebrated = useRef(false);

  // Reset the "already celebrated today" flag whenever the date rolls over
  const today = todayStr();
  useEffect(() => {
    allDoneCelebrated.current = false;
  }, [today]);

  const completed = getCompletedCount();
  const total = habits.length;
  const progress = total > 0 ? completed / total : 0;
  const allDone = isAllDone();

  // Shared logic for auto-claiming/completing challenges after habits are done.
  // Returns { anyClaimed, anyComplete } so callers can trigger sounds/trophies.
  const autoClaimChallenges = useCallback((justCompletedHabitId) => {
    const today = todayStr();
    let anyClaimed = false;
    let anyComplete = false;

    challenges.forEach(ch => {
      if (ch.completedDays.includes(today)) return;
      if (isChallengeExpiredFor(ch, today)) return;

      const ids = ch.linkedHabitIds || [];
      const relevant = ids.length > 0 ? habits.filter(h => ids.includes(h.id)) : habits;
      if (relevant.length === 0) return;

      const allRelevantDone = relevant.every(h => {
        if (justCompletedHabitId && h.id === justCompletedHabitId) return true;
        return getHabitCount(h.id) >= h.volumeGoal;
      });

      if (!allRelevantDone) return;

      const newDaysList = [...ch.completedDays, today];
      if (newDaysList.length >= ch.days) {
        completeChallengeImmediately(ch.id);
        anyComplete = true;
      } else {
        markChallengeDay(ch.id);
      }
      anyClaimed = true;
    });

    return { anyClaimed, anyComplete };
  }, [challenges, habits, getHabitCount, markChallengeDay, completeChallengeImmediately, todayStr]);

  const handleIncrement = useCallback(async (habit) => {
    const justCompleted = incrementHabit(habit.id);
    if (settings.hapticsEnabled) await mediumImpact();
    if (justCompleted && settings.soundEnabled) playChime();

    if (justCompleted) {
      // Compute synchronously: this habit just hit its goal; check every other habit
      // against the pre-increment completions (they haven't changed).
      const todayComps = completions[todayStr()] || {};
      const willAllBeDone = habits.every(h => {
        if (h.id === habit.id) return true;
        return (todayComps[h.id] || 0) >= h.volumeGoal;
      });

      const { anyClaimed, anyComplete } = autoClaimChallenges(habit.id);
      if (anyClaimed && settings.soundEnabled) playChallengeChime();
      if (anyComplete) setTimeout(() => setTrophyCelebrating(true), 100);

      if (willAllBeDone && !allDoneCelebrated.current) {
        allDoneCelebrated.current = true;
        if (settings.soundEnabled) playSuccessChime();
        hapticFillSequence(settings.hapticsEnabled);
        setFullCelebration(true);
      }
    }
  }, [habits, completions, todayStr, autoClaimChallenges, incrementHabit, settings]);

  const handleDecrement = useCallback(async (habit) => {
    const today = todayStr();
    const countBefore = getHabitCount(habit.id);
    decrementHabit(habit.id);
    allDoneCelebrated.current = false;

    const willBeDone = (countBefore - 1) >= habit.volumeGoal;
    if (!willBeDone) {
      challenges.forEach(ch => {
        if (!ch.completedDays.includes(today)) return;
        const ids = ch.linkedHabitIds || [];
        const relevant = ids.length > 0 ? habits.filter(h => ids.includes(h.id)) : habits;
        if (relevant.some(h => h.id === habit.id)) {
          unmarkChallengeDay(ch.id);
        }
      });
    }
  }, [decrementHabit, challenges, habits, getHabitCount, unmarkChallengeDay, todayStr]);

  const handleSelectAll = useCallback(async () => {
    const today = todayStr();

    if (allDone) {
      // Unselect all
      resetAllHabitsToday();
      allDoneCelebrated.current = false;
      challenges.forEach(ch => {
        if (ch.completedDays.includes(today)) unmarkChallengeDay(ch.id);
      });
    } else {
      // Select all — every habit will be at goal, so all challenges with linked habits qualify
      selectAllHabitsToday();

      let anyClaimed = false;
      let anyComplete = false;
      challenges.forEach(ch => {
        if (ch.completedDays.includes(today)) return;
        if (isChallengeExpiredFor(ch, today)) return;
        const ids = ch.linkedHabitIds || [];
        const relevant = ids.length > 0 ? habits.filter(h => ids.includes(h.id)) : habits;
        if (relevant.length === 0) return;

        const newDaysList = [...ch.completedDays, today];
        if (newDaysList.length >= ch.days) {
          completeChallengeImmediately(ch.id);
          anyComplete = true;
        } else {
          markChallengeDay(ch.id);
        }
        anyClaimed = true;
      });

      if (anyClaimed && settings.soundEnabled) playChallengeChime();

      if (!allDoneCelebrated.current) {
        allDoneCelebrated.current = true;
        if (settings.soundEnabled) playSuccessChime();
        hapticFillSequence(settings.hapticsEnabled);
        setFullCelebration(true);
      }
      if (anyComplete) {
        setTimeout(() => setTrophyCelebrating(true), 500);
      }
    }
  }, [
    allDone, habits, challenges, todayStr,
    selectAllHabitsToday, resetAllHabitsToday,
    markChallengeDay, unmarkChallengeDay, completeChallengeImmediately,
    settings,
  ]);

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.primary }]}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
        style={{ backgroundColor: theme.bg }}
      >
        {/* Header */}
        <View style={[styles.header, { backgroundColor: theme.primary }]}>
          <Text style={styles.greeting}>{getGreeting(dateOffset)} 👋</Text>
          <Text style={styles.date}>{getDateString(dateOffset)}</Text>
          {dateOffset !== 0 && (
            <Text style={{ color: 'rgba(255,255,255,0.7)', fontSize: 11, marginTop: 2 }}>
              (Simulated date{dateOffset > 0 ? ' +' : ' '}{dateOffset}d)
            </Text>
          )}

          <View style={styles.ringRow}>
            <ProgressRing
              progress={progress}
              size={110}
              strokeWidth={10}
              color="#fff"
              bg="rgba(255,255,255,0.25)"
              label={`${completed}/${total}`}
              sublabel="habits"
              sublabelColor="rgba(255,255,255,0.85)"
            />
            <View style={styles.ringLabels}>
              <Text style={styles.ringTitle}>
                {allDone ? '🎉 All done!' : `${total - completed} remaining`}
              </Text>
              <Text style={styles.ringSubtitle}>
                {allDone
                  ? 'Amazing work today!'
                  : `Keep going, you're at ${Math.round(progress * 100)}%`}
              </Text>
            </View>
          </View>
        </View>

        {/* Habits */}
        <View style={styles.content}>
          {habits.length === 0 ? (
            <View style={[styles.empty, { borderColor: theme.border }]}>
              <Text style={styles.emptyEmoji}>🌱</Text>
              <Text style={[styles.emptyTitle, { color: theme.text }]}>No habits yet</Text>
              <Text style={[styles.emptyBody, { color: theme.textMuted }]}>
                Go to Habits tab to add your first habit.
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.sectionHeader}>
                <Text style={[styles.sectionLabel, { color: theme.textMuted }]}>TODAY'S HABITS</Text>
                <TouchableOpacity
                  onPress={handleSelectAll}
                  style={[styles.selectAllBtn, { borderColor: allDone ? theme.primary : theme.border }]}
                >
                  <Text style={[styles.selectAllBtnText, { color: allDone ? theme.primary : theme.textMuted }]}>
                    {allDone ? 'Unmark All' : 'Mark All'}
                  </Text>
                </TouchableOpacity>
              </View>
              {habits.map(habit => (
                <HabitCard
                  key={habit.id}
                  habit={habit}
                  onIncrement={() => handleIncrement(habit)}
                  onDecrement={() => handleDecrement(habit)}
                />
              ))}
            </>
          )}
        </View>
      </ScrollView>

      <CelebrationOverlay
        visible={celebrating}
        onDone={() => setCelebrating(false)}
      />

      <CompletionCelebration
        visible={fullCelebration}
        onDone={() => setFullCelebration(false)}
        primaryColor={theme.primary}
      />

      <TrophyCelebration
        visible={trophyCelebrating}
        onDone={() => setTrophyCelebrating(false)}
        settings={settings}
        theme={theme}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { paddingBottom: 32 },
  header: {
    padding: 24,
    paddingTop: 16,
    paddingBottom: 32,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  greeting: { fontSize: 22, fontWeight: 'bold', color: '#fff' },
  date: { fontSize: 13, color: 'rgba(255,255,255,0.7)', marginTop: 2, marginBottom: 20 },
  ringRow: { flexDirection: 'row', alignItems: 'center', gap: 20 },
  ringLabels: { flex: 1 },
  ringTitle: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  ringSubtitle: { fontSize: 13, color: 'rgba(255,255,255,0.75)', marginTop: 4, lineHeight: 18 },
  content: { padding: 20 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12,
  },
  sectionLabel: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase',
  },
  selectAllBtn: {
    borderWidth: 1.5, borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4,
  },
  selectAllBtnText: { fontSize: 12, fontWeight: '700' },
  empty: {
    borderWidth: 2, borderStyle: 'dashed', borderRadius: 16,
    padding: 36, alignItems: 'center', marginTop: 24,
  },
  emptyEmoji: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 18, fontWeight: '700', marginBottom: 8 },
  emptyBody: { fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
