import { NextResponse } from 'next/server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const key = process.env.GROQ_API_KEY;
  if (!key) return NextResponse.json({ error: 'Quiz generation needs GROQ_API_KEY. You can still add questions manually.' }, { status: 503 });
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!/^[a-f0-9]{64}$/i.test(token)) return NextResponse.json({ error: 'Device token required.' }, { status: 401 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: 'Invalid request.' }, { status: 400 }); }
  const theme = typeof body.theme === 'string' ? body.theme.trim().slice(0, 240) : '';
  const notes = typeof body.notes === 'string' ? body.notes.trim().slice(0, 10000) : '';
  const count = Math.max(1, Math.min(5, Math.floor(Number(body.count) || 3)));
  if (!theme) return NextResponse.json({ error: 'Add a topic or theme to quiz yourself on.' }, { status: 400 });
  // Quota enforcement is delegated to a shared, durable adapter. Do not silently
  // fall back to a process-local limit on serverless deployments.
  if (!process.env.IMPORT_LIMITER_URL || !process.env.IMPORT_LIMITER_TOKEN) return NextResponse.json({ error: 'AI quiz needs the shared rate limiter configured. Use the manual quiz option for now.' }, { status: 503 });
  try {
    const limit = await fetch(process.env.IMPORT_LIMITER_URL, { method: 'POST', headers: { authorization: `Bearer ${process.env.IMPORT_LIMITER_TOKEN}`, 'content-type': 'application/json' }, body: JSON.stringify({ token, limit: 10, window: 'day', feature: 'study-quiz' }) });
    if (!limit.ok || (await limit.json()).allowed !== true) return NextResponse.json({ error: 'AI quiz limit reached or limiter unavailable. Try manual questions.' }, { status: 429 });
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', { method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' }, body: JSON.stringify({ model: 'llama-3.3-70b-versatile', temperature: 0.25, response_format: { type: 'json_object' }, messages: [
      { role: 'system', content: `Create exactly ${count} fair multiple-choice study questions grounded in the supplied learning notes and topic. Return JSON only: {"questions":[{"question":"...","options":["...","...","...","..."],"answerIndex":0,"explanation":"..."}]}. Each question must have exactly four distinct options and a single correct answerIndex from 0 to 3. Do not ask about dates or trivia unless present in the notes. If notes are short, test core understanding of the topic without inventing facts. Questions should assess understanding, not trick the learner.` },
      { role: 'user', content: `Topic/theme: ${theme}\n\nLearning notes / material:\n${notes || '(No notes provided. Use only standard, established knowledge about the stated topic.)'}` },
    ] }) });
    if (!response.ok) return NextResponse.json({ error: response.status === 429 ? 'AI is busy. Try again shortly or use manual questions.' : 'Could not make this quiz. Try again or use manual questions.' }, { status: response.status === 429 ? 429 : 502 });
    const payload = await response.json();
    const parsed = JSON.parse(payload.choices?.[0]?.message?.content || '{}');
    const questions = Array.isArray(parsed.questions) ? parsed.questions.slice(0, count).filter((q: any) => typeof q?.question === 'string' && Array.isArray(q.options) && q.options.length === 4 && q.options.every((o: any) => typeof o === 'string') && Number.isInteger(q.answerIndex) && q.answerIndex >= 0 && q.answerIndex < 4).map((q: any) => ({ question: q.question.slice(0, 600), options: q.options.map((o: string) => o.slice(0, 240)), answerIndex: q.answerIndex, explanation: typeof q.explanation === 'string' ? q.explanation.slice(0, 500) : '' })) : [];
    if (questions.length !== count) return NextResponse.json({ error: 'The quiz was incomplete. Try again.' }, { status: 502 });
    return NextResponse.json({ questions });
  } catch { return NextResponse.json({ error: 'Quiz generation is temporarily unavailable. Try again or use manual questions.' }, { status: 503 }); }
}
