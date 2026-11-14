"use client";
import { useState, useTransition } from "react";
import { finishTutorAction, tutorMessageAction } from "@/app/actions";
import type { TutorNote } from "@/server/contracts";
import { friendly } from "./errors";

type Msg = { from: "student" | "tutor"; text: string };

// Canned client-side openers: showing them costs no model call.
const OPENING = {
  wrong: "Let's walk through this one. What was the first thing you did?",
  unsure: "You got this one right but wanted to review it. Walk me through how you got it.",
};

// Tutor walkthrough of one question the student got wrong ('wrong') or saved ('unsure').
// The server builds the question context itself from questionId, so the UI never sends (or knows) the key.
export default function Chat({ questionId, kind, onDone }: { questionId: string; kind: keyof typeof OPENING; onDone?: () => void }) {
  const [sessionId, setSessionId] = useState<string>();
  const [msgs, setMsgs] = useState<Msg[]>([{ from: "tutor", text: OPENING[kind] }]);
  const [text, setText] = useState("");
  const [note, setNote] = useState<TutorNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send(e: React.FormEvent) {
    e.preventDefault();
    const message = text.trim();
    if (!message || pending || note) return;
    setMsgs((m) => [...m, { from: "student", text: message }]);
    setText("");
    setError(null);
    start(async () => {
      const r = await tutorMessageAction({ sessionId, questionId, message });
      if (!r.ok) {
        setError(friendly(r.error));
        setMsgs((m) => m.slice(0, -1)); // nothing was saved: take the message back so it can be resent
        setText(message);
        return;
      }
      setSessionId(r.data.sessionId);
      setMsgs((m) => [...m, { from: "tutor", text: r.data.reply }]);
    });
  }

  function finish() {
    if (!sessionId || pending) return;
    start(async () => {
      const r = await finishTutorAction({ sessionId, questionId });
      if (r.ok) {
        setNote(r.data);
        onDone?.();
      } else setError(friendly(r.error));
    });
  }

  return (
    <div className="card bg-surface-100 p-4 space-y-4 max-w-2xl">
      <ul className="space-y-2" aria-live="polite">
        {msgs.map((m, n) => (
          <li key={n} className={`p-3 rounded max-w-[85%] ${m.from === "student" ? "ml-auto bg-primary-200" : "bg-surface-200"}`}>
            {m.text}
          </li>
        ))}
        {pending && <li className="p-3 rounded max-w-[85%] bg-surface-200 animate-pulse">Tutor is thinking…</li>}
      </ul>
      {error && <p role="alert" className="p-3 rounded bg-error-100 text-error-900">{error}</p>}
      {note && (
        <div role="status" className="p-3 rounded border border-success-500/40 bg-success-50 space-y-1">
          <strong>Learner note saved</strong>
          <p className="text-sm">{note.summary}</p>
          {note.strengths && <p className="text-sm">Strengths: {note.strengths}</p>}
        </div>
      )}
      <form onSubmit={send} className="flex gap-2">
        <label htmlFor={`tutor-msg-${questionId}`} className="sr-only">Message to the tutor</label>
        <input id={`tutor-msg-${questionId}`} className="input flex-1" value={text} maxLength={1000} disabled={!!note}
          onChange={(e) => setText(e.target.value)} placeholder="Type your reasoning…" />
        <button className="btn preset-filled-primary-500" disabled={pending || !!note || !text.trim()}>Send</button>
      </form>
      {!note && (
        <button type="button" className="btn preset-tonal" onClick={finish} disabled={pending || !sessionId}>
          Finish and save note
        </button>
      )}
    </div>
  );
}
