import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function setupAndroidChannel() {
  if (Platform.OS !== 'android') return;
  try {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Groov',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#4F46E5',
    });
  } catch {}
}

async function requestPermissions() {
  if (Platform.OS === 'web') return false;
  try {
    await setupAndroidChannel();
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  } catch (e) {
    return false;
  }
}

export async function cancelNotification(identifier) {
  if (Platform.OS === 'web') return;
  try {
    await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});
  } catch {}
}

async function cancelAll() {
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
  const granted = await requestPermissions();
  if (!granted) return;
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
        color: '#4F46E5',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DAILY,
        hour,
        minute,
      },
    });
  } catch (e) {
    console.warn('scheduleHabitReminder failed:', e);
  }
}

// Schedule a one-time notification for today at the given hour:minute if habits aren't done.
// Uses a date-keyed identifier so it can be cancelled per-day once habits are completed.
export async function scheduleEveningHabitReminder(today, hour = 20, minute = 0) {
  if (Platform.OS === 'web') return;
  const granted = await requestPermissions();
  if (!granted) return;

  const identifier = `evening-habit-${today}`;
  await Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {});

  const fireDate = new Date(`${today}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
  if (fireDate <= new Date()) return; // time already passed today

  try {
    await Notifications.scheduleNotificationAsync({
      identifier,
      content: {
        title: '🌙 Habit Check-in',
        body: "You still have habits left to complete today. Keep that streak going!",
        sound: true,
        color: '#4F46E5',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: fireDate,
      },
    });
  } catch (e) {
    console.warn('scheduleEveningHabitReminder failed:', e);
  }
}

export async function cancelEveningHabitReminder(today) {
  if (Platform.OS === 'web') return;
  await Notifications.cancelScheduledNotificationAsync(`evening-habit-${today}`).catch(() => {});
}

// Dev tool: fire an evening-style notification immediately
export async function sendTestNotification() {
  if (Platform.OS === 'web') return;
  const granted = await requestPermissions();
  if (!granted) return;
  await Notifications.scheduleNotificationAsync({
    content: {
      title: 'Finish Habits',
      body: "You still have habits left to complete today. Keep that streak going!",
      sound: true,
      color: '#4F46E5',
    },
    trigger: null,
  }).catch(() => {});
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
        content: { title: `🔔 ${r.label}`, body: "Time to check your habits!", sound: true, color: '#4F46E5' },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DAILY,
          hour,
          minute: time.minute,
        },
      });
    } catch (e) {
      console.warn('applyAllReminders failed for', r.label, e);
    }
  }
}
