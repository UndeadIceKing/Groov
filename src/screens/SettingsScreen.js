import React, { useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, SafeAreaView,
  Switch, TouchableOpacity, Alert, Platform, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useApp } from '../context/AppContext';
import TimePicker from '../components/TimePicker';
import { applyAllReminders, cancelNotification, scheduleHabitReminder } from '../utils/notifications';
import { lightImpact, mediumImpact } from '../utils/haptics';

function formatTime(t) {
  if (!t) return '—';
  const { hour12, minute, ampm } = t;
  if (hour12 === undefined) return '—';
  return `${hour12}:${String(minute).padStart(2, '0')} ${ampm}`;
}

function Row({ label, sublabel, right, theme, onPress }) {
  const content = (
    <View style={[styles.row, { borderBottomColor: theme.border }]}>
      <View style={styles.rowLeft}>
        <Text style={[styles.rowLabel, { color: theme.text }]}>{label}</Text>
        {sublabel && <Text style={[styles.rowSub, { color: theme.textMuted }]}>{sublabel}</Text>}
      </View>
      <View style={styles.rowRight}>{right}</View>
    </View>
  );
  if (onPress) {
    return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity>;
  }
  return content;
}

function Section({ title, children, theme }) {
  return (
    <View style={[styles.section, { backgroundColor: theme.surface, borderColor: theme.border }]}>
      <Text style={[styles.sectionTitle, { color: theme.textMuted }]}>{title}</Text>
      {children}
    </View>
  );
}

export default function SettingsScreen() {
  const { settings, updateSettings, theme, resetAll, dateOffset, setDateOffset, habits, updateHabit } = useApp();
  const [timeModal, setTimeModal] = useState(null); // index of reminder being edited, or null
  const [editingLabel, setEditingLabel] = useState(null); // index of reminder label being edited
  const [labelDraft, setLabelDraft] = useState('');

  const reminders = settings.reminders || [];

  const updateReminders = (newReminders) => {
    updateSettings({ reminders: newReminders });
    applyAllReminders({ ...settings, reminders: newReminders });
  };

  const toggleReminderEnabled = (idx) => {
    const r = reminders[idx];
    const next = reminders.map((r2, i) => i === idx ? { ...r2, enabled: !r2.enabled } : r2);
    updateReminders(next);

    // If this reminder is linked to a habit, sync back
    if (r.habitId) {
      const habit = habits.find(h => h.id === r.habitId);
      if (habit) updateHabit(r.habitId, { reminder: { ...(habit.reminder || {}), enabled: !r.enabled } });
    }
  };

  const updateReminderTime = (idx, time) => {
    const r = reminders[idx];
    const next = reminders.map((r2, i) => i === idx ? { ...r2, time } : r2);
    updateReminders(next);

    // If this reminder is linked to a habit, sync back
    if (r.habitId) {
      const habit = habits.find(h => h.id === r.habitId);
      if (habit) {
        const updatedReminder = { hour12: time.hour12, minute: time.minute, ampm: time.ampm, enabled: r.enabled };
        updateHabit(r.habitId, { reminder: updatedReminder });
        scheduleHabitReminder({ ...habit, reminder: updatedReminder });
      }
    }
  };

  const addReminder = () => {
    if (reminders.length >= 6) {
      Alert.alert('Limit reached', 'You can have up to 6 reminders.');
      return;
    }
    lightImpact();
    const next = [...reminders, {
      id: Date.now().toString(),
      label: `Reminder ${reminders.length + 1}`,
      time: { hour12: 9, minute: 0, ampm: 'AM' },
      enabled: true,
    }];
    updateReminders(next);
  };

  const removeReminder = (idx) => {
    const r = reminders[idx];
    lightImpact();
    Alert.alert('Remove Reminder', 'Delete this reminder?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove', style: 'destructive', onPress: () => {
          const next = reminders.filter((_, i) => i !== idx);
          updateReminders(next);

          // If linked to a habit, disable the habit's reminder and cancel notification
          if (r.habitId) {
            const habit = habits.find(h => h.id === r.habitId);
            if (habit) {
              updateHabit(r.habitId, { reminder: { ...(habit.reminder || {}), enabled: false } });
              cancelNotification(`habit-${r.habitId}`);
            }
          }
        },
      },
    ]);
  };

  const startEditLabel = (idx) => {
    setEditingLabel(idx);
    setLabelDraft(reminders[idx].label);
  };

  const saveLabel = () => {
    if (editingLabel === null) return;
    const next = reminders.map((r, i) => i === editingLabel ? { ...r, label: labelDraft.trim() || r.label } : r);
    updateSettings({ reminders: next });
    setEditingLabel(null);
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will permanently delete all habits, progress, challenges, and settings. The app will reset completely.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Everything',
          style: 'destructive',
          onPress: async () => {
            await resetAll();
            Alert.alert('Done', 'All data cleared. The app has been reset.');
          },
        },
      ]
    );
  };

  const adjustDay = (delta) => {
    setDateOffset(prev => prev + delta);
  };

  const formattedDevDate = (() => {
    const d = new Date();
    d.setDate(d.getDate() + dateOffset);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  })();

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: theme.bg }]}>
      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <Text style={[styles.heading, { color: theme.text }]}>Settings</Text>

        {/* Appearance */}
        <Section title="APPEARANCE" theme={theme}>
          <Row
            label="Dark Mode"
            sublabel="Switch between light and dark theme"
            theme={theme}
            right={
              <Switch
                value={settings.theme === 'dark'}
                onValueChange={v => updateSettings({ theme: v ? 'dark' : 'light' })}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#fff"
              />
            }
          />
        </Section>

        {/* Notifications */}
        <Section title="NOTIFICATIONS" theme={theme}>
          <Row
            label="Enable Notifications"
            sublabel={Platform.OS === 'web' ? 'Push notifications on device only' : 'Master toggle for all reminders'}
            theme={theme}
            right={
              <Switch
                value={settings.notificationsEnabled}
                onValueChange={v => {
                  updateSettings({ notificationsEnabled: v });
                  applyAllReminders({ ...settings, notificationsEnabled: v });
                }}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#fff"
              />
            }
          />

          {reminders.map((r, i) => {
            const linkedHabit = r.habitId ? habits.find(h => h.id === r.habitId) : null;
            return (
              <View key={r.id ?? i} style={[styles.reminderBlock, { borderTopColor: theme.border }]}>
                {/* Label row */}
                <View style={styles.reminderLabelRow}>
                  {editingLabel === i && !r.habitId ? (
                    <TextInput
                      style={[styles.labelInput, { color: theme.text, borderColor: theme.border }]}
                      value={labelDraft}
                      onChangeText={setLabelDraft}
                      onBlur={saveLabel}
                      onSubmitEditing={saveLabel}
                      autoFocus
                      returnKeyType="done"
                    />
                  ) : (
                    <TouchableOpacity
                      onPress={() => !r.habitId && startEditLabel(i)}
                      style={{ flex: 1 }}
                      activeOpacity={r.habitId ? 1 : 0.7}
                    >
                      <View style={styles.reminderLabelInner}>
                        {linkedHabit && (
                          <Text style={styles.habitReminderIcon}>
                            {linkedHabit.icon ?? '🔔'}
                          </Text>
                        )}
                        <Text style={[styles.reminderLabel, { color: theme.text }]}>{r.label}</Text>
                        {r.habitId && (
                          <View style={[styles.habitBadge, { backgroundColor: theme.primaryLight }]}>
                            <Text style={[styles.habitBadgeText, { color: theme.primary }]}>Habit</Text>
                          </View>
                        )}
                      </View>
                      <Text style={[styles.reminderSublabel, { color: theme.textMuted }]}>
                        {settings.notificationsEnabled ? `Fires at ${formatTime(r.time)}` : 'Notifications disabled'}
                      </Text>
                    </TouchableOpacity>
                  )}
                  <Switch
                    value={r.enabled && settings.notificationsEnabled}
                    onValueChange={() => settings.notificationsEnabled && toggleReminderEnabled(i)}
                    trackColor={{ false: theme.border, true: theme.primary }}
                    thumbColor="#fff"
                    style={{ opacity: settings.notificationsEnabled ? 1 : 0.4 }}
                  />
                </View>
                {/* Time + delete row */}
                <View style={styles.reminderActionsRow}>
                  <TouchableOpacity
                    style={[styles.timeBtn, { borderColor: theme.border, opacity: settings.notificationsEnabled && r.enabled ? 1 : 0.4 }]}
                    onPress={() => settings.notificationsEnabled && r.enabled && setTimeModal(i)}
                  >
                    <Text style={[styles.timeBtnText, { color: theme.primary }]}>{formatTime(r.time)}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteReminderBtn} onPress={() => removeReminder(i)}>
                    <Ionicons name="trash-outline" size={18} color={theme.danger} />
                  </TouchableOpacity>
                </View>
              </View>
            );
          })}

          <TouchableOpacity
            style={[styles.addReminderBtn, { borderColor: theme.primary }]}
            onPress={addReminder}
          >
            <Ionicons name="add-circle-outline" size={18} color={theme.primary} />
            <Text style={[styles.addReminderText, { color: theme.primary }]}>Add Reminder</Text>
          </TouchableOpacity>
        </Section>

        {/* Feedback */}
        <Section title="FEEDBACK" theme={theme}>
          <Row
            label="Sound Effects"
            sublabel="Chime when completing a habit"
            theme={theme}
            right={
              <Switch
                value={settings.soundEnabled}
                onValueChange={v => updateSettings({ soundEnabled: v })}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#fff"
              />
            }
          />
          <Row
            label="Haptic Feedback"
            sublabel="Vibration on check-off (device only)"
            theme={theme}
            right={
              <Switch
                value={settings.hapticsEnabled}
                onValueChange={v => updateSettings({ hapticsEnabled: v })}
                trackColor={{ false: theme.border, true: theme.primary }}
                thumbColor="#fff"
              />
            }
          />
        </Section>

        {/* Dev Tools */}
        <Section title="DEV TOOLS" theme={theme}>
          <View style={[styles.row, { borderBottomColor: theme.border }]}>
            <View style={styles.rowLeft}>
              <Text style={[styles.rowLabel, { color: theme.text }]}>Simulated Date</Text>
              <Text style={[styles.rowSub, { color: theme.textMuted }]}>{formattedDevDate}</Text>
              {dateOffset !== 0 && (
                <Text style={[styles.rowSub, { color: theme.warning }]}>
                  Offset: {dateOffset > 0 ? '+' : ''}{dateOffset} day{Math.abs(dateOffset) !== 1 ? 's' : ''}
                </Text>
              )}
            </View>
            <View style={styles.devDayControls}>
              <TouchableOpacity style={[styles.devBtn, { borderColor: theme.border }]} onPress={() => adjustDay(-1)}>
                <Text style={[styles.devBtnText, { color: theme.text }]}>−</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.devBtn, { borderColor: theme.border }]}
                onPress={() => setDateOffset(0)}
              >
                <Text style={[styles.devBtnText, { color: theme.textMuted, fontSize: 10 }]}>NOW</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.devBtn, { borderColor: theme.border }]} onPress={() => adjustDay(1)}>
                <Text style={[styles.devBtnText, { color: theme.text }]}>+</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Section>

        {/* Data */}
        <Section title="DATA" theme={theme}>
          <TouchableOpacity style={styles.dangerRow} onPress={handleClearData}>
            <Text style={styles.dangerText}>Clear All Data</Text>
            <Text style={[styles.dangerSub, { color: theme.textMuted }]}>
              Permanently removes all habits, progress, and settings
            </Text>
          </TouchableOpacity>
        </Section>

        <Text style={[styles.version, { color: theme.textMuted }]}>Habit Tracker v1.0</Text>
      </ScrollView>

      {timeModal !== null && reminders[timeModal] && (
        <TimePicker
          visible={true}
          hour12={reminders[timeModal].time?.hour12 ?? 8}
          minute={reminders[timeModal].time?.minute ?? 0}
          ampm={reminders[timeModal].time?.ampm ?? 'AM'}
          onClose={() => setTimeModal(null)}
          onSave={t => {
            updateReminderTime(timeModal, t);
            setTimeModal(null);
          }}
          theme={theme}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  scroll: { padding: 24, paddingBottom: 48 },
  heading: { fontSize: 28, fontWeight: 'bold', marginBottom: 20 },
  section: { borderRadius: 16, borderWidth: 1, marginBottom: 16, overflow: 'hidden' },
  sectionTitle: {
    fontSize: 11, fontWeight: '700', letterSpacing: 1,
    paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4,
  },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1,
  },
  rowLeft: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: '500' },
  rowSub: { fontSize: 12, marginTop: 2 },
  rowRight: { marginLeft: 12 },
  reminderBlock: {
    borderTopWidth: 1, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
  },
  reminderLabelRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  reminderLabelInner: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  habitReminderIcon: { fontSize: 16 },
  habitBadge: { borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  habitBadgeText: { fontSize: 11, fontWeight: '700' },
  labelInput: {
    flex: 1, fontSize: 15, fontWeight: '500', borderBottomWidth: 1,
    paddingVertical: 2, marginRight: 8,
  },
  reminderLabel: { fontSize: 15, fontWeight: '500' },
  reminderSublabel: { fontSize: 12, marginTop: 2 },
  reminderActionsRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  timeBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6, flex: 1 },
  timeBtnText: { fontSize: 14, fontWeight: '600', textAlign: 'center' },
  deleteReminderBtn: { padding: 6 },
  addReminderBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, margin: 12, padding: 10, borderRadius: 10, borderWidth: 1.5, borderStyle: 'dashed',
  },
  addReminderText: { fontSize: 14, fontWeight: '600' },
  devDayControls: { flexDirection: 'row', gap: 6 },
  devBtn: {
    width: 36, height: 36, borderRadius: 8, borderWidth: 1.5,
    alignItems: 'center', justifyContent: 'center',
  },
  devBtnText: { fontSize: 16, fontWeight: '700' },
  dangerRow: { paddingHorizontal: 16, paddingVertical: 14 },
  dangerText: { color: '#EF4444', fontSize: 15, fontWeight: '600' },
  dangerSub: { fontSize: 12, marginTop: 2 },
  version: { textAlign: 'center', fontSize: 12, marginTop: 8 },
});
