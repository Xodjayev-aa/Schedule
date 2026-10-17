import { NextResponse } from 'next/server';
import { deviceKey, isDeviceToken, isPushConfigured, redis, type DeviceRecord, type ReminderTask } from '@/lib/reminders';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({ configured: isPushConfigured(), publicKey: process.env.VAPID_PUBLIC_KEY || null });
}
export async function POST(request: Request) {
  if (!isPushConfigured()) return NextResponse.json({ error: 'Push reminders need server setup. See the Android push setup in README.' }, { status: 503 });
  const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!isDeviceToken(token)) return NextResponse.json({ error: 'Invalid device token.' }, { status: 401 });
  try {
    const body = await request.json();
    const subscription = body.subscription;
    if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) return NextResponse.json({ error: 'Invalid browser push subscription.' }, { status: 400 });
    const tasks: ReminderTask[] = Array.isArray(body.tasks) ? body.tasks.slice(0, 100).filter((task: any) => typeof task?.id === 'string' && typeof task?.title === 'string' && typeof task?.dueAt === 'string' && !Number.isNaN(Date.parse(task.dueAt)) && typeof task.done === 'boolean').map((task: any) => ({ id: task.id.slice(0, 100), title: task.title.slice(0, 160), dueAt: new Date(task.dueAt).toISOString(), done: task.done })) : [];
    const key = deviceKey(token);
    const previous = await redis<DeviceRecord | null>('GET', key);
    const sent = Array.isArray(previous?.sent) ? previous.sent.filter(id => previous.tasks.some(old => old.id === id && tasks.some(task => task.id === id && task.dueAt === old.dueAt))) : [];
    const record: DeviceRecord = { subscription, tasks, sent };
    await redis('SET', key, JSON.stringify(record));
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: 'Could not save this device for reminders.' }, { status: 503 });
  }
}
export async function DELETE(request: Request) {
  if (!isPushConfigured()) return NextResponse.json({ ok: true });
  const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!isDeviceToken(token)) return NextResponse.json({ error: 'Invalid device token.' }, { status: 401 });
  try { await redis('DEL', deviceKey(token)); return NextResponse.json({ ok: true }); }
  catch { return NextResponse.json({ error: 'Could not disable reminders right now.' }, { status: 503 }); }
}
