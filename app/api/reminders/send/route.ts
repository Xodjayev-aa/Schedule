import { NextResponse } from 'next/server';
import webpush from 'web-push';
import { configurePush, isPushConfigured, redis, type DeviceRecord } from '@/lib/reminders';
export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(request: Request) {
  const secret = process.env.REMINDER_CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!isPushConfigured()) return NextResponse.json({ error: 'Push service is not configured.' }, { status: 503 });
  try {
    configurePush();
    let cursor = '0', delivered = 0, expired = 0;
    const now = Date.now();
    do {
      const result = await redis<[string, string[]]>('SCAN', cursor, 'MATCH', 'questline:device:*', 'COUNT', '100');
      cursor = result[0];
      for (const key of result[1]) {
        const record = await redis<DeviceRecord | null>('GET', key);
        if (!record?.subscription || !Array.isArray(record.tasks)) continue;
        const sent = new Set(record.sent || []);
        let changed = false;
        for (const task of record.tasks) {
          if (task.done || sent.has(task.id)) continue;
          // Remind approximately three hours before the deadline. GitHub's
          // hourly schedule means delivery can be up to about an hour later.
          const deadline = new Date(task.dueAt).getTime();
          const remindAt = deadline - 3 * 60 * 60 * 1000;
          if (now < remindAt || now >= deadline) continue;
          try {
            await webpush.sendNotification(record.subscription, JSON.stringify({ title: 'QuestLine · deadline coming up', body: `${task.title} is due in about three hours. You’ve got this.`, url: '/' }), { TTL: 60 * 60 * 4 });
            sent.add(task.id); delivered++; changed = true;
          } catch (error: any) {
            if (error?.statusCode === 404 || error?.statusCode === 410) { await redis('DEL', key); expired++; changed = false; break; }
            throw error;
          }
        }
        if (changed) { record.sent = Array.from(sent); await redis('SET', key, JSON.stringify(record)); }
      }
    } while (cursor !== '0');
    return NextResponse.json({ ok: true, delivered, expired });
  } catch (error) {
    console.error('Reminder run failed:', error);
    return NextResponse.json({ error: 'Reminder run failed.' }, { status: 503 });
  }
}
