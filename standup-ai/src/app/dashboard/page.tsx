import { Suspense } from "react";
import { connection } from "next/server";
import { getProgress } from "@/server";
import type { Progress } from "@/server/contracts";
import { leaderboard } from "@/mock/data";
import MasteryBadge from "@/components/MasteryBadge";
import Skeleton from "@/components/Skeletons";
import { errorText } from "@/components/errors";
import { AbilityChart, ScoreChart } from "@/components/Charts";

// Reads the DB per request: connection() keeps it out of the static shell.
async function Live() {
  await connection();
  let p: Progress | undefined;
  let err = "";
  try { p = await getProgress(); } catch (e) { err = errorText(e); }
  if (!p) return <p role="alert" className="card bg-error-100 text-error-900 p-4">{err}</p>;

  const topics = [...new Set(p.skills.map((s) => s.topic))];
  const mastered = p.skills.filter((s) => s.state === "mastered").length;
  const stats = [
    { label: "Questions answered", value: p.attempts },
    { label: "Accuracy", value: p.attempts ? `${Math.round((100 * p.correct) / p.attempts)}%` : "–" },
    { label: "Skills mastered", value: `${mastered} / ${p.skills.length}` },
  ];

  return (
    <>
      <ul className="grid grid-cols-3 gap-4">
        {stats.map((s) => (
          <li key={s.label} className="card bg-surface-100 p-4">
            <p className="text-sm">{s.label}</p>
            <p className="text-2xl font-bold">{s.value}</p>
          </li>
        ))}
      </ul>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="card bg-surface-100 p-4 space-y-4" aria-labelledby="mastery">
          <h2 id="mastery" className="text-xl font-semibold">Skill mastery</h2>
          {topics.map((t) => (
            <div key={t}>
              <h3 className="font-medium mb-2">{t}</h3>
              <ul className="space-y-2">
                {p.skills.filter((s) => s.topic === t).map((s) => (
                  <li key={s.skillId} className="flex items-center gap-3">
                    <span className="w-48 text-sm">{s.name}</span>
                    <progress className="flex-1 h-2" value={s.pct} max={100} aria-label={`${s.name} progress`} />
                    <MasteryBadge state={s.state} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section className="card bg-surface-100 p-4" aria-labelledby="ab">
          <h2 id="ab" className="text-xl font-semibold mb-2">Ability over time</h2>
          <AbilityChart history={p.history} skills={p.skills} />
        </section>
      </div>
    </>
  );
}

export default function Dashboard() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Your progress</h1>
      <Suspense fallback={<Skeleton rows={5} />}>
        <Live />
      </Suspense>
      <section aria-labelledby="sample" className="space-y-4">
        <div className="flex items-center gap-2">
          <h2 id="sample" className="text-xl font-semibold">Coming soon</h2>
          <span className="px-2 py-0.5 rounded text-xs font-medium bg-warning-200 text-warning-900">Sample data</span>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="card bg-surface-100 p-4 space-y-2">
            <h3 className="text-lg font-semibold">School leaderboard</h3>
            <p className="text-xs">Ranked by improvement and mastery.</p>
            <ol className="space-y-1">
              {leaderboard.map((r, n) => (
                <li key={r.name} className={`flex justify-between p-2 rounded ${r.name === "You" ? "bg-primary-200 font-semibold" : ""}`}>
                  <span>{n + 1}. {r.name}</span>
                  <span>{r.points} pts · {r.improvement}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="card bg-surface-100 p-4">
            <h3 className="text-lg font-semibold mb-2">Test scores (incl. retake)</h3>
            <ScoreChart />
          </div>
        </div>
      </section>
    </div>
  );
}
