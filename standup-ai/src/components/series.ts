import type { AbilityPoint, SkillProgress } from "@/server/contracts";

// One row per calendar day (UTC), one column per topic = mean ability of that topic's snapshots that day.
export function abilitySeries(history: AbilityPoint[], skills: Pick<SkillProgress, "skillId" | "topic">[]) {
  const topicOf = new Map(skills.map((s) => [s.skillId, s.topic]));
  const days = new Map<string, Map<string, number[]>>();
  for (const p of [...history].sort((a, b) => a.recordedAt.localeCompare(b.recordedAt))) {
    const topic = topicOf.get(p.skillId);
    if (!topic) continue;
    const day = p.recordedAt.slice(0, 10);
    if (!days.has(day)) days.set(day, new Map());
    const byTopic = days.get(day)!;
    byTopic.set(topic, [...(byTopic.get(topic) ?? []), p.theta]);
  }
  const mean = (v: number[]) => +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2);
  const rows = [...days].map(([day, byTopic]) => ({
    day,
    ...Object.fromEntries([...byTopic].map(([t, v]) => [t, mean(v)])),
  })) as ({ day: string } & Record<string, number | string>)[];
  const topics = [...new Set(skills.map((s) => s.topic))].filter((t) => rows.some((r) => t in r));
  return { rows, topics };
}
