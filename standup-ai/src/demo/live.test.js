import { describe, expect, it, vi } from 'vitest';
import {
  LiveError, createApi, createLive, escapeHTML, friendly, isLive, practiceMarkup, reviewMarkup, skillList, skillsMarkup,
} from '../../public/student-demo/live.js';

const icon = () => '';
const json = (body, status = 200) => ({ ok: status < 400, status, json: async () => body });
const HOSTILE = '<script>alert(1)</script>"\'&';
const Q = { id: 'q1', skillId: 's1', skillName: 'Factoring', topic: 'Algebra: Polynomials', stem: 'Which is x² + 5x + 6 factored?', choices: ['(x+1)(x+6)', '(x+2)(x+3)', '(x-2)(x-3)', '(x+5)(x+1)'], difficultyB: 0 };

// A fake backend keyed by "METHOD path"; unknown routes fail the test loudly.
function backend(routes) {
  const calls = [];
  const fn = vi.fn(async (url, init) => {
    const path = url.split('?')[0];
    calls.push({ method: init.method, url, body: init.body ? JSON.parse(init.body) : undefined });
    const handler = routes[`${init.method} ${path}`];
    if (!handler) throw new Error(`unexpected request ${init.method} ${url}`);
    return typeof handler === 'function' ? handler(calls.at(-1)) : handler;
  });
  return { fn, calls };
}
const live = (routes) => {
  const b = backend(routes);
  const rerender = vi.fn();
  return { ...b, rerender, l: createLive({ icon, rerender, fetchImpl: b.fn }) };
};
const click = (l, action, value) => l.action({ dataset: { action, value } });
const base = { sessionId: 'sess1', question: Q };

describe('opt-in live mode', () => {
  it('is only on for ?live=1 and importing the module makes no requests', () => {
    expect(['', '?tutor=live', '?live=0', '?live=true', '?x=live=1'].map(isLive)).toEqual([false, false, false, false, false]);
    expect(isLive('?live=1')).toBe(true);
    expect(isLive('?tutor=live&live=1')).toBe(true);
  });
  it('createLive on its own does not fetch until something is entered', () => {
    const { fn } = live({});
    expect(fn).not.toHaveBeenCalled();
  });
});

describe('api client', () => {
  it('sends JSON to /api/live and returns the parsed body', async () => {
    const { fn, calls } = backend({ 'POST /api/live/quiz/answer': json({ correct: true, mastered: false }) });
    const res = await createApi(fn).answer({ sessionId: 's', questionId: 'q', chosen: 1, clientAttemptId: 'a' });
    expect(res).toEqual({ correct: true, mastered: false });
    expect(calls[0]).toMatchObject({ method: 'POST', url: '/api/live/quiz/answer', body: { chosen: 1, clientAttemptId: 'a' } });
    expect(fn.mock.calls[0][1].headers['Content-Type']).toBe('application/json');
  });
  it('encodes the skill filter and omits an empty sessionId', async () => {
    const { calls, fn } = backend({ 'GET /api/live/review-items': json({ items: [] }), 'POST /api/live/quiz/next': json(base) });
    const api = createApi(fn);
    await api.reviewItems('a b&c');
    await api.next();
    expect(calls[0].url).toBe('/api/live/review-items?skillId=a%20b%26c');
    expect(calls[1].body).toEqual({});
  });
  it('treats 503 as "backend off" and maps error codes to friendly text', async () => {
    const off = await createApi(backend({ 'GET /api/live/progress': json({ error: { code: 'NO_KEY', message: 'x' } }, 503) }).fn).progress().catch((e) => e);
    expect(off).toBeInstanceOf(LiveError);
    expect(off.off).toBe(true);
    expect(friendly(off)).toBe('The live backend is off.');
    expect(friendly(new LiveError(402, 'SPEND_CAP'))).toMatch(/budget/);
    expect(friendly(new LiveError(500, 'MODEL'))).toMatch(/unavailable/);
    expect(friendly(new LiveError(400, 'BAD_INPUT', 'Message must be 1 to 1000 characters.'))).toBe('Message must be 1 to 1000 characters.');
    expect(friendly(new LiveError(400, 'BAD_INPUT'))).toBe('Something went wrong. Please try again.');
  });
  it('maps a network failure and an empty body to friendly errors', async () => {
    const down = await createApi(vi.fn().mockRejectedValue(new TypeError('Failed to fetch'))).progress().catch((e) => e);
    expect(down.code).toBe('NETWORK');
    expect(friendly(down)).toMatch(/Couldn’t reach/);
    const empty = await createApi(vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => { throw new Error('no body'); } })).progress().catch((e) => e);
    expect(empty).toBeInstanceOf(LiveError);
  });
});

describe('escaping server text', () => {
  it('escapes the demo characters', () => {
    expect(escapeHTML(HOSTILE)).toBe('&lt;script&gt;alert(1)&lt;/script&gt;&quot;&#39;&amp;');
  });
  const hostile = { ...Q, skillName: HOSTILE, topic: HOSTILE, stem: HOSTILE, choices: [HOSTILE, 'b', 'c', 'd'] };
  const clean = (html) => expect(html).not.toMatch(/<script|<\/script>/);
  it('practice markup, including feedback and errors', () => {
    const p = { status: 'ready', q: hostile, picked: 0, answer: { correct: false, mastered: true }, review: { feedback: HOSTILE, correctIndex: 1 }, work: HOSTILE, flagged: false, pending: false, error: HOSTILE };
    clean(practiceMarkup(p, icon));
    clean(practiceMarkup({ ...p, review: null }, icon)); // work text inside the textarea
    clean(practiceMarkup({ status: 'error', error: HOSTILE }, icon));
  });
  it('review list, skill picker, chat and note', () => {
    const item = { questionId: HOSTILE, skillId: HOSTILE, skillName: HOSTILE, topic: HOSTILE, stem: HOSTILE, choices: [HOSTILE], chosen: 0, wasCorrect: false, flagged: true, done: false };
    const r = { status: 'ready', items: [item], skillId: HOSTILE, error: HOSTILE, open: HOSTILE, chat: { messages: [{ role: 'user', text: HOSTILE }, { role: 'assistant', text: HOSTILE }], input: HOSTILE, pending: false, error: HOSTILE, note: { summary: HOSTILE }, sessionId: 's' } };
    clean(reviewMarkup(r, { skills: [{ skillId: 'z', name: HOSTILE }] }, icon));
  });
  it('live skills panel', () => {
    clean(skillsMarkup({ status: 'ready', data: { attempts: 3, correct: 2, skills: [{ name: HOSTILE, state: HOSTILE, pct: '<script>' }] } }, icon));
    clean(skillsMarkup({ status: 'error', error: HOSTILE }, icon));
  });
});

describe('the answer key stays hidden until the review call', () => {
  const ready = { status: 'ready', q: Q, picked: 0, review: null, work: '', flagged: false, pending: false, error: '' };
  const correctChoices = (html) => (html.match(/class="choice live-choice correct/g) || []).length;

  it('shows nothing about the key before answering or after a wrong answer', () => {
    const before = practiceMarkup({ ...ready, answer: null }, icon);
    const wrong = practiceMarkup({ ...ready, answer: { correct: false, mastered: false } }, icon);
    for (const html of [before, wrong]) {
      expect(correctChoices(html)).toBe(0);
      expect(html).not.toMatch(/correctIndex/);
    }
    expect(wrong).toContain('Not quite.');
    expect(wrong).toContain('Explain your work');
    expect(wrong).toContain('maxlength="1000"');
    expect(wrong).toContain('Show me the answer');
  });
  it('reveals it only once the review has returned', () => {
    const html = practiceMarkup({ ...ready, answer: { correct: false, mastered: false }, review: { feedback: 'You added instead of multiplying.', correctIndex: 1 } }, icon);
    expect(correctChoices(html)).toBe(1);
    expect(html).toContain('You added instead of multiplying.');
    expect(html).not.toContain('Submit explanation');
  });
  it('a correct answer shows only "Correct!": no feedback text, no explain box', () => {
    const html = practiceMarkup({ ...ready, picked: 1, answer: { correct: true, mastered: false } }, icon);
    expect(html).toContain('Correct!');
    expect(html).not.toContain('Explain your work');
    expect(correctChoices(html)).toBe(1); // just the student's own choice
  });
  it('offers the save toggle with its hint after any answer', () => {
    const html = practiceMarkup({ ...ready, picked: 1, answer: { correct: true, mastered: false }, flagged: true }, icon);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('Saved for tutor review');
    expect(html).toContain('Right but not fully confident? Save it to walk through with the tutor later.');
    expect(practiceMarkup({ ...ready, answer: null }, icon)).not.toContain('Save for tutor review');
  });
  it('renders the empty, off and loading states', () => {
    expect(practiceMarkup({ status: 'empty', answered: 0 }, icon)).toContain('npm run db:seed-demo');
    const off = practiceMarkup({ status: 'off' }, icon);
    expect(off).toContain('Live backend is off.');
    expect(off).toContain('href="/student-demo/index.html#overview"');
    expect(practiceMarkup({ status: 'loading' }, icon)).toContain('aria-busy="true"');
  });
});

describe('practice flow', () => {
  const answerWrong = { 'POST /api/live/quiz/answer': json({ correct: false, mastered: false }) };

  it('uses one clientAttemptId per question, even across a retry', async () => {
    let tries = 0;
    const { l, calls } = live({
      'POST /api/live/quiz/next': json(base),
      'POST /api/live/quiz/answer': () => (++tries === 1 ? json({ error: { code: 'MODEL' } }, 500) : json({ correct: true, mastered: false })),
    });
    l.enter('live-practice');
    await vi.waitFor(() => expect(l.state.practice.status).toBe('ready'));
    await click(l, 'live-pick', '1');
    await click(l, 'live-check');
    expect(l.state.practice.answer).toBeNull();
    expect(l.state.practice.error).toMatch(/unavailable/);
    await click(l, 'live-check');
    const answers = calls.filter((c) => c.url.endsWith('/quiz/answer'));
    expect(answers).toHaveLength(2);
    expect(answers[1].body.clientAttemptId).toBe(answers[0].body.clientAttemptId);
    expect(answers[0].body.clientAttemptId).toMatch(/^[0-9a-f-]{36}$/);
    expect(answers[0].body).toMatchObject({ sessionId: 'sess1', questionId: 'q1', chosen: 1 });

    // the next question gets a different id
    const first = l.state.practice.attemptId;
    await click(l, 'live-next');
    expect(l.state.practice.attemptId).not.toBe(first);
  });

  it('ignores a second check while the first is pending (no double submit)', async () => {
    let release;
    const { l, calls } = live({
      'POST /api/live/quiz/next': json(base),
      'POST /api/live/quiz/answer': () => new Promise((res) => { release = () => res(json({ correct: true, mastered: false })); }),
    });
    l.enter('live-practice');
    await vi.waitFor(() => expect(l.state.practice.status).toBe('ready'));
    await click(l, 'live-pick', '1');
    const first = click(l, 'live-check');
    await click(l, 'live-check');
    await click(l, 'live-pick', '2'); // picks are frozen while pending too
    release();
    await first;
    expect(calls.filter((c) => c.url.endsWith('/quiz/answer'))).toHaveLength(1);
    expect(l.state.practice.picked).toBe(1);
  });

  it('wrong answer -> explain -> review with the work, then save for later', async () => {
    const { l, calls } = live({
      'POST /api/live/quiz/next': json(base),
      ...answerWrong,
      'POST /api/live/quiz/review': json({ feedback: 'Step 2 added the constants.', correctIndex: 1 }),
      'POST /api/live/quiz/flag': json({ flagged: true }),
    });
    l.enter('live-practice');
    await vi.waitFor(() => expect(l.state.practice.status).toBe('ready'));
    await click(l, 'live-pick', '0');
    await click(l, 'live-check');
    expect(l.state.practice.answer).toEqual({ correct: false, mastered: false });
    expect(l.state.practice.review).toBeNull();
    l.state.practice.work = '  I added 2 and 3  ';
    await click(l, 'live-explain');
    expect(calls.find((c) => c.url.endsWith('/quiz/review')).body).toEqual({ questionId: 'q1', work: 'I added 2 and 3' });
    expect(l.state.practice.review).toEqual({ feedback: 'Step 2 added the constants.', correctIndex: 1 });
    await click(l, 'live-flag');
    expect(calls.at(-1).body).toEqual({ questionId: 'q1', flagged: true });
    expect(l.state.practice.flagged).toBe(true);
  });

  it('"Show me the answer" sends blank work', async () => {
    const { l, calls } = live({ 'POST /api/live/quiz/next': json(base), ...answerWrong, 'POST /api/live/quiz/review': json({ feedback: 'Because...', correctIndex: 1 }) });
    l.enter('live-practice');
    await vi.waitFor(() => expect(l.state.practice.status).toBe('ready'));
    await click(l, 'live-pick', '0');
    await click(l, 'live-check');
    await click(l, 'live-reveal');
    expect(calls.at(-1).body).toEqual({ questionId: 'q1', work: '' });
  });

  it('a correct answer never calls the review endpoint', async () => {
    const { l, calls } = live({ 'POST /api/live/quiz/next': json(base), 'POST /api/live/quiz/answer': json({ correct: true, mastered: true }) });
    l.enter('live-practice');
    await vi.waitFor(() => expect(l.state.practice.status).toBe('ready'));
    await click(l, 'live-pick', '1');
    await click(l, 'live-check');
    await click(l, 'live-explain');
    await click(l, 'live-reveal');
    expect(calls.filter((c) => c.url.includes('/review'))).toHaveLength(0);
    expect(practiceMarkup(l.state.practice, icon)).toContain('Skill mastered: Factoring!');
  });

  it('shows the backend-off state on 503 and the empty state when there is no question', async () => {
    const off = live({ 'POST /api/live/quiz/next': json({ error: { code: 'NO_KEY' } }, 503) });
    off.l.enter('live-practice');
    await vi.waitFor(() => expect(off.l.state.practice.status).toBe('off'));
    expect(practiceMarkup(off.l.state.practice, icon)).toContain('Back to the simulated demo');

    const none = live({ 'POST /api/live/quiz/next': json({ sessionId: 's', question: null }) });
    none.l.enter('live-practice');
    await vi.waitFor(() => expect(none.l.state.practice.status).toBe('empty'));
    expect(practiceMarkup(none.l.state.practice, icon)).toContain('npm run db:seed-demo');
  });
});

describe('review with tutor', () => {
  const item = (o) => ({ questionId: 'q1', skillId: 's1', skillName: 'Factoring', topic: 'Algebra', stem: 'Stem?', choices: ['a', 'b', 'c', 'd'], chosen: 0, wasCorrect: false, flagged: false, done: false, answeredAt: '2026-11-14T00:00:00Z', ...o });
  const items = [item({}), item({ questionId: 'q2', wasCorrect: true, flagged: true }), item({ questionId: 'q3', done: true }), item({ questionId: 'q4', skillId: 's2', skillName: 'Semicolons' })];
  const progress = { skills: [{ skillId: 's3', name: 'Apostrophes', state: 'unseen', pct: 0 }], history: [], attempts: 0, correct: 0 };

  it('lists skills with open counts, open items first, and keeps reviewed ones collapsed', async () => {
    const { l } = live({ 'GET /api/live/review-items': json({ items }), 'GET /api/live/progress': json(progress) });
    l.enter('live-review');
    await vi.waitFor(() => expect(l.state.review.status).toBe('ready'));
    expect(skillList(items, progress)).toEqual([
      { id: 's1', name: 'Factoring', open: 2 }, { id: 's2', name: 'Semicolons', open: 1 }, { id: 's3', name: 'Apostrophes', open: 0 },
    ]);
    expect(l.state.review.skillId).toBe('s1'); // most open items
    const html = reviewMarkup(l.state.review, progress, icon);
    expect(html).toContain('<span class="tag">Wrong</span>');
    expect(html).toContain('<span class="tag neutral">Saved</span>');
    expect(html).toContain('Reviewed (1)');
    expect(html).toContain('Your answer');
    expect(html).toContain('Unsave');
    expect(html).not.toMatch(/correctIndex/);
  });

  it('unsaves a question', async () => {
    const { l, calls } = live({ 'GET /api/live/review-items': json({ items }), 'GET /api/live/progress': json(progress), 'POST /api/live/quiz/flag': json({ flagged: false }) });
    l.enter('live-review');
    await vi.waitFor(() => expect(l.state.review.status).toBe('ready'));
    await click(l, 'live-unsave', 'q2');
    expect(calls.at(-1).body).toEqual({ questionId: 'q2', flagged: false });
    expect(l.state.review.items.find((i) => i.questionId === 'q2').flagged).toBe(false);
  });

  it('walks through a question: canned opener, then messages in one session, then finish', async () => {
    const replies = [{ sessionId: 'dd1', reply: 'What did you try first?' }, { sessionId: 'dd1', reply: 'Good. And then?' }];
    const { l, calls } = live({
      'GET /api/live/review-items': json({ items }), 'GET /api/live/progress': json(progress),
      'POST /api/live/tutor/message': () => json(replies.shift()),
      'POST /api/live/tutor/finish': json({ summary: 'Skips the sign flip.', strengths: '', effectiveMethods: {} }),
    });
    l.enter('live-review');
    await vi.waitFor(() => expect(l.state.review.status).toBe('ready'));
    await click(l, 'live-walk', 'q2'); // right-but-saved
    expect(calls.filter((c) => c.url.includes('/tutor'))).toHaveLength(0); // the opener is client-side: no request
    expect(reviewMarkup(l.state.review, progress, icon)).toContain('You got this one right but wanted to review it.');
    await click(l, 'live-finish');
    expect(calls.filter((c) => c.url.includes('/tutor'))).toHaveLength(0); // nothing to finish yet

    l.state.review.chat.input = 'I factored it';
    await click(l, 'live-send');
    l.state.review.chat.input = 'then checked';
    await click(l, 'live-send');
    const sent = calls.filter((c) => c.url.endsWith('/tutor/message'));
    expect(sent[0].body).toEqual({ sessionId: undefined, questionId: 'q2', message: 'I factored it' });
    expect(sent[1].body).toEqual({ sessionId: 'dd1', questionId: 'q2', message: 'then checked' });
    await click(l, 'live-finish');
    expect(calls.at(-1).body).toEqual({ sessionId: 'dd1', questionId: 'q2' });
    expect(l.state.review.items.find((i) => i.questionId === 'q2').done).toBe(true);
    expect(reviewMarkup(l.state.review, progress, icon)).toContain('Skips the sign flip.');
  });

  it('the wrong-answer opener is different, and a failed send keeps the message for retry', async () => {
    const { l } = live({ 'GET /api/live/review-items': json({ items }), 'GET /api/live/progress': json(progress), 'POST /api/live/tutor/message': json({ error: { code: 'MODEL' } }, 500) });
    l.enter('live-review');
    await vi.waitFor(() => expect(l.state.review.status).toBe('ready'));
    await click(l, 'live-walk', 'q1'); // wrong
    expect(reviewMarkup(l.state.review, progress, icon)).toContain('What was the first thing you did?');
    l.state.review.chat.input = 'hello';
    await click(l, 'live-send');
    expect(l.state.review.chat.input).toBe('hello');
    expect(l.state.review.chat.messages).toEqual([]);
    expect(l.state.review.chat.error).toMatch(/unavailable/);
  });
});
