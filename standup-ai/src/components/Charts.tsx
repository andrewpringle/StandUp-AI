"use client";
import { LineChart, Line, XAxis, YAxis, Tooltip, Legend, CartesianGrid, ResponsiveContainer } from "recharts";
import { abilityHistory, testScores } from "@/mock/data";

export function AbilityChart() {
  return (
    <div role="img" aria-label="Line chart of ability by week for Polynomials and Punctuation, both rising" className="h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={abilityHistory}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="week" />
          <YAxis />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="Polynomials" stroke="#4f46e5" strokeWidth={2} />
          <Line type="monotone" dataKey="Punctuation" stroke="#059669" strokeWidth={2} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function ScoreChart() {
  return (
    <div role="img" aria-label="Line chart of test scores rising from 1020 on the diagnostic to 1260 on the retake" className="h-64">
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
