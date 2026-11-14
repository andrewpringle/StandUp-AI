import { expect, it } from "vitest";
import { abilitySeries } from "./series";

const skills = [
  { skillId: "a", topic: "Algebra" },
  { skillId: "b", topic: "Algebra" },
  { skillId: "c", topic: "Grammar" },
];
const pt = (skillId: string, theta: number, recordedAt: string) => ({ skillId, skillName: skillId, theta, recordedAt });

it("averages a topic per day, sorts by time, and drops topics with no data", () => {
  const { rows, topics } = abilitySeries(
    [pt("b", 1, "2026-11-02T10:00:00Z"), pt("a", 0, "2026-11-01T09:00:00Z"), pt("b", 1, "2026-11-01T11:00:00Z"), pt("zzz", 9, "2026-11-01T12:00:00Z")],
    skills,
  );
  expect(rows).toEqual([{ day: "2026-11-01", Algebra: 0.5 }, { day: "2026-11-02", Algebra: 1 }]);
  expect(topics).toEqual(["Algebra"]); // Grammar has no points; unknown skill ignored
});

it("returns nothing for empty history", () => {
  expect(abilitySeries([], skills)).toEqual({ rows: [], topics: [] });
});
