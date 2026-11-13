import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Event reminders the person picks themselves ("1 hour before", "1 day
// before", or a custom amount). They live on this device only:
//   - iOS/Android: real local notifications scheduled with expo-notifications,
//     so they fire even when the app is closed. No server needed.
//   - Web: saved in localStorage and fired by a small watcher while the site
//     is open in a tab (browsers can't schedule notifications ahead of time).
//
// Tapping a native reminder opens the event (same data shape the push router
// already understands: { type: 'event', eventId }).

export const REMINDER_PRESETS = [0, 15, 60, 180, 1440, 10080] as const;

export interface StoredReminder {
  eventId: string;
  title: string;
  eventTime: string; // naive local "YYYY-MM-DDTHH:MM:SS", same as events.event_time
  offsets: number[]; // minutes before start
  notifIds: string[]; // native scheduled notification ids
  fired: number[]; // web only: offsets already shown
}

type Store = Record<string, StoredReminder>;

const KEY = 'letsliinger:reminders:v1';
const isServer = typeof window === 'undefined';

async function readStore(): Promise<Store> {
  if (isServer) return {};
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Store) : {};
  } catch {
    return {};
  }
}

async function writeStore(store: Store): Promise<void> {
  if (isServer) return;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage full or unavailable: reminders just won't persist.
  }
}

// event_time is a naive local timestamp, so parse it as local time.
export function eventStartMs(eventTime: string | null): number | null {
  if (!eventTime) return null;
  const [datePart, timePart = '00:00:00'] = eventTime.replace(' ', 'T').split('T');
  const [y, m, d] = datePart.split('-').map(Number);
  const [hh = 0, mm = 0] = timePart.split(':').map(Number);
  const dt = new Date(y, (m ?? 1) - 1, d ?? 1, hh, mm);
  return isNaN(dt.getTime()) ? null : dt.getTime();
}

// "1 hour", "2 days", "45 min": the human gap used in the reminder text.
export function describeOffset(min: number, units: { minutes: string; hours: string; days: string }): string {
  if (min % 1440 === 0) return `${min / 1440} ${units.days}`;
  if (min % 60 === 0) return `${min / 60} ${units.hours}`;
  return `${min} ${units.minutes}`;
}

export async function getReminder(eventId: string): Promise<StoredReminder | null> {
  const store = await readStore();
  return store[eventId] ?? null;
}

async function cancelNative(ids: string[]) {
  if (Platform.OS === 'web') return;
  await Promise.all(ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
}

async function ensurePermission(): Promise<boolean> {
  if (Platform.OS === 'web') {
    if (typeof Notification === 'undefined') return true; // fall back to in-app banner
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return true; // in-app banner still works
    try {
      await Notification.requestPermission();
    } catch {
      // Older Safari uses a callback form; the in-app banner covers it.
    }
    return true;
  }
  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;
  const req = await Notifications.requestPermissionsAsync();
  if (req.status !== 'granted') return false;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('reminders', {
      name: 'Event reminders',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  return true;
}

export interface SetReminderResult {
  error?: 'denied' | 'no-time';
  skippedPast: number;
  scheduled: number;
}

// Replaces any reminders for this event with the given offsets.
// `bodyFor(offset)` builds the notification text in the person's language.
export async function setReminders(
  event: { id: string; title: string; event_time: string | null },
  offsets: number[],
  bodyFor: (offsetMin: number) => string
): Promise<SetReminderResult> {
  const start = eventStartMs(event.event_time);
  if (start == null) return { error: 'no-time', skippedPast: 0, scheduled: 0 };

  const store = await readStore();
  const existing = store[event.id];
  if (existing) await cancelNative(existing.notifIds);

  const unique = Array.from(new Set(offsets)).sort((a, b) => b - a);
  if (unique.length === 0) {
    delete store[event.id];
    await writeStore(store);
    return { skippedPast: 0, scheduled: 0 };
  }

  if (!(await ensurePermission())) return { error: 'denied', skippedPast: 0, scheduled: 0 };

  const now = Date.now();
  const future = unique.filter((o) => start - o * 60000 > now);
  const skippedPast = unique.length - future.length;

  const notifIds: string[] = [];
  if (Platform.OS !== 'web') {
    for (const o of future) {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: event.title,
          body: bodyFor(o),
          data: { type: 'event', eventId: event.id },
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.DATE,
          date: new Date(start - o * 60000),
          channelId: Platform.OS === 'android' ? 'reminders' : undefined,
        },
      });
      notifIds.push(id);
    }
  }

  if (future.length === 0) {
    delete store[event.id];
  } else {
    store[event.id] = {
      eventId: event.id,
      title: event.title,
      eventTime: event.event_time!,
      offsets: future,
      notifIds,
      fired: [],
    };
  }
  await writeStore(store);
  return { skippedPast, scheduled: future.length };
}

export async function clearReminders(eventId: string): Promise<void> {
  const store = await readStore();
  const existing = store[eventId];
  if (!existing) return;
  await cancelNative(existing.notifIds);
  delete store[eventId];
  await writeStore(store);
}

// Web only. Checks every 20s for reminders that are due and hands them to
// `show` (which uses a browser notification when allowed, otherwise an
// in-app banner). Returns a stop function.
export function startWebReminderWatcher(
  show: (r: { eventId: string; title: string; offset: number }) => void
): () => void {
  if (Platform.OS !== 'web' || isServer) return () => {};

  async function tick() {
    const store = await readStore();
    const now = Date.now();
    let changed = false;
    for (const r of Object.values(store)) {
      const start = eventStartMs(r.eventTime);
      if (start == null) continue;
      for (const o of r.offsets) {
        if (r.fired.includes(o)) continue;
        const due = start - o * 60000;
        // Fire if due, but skip ones more than 30 min stale (tab was closed).
        if (due <= now) {
          if (now - due < 30 * 60000) show({ eventId: r.eventId, title: r.title, offset: o });
          r.fired.push(o);
          changed = true;
        }
      }
      if (r.fired.length >= r.offsets.length && start < now) {
        delete store[r.eventId];
        changed = true;
      }
    }
    if (changed) await writeStore(store);
  }

  tick();
  const handle = setInterval(tick, 20000);
  return () => clearInterval(handle);
}
