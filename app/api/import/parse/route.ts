import { NextResponse } from 'next/server';

// Keep the provider key exclusively on the server. This endpoint deliberately has
// conservative input bounds; production deployments should additionally configure
// a shared global rate limiter (e.g. Upstash) before exposing it publicly.
export async function POST(request: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ error: 'AI import is not configured. Add tasks manually instead.' }, { status: 503 });
  let body: { text?: string };
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Send a valid JSON request.' }, { status: 400 }); }
  const text = typeof body.text === 'string' ? body.text.trim().slice(0, 12000) : '';
  if (!text) return NextResponse.json({ error: 'Paste a syllabus or assignment text first.' }, { status: 400 });
  // Best-effort per-device daily cap, backed by a signed device token hash in
  // production storage. Until a shared datastore is configured, fail closed to
  // AI rather than pretending an in-memory cap is globally safe.
  if (!process.env.IMPORT_LIMITER_URL || !process.env.IMPORT_LIMITER_TOKEN) {
    return NextResponse.json({ error: 'AI import is temporarily unavailable. Manual entry is ready and always free.' }, { status: 503 });
  }
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!/^[a-f0-9]{64}$/i.test(token)) return NextResponse.json({ error: 'Device token required.' }, { status: 401 });
  try {
    const limiter = await fetch(process.env.IMPORT_LIMITER_URL, { method: 'POST', headers: { authorization: `Bearer ${process.env.IMPORT_LIMITER_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ token, limit: 5, window: 'day' }) });
    if (!limiter.ok) throw new Error('limiter');
    const quota = await limiter.json();
    if (quota.allowed !== true) return NextResponse.json({ error: 'Daily AI import limit reached. Add this task manually instead.' }, { status: 429 });
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.1, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Extract coursework assignments from text. Return JSON {"items":[{"title":string,"dueDate":"YYYY-MM-DD"|null,"effortHours":number,"weight":1|2|3,"sourceText":string}]}. Do not invent dates; use null when unclear. Weight 1=light, 2=normal, 3=high.' }, { role: 'user', content: text }] }) });
    if (!response.ok) return NextResponse.json({ error: response.status === 429 ? 'AI is busy right now. Add tasks manually instead.' : 'Could not read that text. Try again or add tasks manually.' }, { status: response.status === 429 ? 429 : 502 });
    const payload = await response.json();
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || '{"items":[]}');
    return NextResponse.json({ items: Array.isArray(parsed.items) ? parsed.items.slice(0, 30) : [] });
  } catch { return NextResponse.json({ error: 'AI import is temporarily unavailable. Add tasks manually instead.' }, { status: 503 }); }
}
