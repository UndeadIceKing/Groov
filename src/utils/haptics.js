import { Platform, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

// On Android, expo-haptics may not produce perceptible feedback on all devices.
// We use the native Vibration API as a reliable fallback.

async function tryHaptic(fn) {
  if (Platform.OS === 'web') return;
  try {
    await fn();
  } catch {
    // Fallback: basic device vibration
    try { Vibration.vibrate(30); } catch {}
  }
}

export async function lightImpact() {
  await tryHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export async function mediumImpact() {
  await tryHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

export async function heavyImpact() {
  await tryHaptic(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

export async function successNotification() {
  await tryHaptic(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}
