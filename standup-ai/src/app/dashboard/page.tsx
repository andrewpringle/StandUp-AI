import { skills, leaderboard } from "@/mock/data";
import MasteryBadge from "@/components/MasteryBadge";
import { AbilityChart, ScoreChart } from "@/components/Charts";

export default function Dashboard() {
  const topics = [...new Set(skills.map((s) => s.topic))];
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Your progress</h1>
      <div className="grid md:grid-cols-3 gap-4">
        <section className="card bg-surface-100 p-4 md:col-span-2 space-y-4" aria-labelledby="mastery">
          <h2 id="mastery" className="text-xl font-semibold">Skill mastery</h2>
          {topics.map((t) => (
            <div key={t}>
              <h3 className="font-medium mb-2">{t}</h3>
              <ul className="space-y-2">
                {skills.filter((s) => s.topic === t).map((s) => (
                  <li key={s.name} className="flex items-center gap-3">
                    <span className="w-48 text-sm">{s.name}</span>
                    <progress className="flex-1 h-2" value={s.pct} max={100} aria-label={`${s.name} progress`} />
                    <MasteryBadge state={s.state} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
        <section className="card bg-surface-100 p-4 space-y-2" aria-labelledby="lb">
          <h2 id="lb" className="text-xl font-semibold">School leaderboard</h2>
          <p className="text-xs">Ranked by improvement and mastery.</p>
          <ol className="space-y-1">
            {leaderboard.map((r, n) => (
              <li key={r.name} className={`flex justify-between p-2 rounded ${r.name === "You" ? "bg-primary-200 font-semibold" : ""}`}>
                <span>{n + 1}. {r.name}</span>
                <span>{r.points} pts · {r.improvement}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <section className="card bg-surface-100 p-4" aria-labelledby="ab">
          <h2 id="ab" className="text-xl font-semibold mb-2">Ability over time</h2>
          <AbilityChart />
        </section>
        <section className="card bg-surface-100 p-4" aria-labelledby="sc">
          <h2 id="sc" className="text-xl font-semibold mb-2">Test scores (incl. retake)</h2>
          <ScoreChart />
        </section>
      </div>
    </div>
  );
}
