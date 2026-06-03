import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestPermissions() {
  if (Platform.OS === 'web') return false;
  try {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    return false;
  }
}

export async function scheduleDaily(identifier, hour, minute, title, body) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: { title, body, sound: true },
      trigger: { hour, minute, repeats: true },
    });
  } catch (e) {
    console.warn('scheduleDaily failed:', e);
  }
}

export async function cancelNotification(identifier) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
  } catch {}
}

export async function cancelAll() {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelAllScheduledNotificationsAsync();
  } catch (e) {}
}

export async function scheduleHabitReminder(habit) {
  if (Platform.OS === 'web') return;
  const identifier = `habit-${habit.id}`;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
  if (!habit.reminder?.enabled) return;
  const { hour12, minute, ampm } = habit.reminder;
  let hour = hour12 % 12;
  if (ampm === 'PM') hour += 12;
  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: `${habit.icon} Time for: ${habit.name}`,
        body: 'Tap to log your habit!',
        sound: true,
      },
      trigger: { hour, minute, repeats: true },
    });
  } catch (e) {
    console.warn('scheduleHabitReminder failed:', e);
  }
}

// Apply all reminders from the settings.reminders array
export async function applyAllReminders(settings) {
  if (Platform.OS === 'web') return;

  const reminders = settings.reminders || [];

  if (!settings.notificationsEnabled) {
    await cancelAll();
    return;
  }

  const granted = await requestPermissions();
  if (!granted) return;

  // Cancel all existing reminder notifications first
  for (const r of reminders) {
    await Notifications.cancelScheduledNotificationAsync(`reminder-${r.id}`).catch(() => {});
  }
  // Also cancel legacy IDs
  await Notifications.cancelScheduledNotificationAsync('morning-reminder').catch(() => {});
  await Notifications.cancelScheduledNotificationAsync('evening-reminder').catch(() => {});

  for (const r of reminders) {
    if (!r.enabled) continue;
    const time = r.time || { hour12: 8, minute: 0, ampm: 'AM' };
    let hour = time.hour12 % 12;
    if (time.ampm === 'PM') hour += 12;
    try {
      await Notifications.scheduleNotificationAsync({
        identifier: `reminder-${r.id}`,
        content: { title: `🔔 ${r.label}`, body: "Time to check your habits!", sound: true },
        trigger: { hour, minute: time.minute, repeats: true },
      });
    } catch (e) {
      console.warn('applyAllReminders failed for', r.label, e);
    }
  }
}

// Legacy compat — used by SettingsScreen previously
export async function applyNotificationSettings(settings) {
  return applyAllReminders(settings);
}
