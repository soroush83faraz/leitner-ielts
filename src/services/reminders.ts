import * as Notifications from 'expo-notifications';
import { AndroidImportance } from 'expo-notifications';
import { Platform } from 'react-native';

const REMINDER_ID = 'daily-review';
const CHANNEL = 'reminders';

export const remindersSupported = Platform.OS !== 'web';

export type ReminderResult = { ok: true } | { ok: false; reason: 'denied' | 'unsupported' | 'error' };

async function ensurePermission(): Promise<boolean> {
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  if (!cur.canAskAgain) return false;
  const asked = await Notifications.requestPermissionsAsync();
  return asked.granted;
}

/**
 * Schedules one repeating local notification per day. Call this only from a user action
 * after the app has explained why it needs notifications; it asks for permission at that moment.
 */
export async function enableDailyReminder(hour: number, minute: number): Promise<ReminderResult> {
  if (!remindersSupported) return { ok: false, reason: 'unsupported' };
  try {
    if (!(await ensurePermission())) return { ok: false, reason: 'denied' };
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync(CHANNEL, { name: 'یادآور مرور', importance: AndroidImportance.DEFAULT });
    }
    await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
    await Notifications.scheduleNotificationAsync({
      identifier: REMINDER_ID,
      content: { title: 'وقت مرور لایتنر', body: 'چند کارت منتظر مرور کوتاه شما هستند.' },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute, channelId: CHANNEL },
    });
    return { ok: true };
  } catch {
    return { ok: false, reason: 'error' };
  }
}

export async function disableDailyReminder(): Promise<void> {
  if (!remindersSupported) return;
  await Notifications.cancelScheduledNotificationAsync(REMINDER_ID).catch(() => undefined);
}
