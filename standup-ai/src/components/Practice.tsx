"use client";
import { useRef, useState, useTransition } from "react";
import { nextQuestionAction, reviewWorkAction, submitAnswerAction, toggleFlagAction } from "@/app/actions";
import type { AnswerResult, NextQuestionResult, QuizQuestion, ReviewResult } from "@/server/contracts";
import Chat from "./Chat";
import { friendly } from "./errors";

const dots = (b: number) => (b < -0.7 ? 1 : b < 0.7 ? 2 : 3); // difficultyB runs about -2..2

export default function Practice({ initial, initialError }: { initial: NextQuestionResult | null; initialError?: string }) {
  const [sessionId, setSessionId] = useState(initial?.sessionId);
  const [q, setQ] = useState<QuizQuestion | null>(initial?.question ?? null);
  const [picked, setPicked] = useState<number | null>(null);
  const [res, setRes] = useState<AnswerResult | null>(null);
  const [work, setWork] = useState("");
  const [review, setReview] = useState<ReviewResult | null>(null);
  const [saved, setSaved] = useState(false); // flagged for later tutoring
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [tutor, setTutor] = useState(false);
  const [answered, setAnswered] = useState(0);
  const [pending, start] = useTransition();
  // One id per question, so a retry after a lost response can't be counted twice.
  const attemptId = useRef<string | null>(null);

  function answer(n: number) {
    if (!q || !sessionId || pending || res) return;
    setPicked(n);
    setError(null);
    attemptId.current ??= crypto.randomUUID();
    start(async () => {
      const r = await submitAnswerAction({ sessionId, questionId: q.id, chosen: n, clientAttemptId: attemptId.current! });
      if (!r.ok) {
        setError(friendly(r.error));
        setPicked(null);
        return;
      }
      setRes(r.data);
      setAnswered((a) => a + 1);
    });
  }

  // Blank work = "show me the answer": the server skips the model and returns the stored explanation.
  function explain(skip: boolean) {
    if (!q || pending || review) return;
    setError(null);
    start(async () => {
      const r = await reviewWorkAction({ questionId: q.id, work: skip ? "" : work });
      if (!r.ok) {
        setError(friendly(r.error));
        return;
      }
      setReview(r.data);
    });
  }

  function toggleSaved() {
    if (!q || pending) return;
    setError(null);
    start(async () => {
      const r = await toggleFlagAction({ questionId: q.id, flagged: !saved });
      if (r.ok) setSaved(r.data.flagged);
      else setError(friendly(r.error));
    });
  }

  function next() {
    if (pending) return;
    start(async () => {
      const r = await nextQuestionAction(sessionId);
      if (!r.ok) {
        setError(friendly(r.error));
        return;
      }
      attemptId.current = null;
      setSessionId(r.data.sessionId);
      setQ(r.data.question);
      setPicked(null);
      setRes(null);
      setWork("");
      setReview(null);
      setSaved(false);
      setTutor(false);
      setError(null);
    });
  }

  const alert = error && <p role="alert" className="p-3 rounded bg-error-100 text-error-900">{error}</p>;

  if (!q) {
    return (
      <div className="card bg-surface-100 p-6 space-y-3 max-w-2xl">
        {alert}
        <p>
          {answered > 0
            ? "You've worked through every available question. Nice work!"
            : <>No questions yet. Run <code>npm run db:seed-demo</code> (or <code>npm run gen:questions</code>), then try again.</>}
        </p>
        <button className="btn preset-tonal" onClick={next} disabled={pending}>Try again</button>
      </div>
    );
  }

  // The right answer is only highlighted once the student has explained their work (or asked to see it).
  const tint = (n: number) => {
    if (!res) return pending && n === picked ? "bg-surface-200" : "";
    if (res.correct) return n === picked ? "bg-success-200" : "";
    if (review && n === review.correctIndex) return "bg-success-200";
    return n === picked ? "bg-error-200" : "";
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="card bg-surface-100 p-6 space-y-4" aria-busy={pending}>
        <div className="flex items-center justify-between text-sm">
          <span>{q.skillName} · {q.topic}</span>
          <span aria-label={`Difficulty ${dots(q.difficultyB)} of 3`}>
            Difficulty {"●".repeat(dots(q.difficultyB))}{"○".repeat(3 - dots(q.difficultyB))}
          </span>
        </div>
        <h2 className="text-xl font-semibold">{q.stem}</h2>
        <div role="group" aria-label="Answer choices" className="grid gap-2">
          {q.choices.map((c, n) => (
            <button key={n} disabled={pending || !!res} onClick={() => answer(n)}
              className={`text-left p-3 rounded border border-surface-300 hover:bg-surface-200 focus-visible:outline-2 ${tint(n)}`}>
              {String.fromCharCode(65 + n)}. {c}
            </button>
          ))}
        </div>
        {alert}

        {res?.correct && (
          <div role="status" className="p-3 rounded bg-surface-200 space-y-1">
            <p><strong>Correct!</strong></p>
            {res.mastered && <p className="font-semibold">Skill mastered: {q.skillName}!</p>}
          </div>
        )}

        {res && !res.correct && (
          <div role="status" className="p-3 rounded bg-surface-200 space-y-3">
            <p><strong>Not quite.</strong></p>
            {!review ? (
              <>
                <label className="label">
                  <span className="font-medium">Explain your work</span>
                  <textarea className="textarea" rows={3} maxLength={1000} value={work} disabled={pending}
                    onChange={(e) => setWork(e.target.value)}
                    placeholder="Walk through what you did, step by step. What did you try first?" />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className="btn preset-filled-primary-500" onClick={() => explain(false)} disabled={pending || !work.trim()}>
                    {pending ? "Reviewing your work…" : "Submit explanation"}
                  </button>
                  <button className="btn preset-tonal" onClick={() => explain(true)} disabled={pending}>Show me the answer</button>
                </div>
              </>
            ) : (
              <p>{review.feedback}</p>
            )}
            {res.mastered && <p className="font-semibold">Skill mastered: {q.skillName}!</p>}
          </div>
        )}

        {res && (
          <div className="flex flex-wrap gap-2">
            <button className="btn preset-filled-primary-500" onClick={next} disabled={pending}>Next question</button>
            {!res.correct && review && !tutor && (
              <button className="btn preset-tonal" onClick={() => setTutor(true)}>Talk it through with the tutor</button>
            )}
            <button className="btn preset-tonal" aria-pressed={saved} onClick={toggleSaved} disabled={pending}>
              {saved ? "Saved for review" : "Save for tutor review"}
            </button>
          </div>
        )}
        {res && <p className="text-sm">Right but not fully confident? Save it to walk through with the tutor later.</p>}
      </div>
      {tutor && <Chat key={q.id} questionId={q.id} kind="wrong" />}
    </div>
  );
}
