"use client";
import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { getReviewItemsAction, toggleFlagAction } from "@/app/actions";
import type { ReviewItem, SkillProgress } from "@/server/contracts";
import Chat from "./Chat";
import { friendly } from "./errors";
import Skeleton from "./Skeletons";

type Skill = Pick<SkillProgress, "skillId" | "name" | "topic">;

const pill = "px-2 py-0.5 rounded text-xs font-medium";

function Card({ item, onFlag, onDone }: { item: ReviewItem; onFlag: (flagged: boolean) => void; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function flag() {
    setError(null);
    start(async () => {
      const r = await toggleFlagAction({ questionId: item.questionId, flagged: !item.flagged });
      if (r.ok) onFlag(r.data.flagged);
      else setError(friendly(r.error));
    });
  }

  return (
    <li className="card bg-surface-100 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {!item.wasCorrect && <span className={`${pill} bg-error-200 text-error-900`}>Wrong</span>}
        {item.flagged && <span className={`${pill} bg-primary-200 text-primary-900`}>Saved</span>}
        {item.done && <span className={`${pill} bg-success-200 text-success-900`}>Reviewed</span>}
      </div>
      <p className="font-medium">{item.stem}</p>
      <ol className="space-y-1 text-sm">
        {item.choices.map((c, n) => (
          <li key={n} className={n === item.chosen ? "font-semibold" : ""}>
            {String.fromCharCode(65 + n)}. {c}
            {n === item.chosen && <span className="ml-2 text-xs">(your answer)</span>}
          </li>
        ))}
      </ol>
      {error && <p role="alert" className="p-3 rounded bg-error-100 text-error-900">{error}</p>}
      <div className="flex flex-wrap gap-2">
        <button className="btn preset-filled-primary-500" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Hide walkthrough" : "Walk through this"}
        </button>
        <button className="btn preset-tonal" aria-pressed={item.flagged} onClick={flag} disabled={pending}>
          {item.flagged ? "Unsave" : "Save for later"}
        </button>
      </div>
      {open && <Chat questionId={item.questionId} kind={item.wasCorrect ? "unsure" : "wrong"} onDone={onDone} />}
    </li>
  );
}

// Pick a skill, then walk through the questions you got wrong or saved in it. Replaces the old open-ended chat.
export default function ReviewTutor({ skills, openCounts }: { skills: Skill[]; openCounts: Record<string, number> }) {
  const [skillId, setSkillId] = useState("");
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, start] = useTransition();
  const latest = useRef(""); // ignore a slow response for a skill the student already moved off

  function pick(id: string) {
    latest.current = id;
    setSkillId(id);
    setItems(null);
    setError(null);
    if (!id) return;
    start(async () => {
      const r = await getReviewItemsAction(id);
      if (latest.current !== id) return;
      if (r.ok) setItems(r.data);
      else setError(friendly(r.error));
    });
  }

  const patch = (questionId: string, f: (i: ReviewItem) => ReviewItem | null) =>
    setItems((list) => list && list.flatMap((i) => (i.questionId === questionId ? (f(i) ?? []) : [i])));
  // Unsaving a question you got right drops it from the list; a wrong one stays (it is still a wrong answer).
  const onFlag = (i: ReviewItem) => (flagged: boolean) => patch(i.questionId, (x) => (!flagged && x.wasCorrect ? null : { ...x, flagged }));
  const onDone = (i: ReviewItem) => () => patch(i.questionId, (x) => ({ ...x, done: true }));

  const needs = skills.filter((s) => openCounts[s.skillId] > 0);
  const rest = skills.filter((s) => !openCounts[s.skillId]);
  const topics = [...new Set(rest.map((s) => s.topic))];
  const open = items?.filter((i) => !i.done) ?? [];
  const reviewed = items?.filter((i) => i.done) ?? [];

  return (
    <div className="space-y-4">
      <label className="label max-w-md">
        <span>Which skill do you want to review?</span>
        <select className="select" value={skillId} onChange={(e) => pick(e.target.value)}>
          <option value="">Choose a skill…</option>
          {needs.length > 0 && (
            <optgroup label="Needs review">
              {needs.map((s) => <option key={s.skillId} value={s.skillId}>{s.name} ({openCounts[s.skillId]})</option>)}
            </optgroup>
          )}
          {topics.map((t) => (
            <optgroup key={t} label={t}>
              {rest.filter((s) => s.topic === t).map((s) => <option key={s.skillId} value={s.skillId}>{s.name}</option>)}
            </optgroup>
          ))}
        </select>
      </label>

      {loading && <Skeleton rows={4} />}
      {error && <p role="alert" className="card bg-error-100 text-error-900 p-4">{error}</p>}

      {items && items.length === 0 && (
        <div className="card bg-surface-100 p-6 space-y-3 max-w-2xl">
          <p>Nothing to review in this skill yet. Questions you get wrong, and ones you save, show up here.</p>
          <Link href="/practice" className="btn preset-filled-primary-500">Go to practice</Link>
        </div>
      )}

      {open.length > 0 && (
        <ul className="space-y-4 max-w-2xl" aria-label="Questions to review">
          {open.map((i) => <Card key={i.questionId} item={i} onFlag={onFlag(i)} onDone={onDone(i)} />)}
        </ul>
      )}

      {reviewed.length > 0 && (
        <details className="max-w-2xl">
          <summary className="cursor-pointer font-medium py-2">Reviewed ({reviewed.length})</summary>
          <ul className="space-y-4 mt-2">
            {reviewed.map((i) => <Card key={i.questionId} item={i} onFlag={onFlag(i)} onDone={onDone(i)} />)}
          </ul>
        </details>
      )}
    </div>
  );
}
