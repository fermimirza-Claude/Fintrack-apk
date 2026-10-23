import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import type { Repo } from '../db/repo';
import { parseYMD, todayJakarta } from '../domain/dates';
import { formatRupiah } from '../domain/money';
import { TX_TYPE_LABEL } from '../domain/types';

const CHANNEL = 'reminders';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

async function ensureChannel() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: 'Pengingat transaksi',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }
}

export async function requestNotificationPermission(): Promise<boolean> {
  await ensureChannel();
  const cur = await Notifications.getPermissionsAsync();
  if (cur.granted) return true;
  const req = await Notifications.requestPermissionsAsync();
  return req.granted;
}

/** 08:00 WIB on the given date as an absolute instant (WIB = UTC+7). */
function reminderInstant(date: string): Date {
  const { y, m, d } = parseYMD(date);
  return new Date(Date.UTC(y, m - 1, d, 1, 0, 0));
}

/**
 * Re-creates local reminders for every active recurring rule with "remind" on.
 * Called at startup and after recurring rules change, so reminders never drift from the data.
 */
export async function syncReminders(repo: Repo): Promise<void> {
  try {
    const perm = await Notifications.getPermissionsAsync();
    if (!perm.granted) return;
    await ensureChannel();
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
    for (const n of scheduled) {
      if ((n.content.data as any)?.kind === 'recurring') await Notifications.cancelScheduledNotificationAsync(n.identifier);
    }
    const today = todayJakarta();
    for (const r of await repo.listRecurring()) {
      if (!r.isActive || !r.remind || r.nextDate < today) continue;
      const when = reminderInstant(r.nextDate);
      if (when.getTime() <= Date.now()) continue;
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: r.autoPost ? `${r.title} tercatat hari ini` : `Jadwal ${TX_TYPE_LABEL[r.type].toLowerCase()}: ${r.title}`,
          body: r.autoPost
            ? `${formatRupiah(r.amount)} dicatat otomatis saat Anda membuka FinTrack.`
            : `${formatRupiah(r.amount)} jatuh tempo hari ini. Buka FinTrack untuk mencatatnya.`,
          data: { kind: 'recurring', ruleId: r.id },
        },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: when, channelId: CHANNEL } as any,
      });
      await repo.setRecurringNotification(r.id, id);
    }
  } catch (e) {
    console.warn('syncReminders failed', e);
  }
}
