"use client";
import { useState } from "react";
import { questions } from "@/mock/data";

export default function Practice() {
  const [i, setI] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const q = questions[i];
  const done = picked !== null;

  return (
    <div className="card bg-surface-100 p-6 space-y-4 max-w-2xl">
      <div className="flex items-center justify-between text-sm">
        <span>Question {i + 1} of {questions.length} · {q.skill}</span>
        <span aria-label={`Difficulty ${q.difficulty} of 3`}>
          Difficulty {"●".repeat(q.difficulty)}{"○".repeat(3 - q.difficulty)}
        </span>
      </div>
      <h2 className="text-xl font-semibold">{q.stem}</h2>
      <div role="group" aria-label="Answer choices" className="grid gap-2">
        {q.choices.map((c, n) => {
          const state = !done ? "" : n === q.correct ? "bg-success-200" : n === picked ? "bg-error-200" : "";
          return (
            <button key={c} disabled={done} onClick={() => setPicked(n)}
              className={`text-left p-3 rounded border border-surface-300 hover:bg-surface-200 focus-visible:outline-2 ${state}`}>
              {String.fromCharCode(65 + n)}. {c}
            </button>
          );
        })}
      </div>
      {done && (
        <div role="status" className="p-3 rounded bg-surface-200">
          <strong>{picked === q.correct ? "Correct!" : "Not quite."}</strong> {q.explanation}
        </div>
      )}
      {done && (
        <button className="btn preset-filled-primary-500" onClick={() => { setPicked(null); setI((i + 1) % questions.length); }}>
          Next question
        </button>
      )}
    </div>
  );
}
