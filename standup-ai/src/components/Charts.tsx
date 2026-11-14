"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from "recharts";
import type { AbilityPoint, SkillProgress } from "@/server/contracts";
import { testScores } from "@/mock/data";
import { abilitySeries } from "./series";

const COLORS = ["#4f46e5", "#059669", "#d97706", "#db2777", "#0891b2"];

export function AbilityChart({ history, skills }: { history: AbilityPoint[]; skills: SkillProgress[] }) {
  const { rows, topics } = abilitySeries(history, skills);
  if (!rows.length) return <p className="text-sm">Answer a few practice questions and your ability trend will show up here.</p>;
  return (
    <div role="img" aria-label={`Line chart of ability over time for ${topics.join(" and ")}`} className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={rows}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="day" />
          <YAxis />
          <Tooltip />
          <Legend />
          {topics.map((t, i) => (
            <Line key={t} type="monotone" dataKey={t} stroke={COLORS[i % COLORS.length]} strokeWidth={2} connectNulls />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// Sample data: practice-test score tracking is not built yet.
export function ScoreChart() {
  return (
    <div role="img" aria-label="Sample line chart of test scores rising from 1020 on the diagnostic to 1260 on the retake" className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={testScores}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="test" />
          <YAxis domain={[900, 1400]} />
          <Tooltip />
          <Line type="monotone" dataKey="score" stroke="#d97706" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
