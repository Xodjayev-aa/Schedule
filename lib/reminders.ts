import { createHash } from 'node:crypto';
import webpush from 'web-push';

export type ReminderTask = { id: string; title: string; dueAt: string; done: boolean };
export type DeviceRecord = { subscription: webpush.PushSubscription; tasks: ReminderTask[]; sent: string[] };

export function isPushConfigured() {
  return Boolean(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}
export function configurePush() {
  if (!isPushConfigured()) throw new Error('Push service is not configured');
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
}
export async function redis<T>(...args: (string | number)[]): Promise<T> {
  const response = await fetch(process.env.UPSTASH_REDIS_REST_URL!, {
    method: 'POST', headers: { authorization: `Bearer ${process.env.UPSTASH_REDIS_REST_TOKEN}`, 'content-type': 'application/json' },
    body: JSON.stringify(args.map(String)), cache: 'no-store',
  });
  if (!response.ok) throw new Error(`Storage unavailable (${response.status})`);
  const result = await response.json();
  if (result.error) throw new Error('Storage command failed');
  return result.result as T;
}
export function digestDeviceToken(token: string) {
  return createHash('sha256').update(token).digest('hex');
}
export function deviceKey(token: string) { return `questline:device:${digestDeviceToken(token)}`; }
export function isDeviceToken(token: string) { return /^[a-f0-9]{64}$/i.test(token); }
