// Live mode for the student demo. Opt-in with ?live=1; the default simulated demo never loads or calls any of this.
// Talks to the real backend at /api/live/*. Rendering functions are pure (state -> HTML string) so they can be tested without a browser.

export const isLive = (search = '') => new URLSearchParams(search).get('live') === '1';
// Same one-liner as app.js (kept separate so the simulated path stays untouched). Every server string goes through this.
export const escapeHTML = str => String(str).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export class LiveError extends Error {
  constructor(status, code, message) { super(message || code || 'error'); this.status = status; this.code = code; this.off = status === 503; }
}
const MESSAGES = {
  SPEND_CAP: 'The demo’s AI budget has been used up. Ask the host to raise the limit.',
  NO_KEY: 'The AI tutor isn’t set up yet (no API key configured).',
  MODEL: 'The tutor is unavailable right now. Please try again.',
  NETWORK: 'Couldn’t reach the live backend. Check your connection and try again.',
};
export const friendly = e => e.off ? 'The live backend is off.'
  : (e.code === 'BAD_INPUT' || e.code === 'NOT_FOUND') && e.message !== e.code ? e.message
  : MESSAGES[e.code] || 'Something went wrong. Please try again.';

export function createApi(fetchImpl) {
  async function call(method, path, body) {
    let res;
    try {
      res = await (fetchImpl || fetch)(path, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(45000) });
    } catch { throw new LiveError(0, 'NETWORK'); }
    let data = null;
    try { data = await res.json(); } catch { /* handled below */ }
    if (!res.ok) throw new LiveError(res.status, data?.error?.code, data?.error?.message);
    if (data == null) throw new LiveError(res.status, 'MODEL');
    return data;
  }
  const post = (path, body) => call('POST', `/api/live/${path}`, body);
  return {
    progress: () => call('GET', '/api/live/progress'),
    reviewItems: skillId => call('GET', `/api/live/review-items${skillId ? `?skillId=${encodeURIComponent(skillId)}` : ''}`),
    next: sessionId => post('quiz/next', sessionId ? { sessionId } : {}),
    answer: body => post('quiz/answer', body),
    review: body => post('quiz/review', body),
    flag: body => post('quiz/flag', body),
    tutorMessage: body => post('tutor/message', body),
    tutorFinish: body => post('tutor/finish', body),
  };
}

const esc = escapeHTML;
const pct = n => Math.min(100, Math.max(0, Math.round(Number(n)) || 0));
const intro = (label, title, text) => `<div class="page-intro"><div><div class="intro-label">${label}</div><h1>${title}</h1><p>${text}</p></div></div>`;
const OPENERS = {
  wrong: 'Let’s walk through this one. What was the first thing you did?',
  unsure: 'You got this one right but wanted to review it. Walk me through how you got it.',
};
const offMarkup = () => `<section class="panel empty-state" role="status"><h2>Live backend is off.</h2><p>This server isn’t running the live backend. Start the app with the database up and an API key set, then reload with <code>?live=1</code>. The simulated demo works without it.</p><a class="button secondary" href="/student-demo/index.html#overview">Back to the simulated demo</a></section>`;
const errorMarkup = (msg, action) => `<section class="panel empty-state"><p role="alert">${esc(msg)}</p><button class="button secondary" data-action="${action}">Try again</button></section>`;
const stateLabel = { unseen: 'Not started', learning: 'Learning', mastered: 'Mastered', needs_review: 'Needs review' };

export function skillsMarkup(s, icon) {
  const head = body => `<section class="panel section-gap" aria-labelledby="live-skills-title"><div class="panel-head"><h2 id="live-skills-title">Live skills</h2><span class="tag neutral">${icon('chart')}Real data</span></div>${body}</section>`;
  if (s.status === 'off') return head('<p class="small muted">The live backend is off, so these are not available.</p>');
  if (s.status === 'error') return head(`<p class="small muted" role="alert">${esc(s.error)}</p>`);
  if (s.status !== 'ready') return head('<p class="small muted" role="status">Loading your live skills…</p>');
  const rows = s.data.skills.map(k => `<div class="skill-row"><div class="skill-label"><span>${esc(k.name)}</span><span>${esc(stateLabel[k.state] || k.state)} <small>${pct(k.pct)}%</small></span></div><div class="meter" role="meter" aria-label="${esc(k.name)} mastery" aria-valuenow="${pct(k.pct)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct(k.pct)}%"></span></div></div>`).join('');
  return head(`<p class="muted small">${Number(s.data.attempts) || 0} answered · ${Number(s.data.correct) || 0} correct</p>${rows}`);
}

export function practiceMarkup(p, icon) {
  const head = intro('Live practice', 'Questions that adapt to you.', 'Each question is chosen from your results so far.');
  if (p.status === 'off') return head + offMarkup();
  if (p.status === 'idle' || p.status === 'loading') return `${head}<section class="panel" aria-busy="true"><p role="status">Loading your next question…</p></section>`;
  if (p.status === 'empty') return `${head}<section class="panel empty-state"><h2>${p.answered ? 'You’ve worked through every available question.' : 'No questions yet.'}</h2><p>${p.answered ? 'Nice work. Check back after more questions are added.' : 'Add the demo questions with <code>npm run db:seed-demo</code>, then try again.'}</p><button class="button secondary" data-action="live-retry">Try again</button></section>`;
  if (p.status === 'error') return head + errorMarkup(p.error, 'live-retry');

  const q = p.q, a = p.answer, r = p.review, busy = p.pending;
  const cls = i => !a ? (p.picked === i ? 'selected' : '') : a.correct ? (i === p.picked ? 'correct' : '') : r && i === r.correctIndex ? 'correct' : i === p.picked ? 'incorrect' : '';
  const choices = q.choices.map((c, i) => `<button class="choice live-choice ${cls(i)}" role="radio" aria-checked="${p.picked === i}" data-action="live-pick" data-value="${i}" ${a || busy ? 'disabled' : ''}><span class="choice-letter">${String.fromCharCode(65 + i)}</span><span>${esc(c)}</span>${a && cls(i) === 'correct' ? `<span style="margin-left:auto">${icon('check')}</span>` : ''}</button>`).join('');
  const mastered = a?.mastered ? `<p class="small" style="margin-top:10px"><strong>Skill mastered: ${esc(q.skillName)}!</strong></p>` : '';
  const explain = `<label class="field-label" for="live-work">Explain your work</label><textarea id="live-work" maxlength="1000" placeholder="Walk through what you did, step by step. What did you try first?" ${busy ? 'disabled' : ''}>${esc(p.work)}</textarea><p class="form-hint">The tutor will say where it went wrong. The right answer appears after.</p><div class="question-actions"><button class="button primary" data-action="live-explain" ${busy || !p.work.trim() ? 'disabled' : ''}>${busy ? 'Reviewing your work…' : 'Submit explanation'}</button><button class="button secondary" data-action="live-reveal" ${busy ? 'disabled' : ''}>Show me the answer</button></div>`;
  const result = !a ? '' : a.correct
    ? `<div class="answer-feedback"><h3>Correct!</h3>${mastered}</div>`
    : `<div class="answer-feedback review"><h3>Not quite.</h3>${r ? `<p>${esc(r.feedback)}</p>` : explain}${mastered}</div>`;
  const flag = !a ? '' : `<div class="live-flag"><button class="button secondary" data-action="live-flag" aria-pressed="${p.flagged}" ${busy ? 'disabled' : ''}>${icon('check')}${p.flagged ? 'Saved for tutor review' : 'Save for tutor review'}</button><p class="form-hint">Right but not fully confident? Save it to walk through with the tutor later.</p></div>`;
  const actions = a
    ? `<button class="button primary" data-action="live-next" ${busy ? 'disabled' : ''}>Next question ${icon('arrow')}</button>`
    : `<button class="button primary" id="live-check" data-action="live-check" ${p.picked == null || busy ? 'disabled' : ''}>Check answer ${icon('arrow')}</button>`;
  return `${head}<section class="panel"><div class="question-step">${esc(q.skillName)} · ${esc(q.topic)}</div><h2 class="question-prompt">${esc(q.stem)}</h2><div class="choices" role="radiogroup" aria-label="Answer choices">${choices}</div>${p.error ? `<div class="hint" role="alert">${esc(p.error)}</div>` : ''}<div id="live-result" tabindex="-1" role="status" aria-live="polite">${result}</div>${flag}<div class="question-actions"><span></span>${actions}</div></section>`;
}

// Skills shown in the picker: everything with review items, plus every known skill, open items first.
export function skillList(items, progress) {
  const names = new Map(), open = new Map();
  for (const it of items) { names.set(it.skillId, it.skillName); if (!it.done) open.set(it.skillId, (open.get(it.skillId) || 0) + 1); }
  for (const s of progress?.skills || []) if (!names.has(s.skillId)) names.set(s.skillId, s.name);
  return [...names].map(([id, name]) => ({ id, name, open: open.get(id) || 0 })).sort((x, y) => y.open - x.open || x.name.localeCompare(y.name));
}

export function reviewMarkup(r, progress, icon) {
  const head = intro('Review with tutor', 'Walk back through the tricky ones.', 'Questions you got wrong, or saved because you weren’t fully sure.');
  if (r.status === 'off') return head + offMarkup();
  if (r.status === 'idle' || r.status === 'loading') return `${head}<section class="panel" aria-busy="true"><p role="status">Loading your questions…</p></section>`;
  if (r.status === 'error') return head + errorMarkup(r.error, 'live-retry');

  const skills = skillList(r.items, progress);
  const picker = `<div class="live-skills" role="group" aria-label="Choose a skill">${skills.map(s => `<button class="live-skill" data-action="live-skill" data-value="${esc(s.id)}" aria-pressed="${s.id === r.skillId}">${esc(s.name)} <strong>${s.open}</strong><span class="sr-only"> to review</span></button>`).join('')}</div>`;
  const mine = r.items.filter(i => i.skillId === r.skillId);
  const card = it => `<article class="panel live-item"><div class="live-badges">${it.wasCorrect ? '' : '<span class="tag">Wrong</span>'}${it.flagged ? '<span class="tag neutral">Saved</span>' : ''}${it.done ? '<span class="tag neutral">Reviewed</span>' : ''}</div><h3 class="question-prompt">${esc(it.stem)}</h3><ol class="live-choices" type="A">${it.choices.map((c, i) => `<li>${esc(c)}${i === it.chosen ? ' <span class="tag neutral">Your answer</span>' : ''}</li>`).join('')}</ol><div class="question-actions"><button class="button primary" data-action="live-walk" data-value="${esc(it.questionId)}">Walk through this</button>${it.flagged ? `<button class="button secondary" data-action="live-unsave" data-value="${esc(it.questionId)}">Unsave</button>` : ''}</div></article>`;
  const openItems = mine.filter(i => !i.done), doneItems = mine.filter(i => i.done);
  const list = !r.skillId ? '<p class="muted small">Pick a skill to see its questions.</p>'
    : !mine.length ? `<section class="panel empty-state"><h2>Nothing to review in this skill yet.</h2><p>Questions you get wrong, or save while practicing, show up here.</p><a class="button secondary" href="#live-practice">Go to live practice</a></section>`
    : `${openItems.map(card).join('') || '<p class="muted small">Nothing left to review here. Nice work.</p>'}${doneItems.length ? `<details class="live-reviewed"><summary>Reviewed (${doneItems.length})</summary>${doneItems.map(card).join('')}</details>` : ''}`;

  const it = r.open && r.items.find(i => i.questionId === r.open), c = r.chat;
  const messages = it && c ? [{ role: 'assistant', text: OPENERS[it.wasCorrect ? 'unsure' : 'wrong'] }, ...c.messages] : [];
  const chat = !it || !c ? '' : `<section class="panel live-chat" aria-labelledby="live-chat-title"><div class="tutor-header"><span class="tutor-avatar">${icon('chat')}</span><div><h3 id="live-chat-title">Walk through this question</h3><p>${esc(it.stem)}</p></div><button class="close-button" data-action="live-close" aria-label="Close walkthrough">${icon('close')}</button></div><div class="chat-transcript" id="live-transcript" role="log" aria-label="Conversation with the tutor" aria-live="polite">${messages.map(m => `<div class="message ${m.role === 'user' ? 'user' : ''}">${m.role === 'user' ? '<span class="avatar">You</span>' : `<span class="tutor-avatar">${icon('chat')}</span>`}<div><span class="message-label">${m.role === 'user' ? 'You' : 'StandUp'}</span><div class="message-content">${esc(m.text)}</div></div></div>`).join('')}</div>${c.error ? `<div class="hint" role="alert">${esc(c.error)}</div>` : ''}${c.note ? `<div class="answer-feedback" role="status"><h3>Note saved</h3><p>${esc(c.note.summary)}</p></div>` : `<label class="field-label" for="live-chat-input">Your reply</label><textarea id="live-chat-input" maxlength="1000" rows="3" placeholder="Explain your thinking. Enter to send, Shift + Enter for a new line." ${c.pending ? 'disabled' : ''}>${esc(c.input)}</textarea><div class="question-actions"><button class="button secondary" data-action="live-finish" ${c.pending || !c.sessionId ? 'disabled' : ''}>Finish and save note</button><button class="button primary" data-action="live-send" ${c.pending ? 'disabled' : ''}>${c.pending ? 'Thinking…' : 'Send'}</button></div>`}</section>`;
  return `${head}${picker}${r.error ? `<div class="hint" role="alert">${esc(r.error)}</div>` : ''}<div class="live-list">${list}</div>${chat}`;
}

export function createLive({ icon, rerender, fetchImpl }) {
  const api = createApi(fetchImpl);
  const state = {
    progress: { status: 'idle', data: null, error: '' },
    practice: { status: 'idle', sessionId: undefined, q: null, picked: null, attemptId: null, shownAt: 0, answer: null, review: null, work: '', flagged: false, pending: false, error: '', answered: 0 },
    review: { status: 'idle', items: [], skillId: null, error: '', open: null, chat: null },
  };
  const p = state.practice, r = state.review;
  const focus = sel => { if (typeof document !== 'undefined') queueMicrotask(() => document.querySelector(sel)?.focus()); };

  async function loadProgress() {
    const s = state.progress;
    if (s.status === 'loading') return;
    s.status = 'loading'; rerender();
    try { s.data = await api.progress(); s.status = 'ready'; } catch (e) { s.status = e.off ? 'off' : 'error'; s.error = friendly(e); }
    rerender();
  }

  async function loadNext() {
    if (p.pending) return;
    p.status = p.q ? p.status : 'loading'; p.pending = true; p.error = ''; rerender();
    try {
      const res = await api.next(p.sessionId);
      p.sessionId = res.sessionId;
      if (!res.question) { p.q = null; p.status = 'empty'; }
      else Object.assign(p, { q: res.question, status: 'ready', picked: null, answer: null, review: null, work: '', flagged: false, attemptId: crypto.randomUUID(), shownAt: Date.now() });
    } catch (e) { p.status = e.off ? 'off' : (p.q ? 'ready' : 'error'); p.error = friendly(e); }
    p.pending = false; rerender(); focus('.live-choice');
  }

  async function check() {
    if (!p.q || p.picked == null || p.pending || p.answer) return;
    p.pending = true; p.error = ''; rerender();
    try {
      // attemptId was made when the question was shown, so a retry of the same question can't be counted twice.
      p.answer = await api.answer({ sessionId: p.sessionId, questionId: p.q.id, chosen: p.picked, clientAttemptId: p.attemptId, timeMs: Math.max(0, Math.round(Date.now() - p.shownAt)) });
      p.answered++;
    } catch (e) { p.error = friendly(e); if (e.off) p.status = 'off'; }
    p.pending = false; rerender(); focus('#live-result');
  }

  async function review(work) { // blank work = "show me the answer": the server skips the model
    if (!p.answer || p.answer.correct || p.review || p.pending) return;
    p.pending = true; p.error = ''; rerender();
    try { p.review = await api.review({ questionId: p.q.id, work: work.trim() }); } catch (e) { p.error = friendly(e); }
    p.pending = false; rerender(); focus('#live-result');
  }

  async function flag(questionId, flagged, apply) {
    if (p.pending) return;
    p.pending = true; p.error = ''; r.error = ''; rerender();
    try { apply((await api.flag({ questionId, flagged })).flagged); } catch (e) { p.error = friendly(e); r.error = friendly(e); }
    p.pending = false; rerender();
  }

  async function loadReview() {
    r.status = 'loading'; rerender();
    try {
      const [items] = await Promise.all([api.reviewItems(), state.progress.data ? null : loadProgress()]);
      r.items = items.items; r.status = 'ready';
      const skills = skillList(r.items, state.progress.data);
      if (!skills.some(s => s.id === r.skillId)) r.skillId = skills[0]?.id ?? null;
    } catch (e) { r.status = e.off ? 'off' : 'error'; r.error = friendly(e); }
    rerender();
  }

  async function send() {
    const c = r.chat, it = r.items.find(i => i.questionId === r.open);
    const text = c?.input.trim();
    if (!c || !it || c.pending || !text) return;
    c.pending = true; c.error = ''; c.messages.push({ role: 'user', text }); c.input = ''; rerender();
    try {
      const res = await api.tutorMessage({ sessionId: c.sessionId, questionId: it.questionId, message: text });
      c.sessionId = res.sessionId; c.messages.push({ role: 'assistant', text: res.reply });
    } catch (e) { c.error = friendly(e); c.messages.pop(); c.input = text; } // put the message back so it can be resent
    c.pending = false; rerender(); focus('#live-chat-input');
  }

  async function finish() {
    const c = r.chat, it = r.items.find(i => i.questionId === r.open);
    if (!c || !it || c.pending || !c.sessionId) return;
    c.pending = true; c.error = ''; rerender();
    try { c.note = await api.tutorFinish({ sessionId: c.sessionId, questionId: it.questionId }); it.done = true; } catch (e) { c.error = friendly(e); }
    c.pending = false; rerender();
  }

  async function action(el) {
    const v = el.dataset.value;
    switch (el.dataset.action) {
      case 'live-pick': if (!p.answer && !p.pending) { p.picked = Number(v); rerender(); focus(`[data-action="live-pick"][data-value="${v}"]`); } break;
      case 'live-check': await check(); break;
      case 'live-explain': await review(p.work); break;
      case 'live-reveal': await review(''); break;
      case 'live-flag': if (p.answer) await flag(p.q.id, !p.flagged, f => { p.flagged = f; }); break;
      case 'live-next': if (p.answer) await loadNext(); break;
      case 'live-retry': await (page === 'live-review' ? loadReview() : loadNext()); break;
      case 'live-skill': r.skillId = v; r.open = null; r.chat = null; rerender(); break;
      case 'live-unsave': await flag(v, false, f => { const it = r.items.find(i => i.questionId === v); if (it) it.flagged = f; }); break;
      case 'live-walk': r.open = v; r.chat = { sessionId: undefined, messages: [], input: '', pending: false, error: '', note: null }; rerender(); focus('#live-chat-input'); break;
      case 'live-close': r.open = null; r.chat = null; rerender(); break;
      case 'live-send': await send(); break;
      case 'live-finish': await finish(); break;
    }
  }
  let page = '';

  if (typeof document !== 'undefined') {
    document.addEventListener('input', e => {
      if (e.target.id === 'live-work') { p.work = e.target.value; document.querySelector('[data-action="live-explain"]')?.toggleAttribute('disabled', !p.work.trim()); }
      if (e.target.id === 'live-chat-input' && r.chat) r.chat.input = e.target.value;
    });
    // Capture phase: runs before app.js's own arrow-key handler, which assumes a lesson session and would throw here.
    document.addEventListener('keydown', e => {
      if (e.target.matches?.('.live-choice') && ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight'].includes(e.key)) {
        e.preventDefault(); e.stopPropagation();
        if (p.answer || p.pending || !p.q) return;
        p.picked = ((p.picked ?? 0) + (['ArrowDown', 'ArrowRight'].includes(e.key) ? 1 : -1) + p.q.choices.length) % p.q.choices.length;
        rerender(); focus(`[data-action="live-pick"][data-value="${p.picked}"]`);
      } else if (e.target.id === 'live-chat-input' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault(); send();
      }
    }, true);
  }

  return {
    state,
    nav: (link, current) => link('Live practice', 'live-practice', 'pen', current === 'live-practice') + link('Review with tutor', 'live-review', 'chat', current === 'live-review'),
    names: { 'live-practice': 'Live practice', 'live-review': 'Review with tutor' },
    pages: shell => ({
      'live-practice': () => shell(practiceMarkup(p, icon)),
      'live-review': () => shell(reviewMarkup(r, state.progress.data, icon)),
    }),
    skillsPanel: () => skillsMarkup(state.progress, icon),
    enter(next) {
      page = next;
      if (next === 'overview' && state.progress.status === 'idle') loadProgress();
      if (next === 'live-practice' && (p.status === 'idle' || p.status === 'off' || p.status === 'error')) loadNext();
      if (next === 'live-review') loadReview();
    },
    action,
  };
}
