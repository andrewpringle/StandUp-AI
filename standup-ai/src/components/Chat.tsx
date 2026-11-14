"use client";
import { useState } from "react";
import { chats } from "@/mock/data";

export default function Chat() {
  const [agent, setAgent] = useState<"quiz" | "deepdive">("deepdive");
  const { msgs, note } = chats[agent];

  return (
    <div className="card bg-surface-100 p-4 space-y-4 max-w-2xl">
      <div role="tablist" aria-label="Tutor agent" className="flex gap-2">
        {(["quiz", "deepdive"] as const).map((a) => (
          <button key={a} role="tab" aria-selected={agent === a} onClick={() => setAgent(a)}
            className={`btn ${agent === a ? "preset-filled-primary-500" : "preset-tonal"}`}>
            {a === "quiz" ? "Quiz agent" : "Deep-dive agent"}
          </button>
        ))}
      </div>
      <ul className="space-y-2" aria-live="polite">
        {msgs.map((m, n) => (
          <li key={n} className={`p-3 rounded max-w-[85%] ${m.from === "student" ? "ml-auto bg-primary-200" : "bg-surface-200"}`}>
            {m.text}
          </li>
        ))}
      </ul>
      {note && (
        <div role="status" className="p-3 rounded border border-success-500/40 bg-success-50">
          <strong>Learner note saved</strong>
          <p className="text-sm">{note}</p>
        </div>
      )}
      <form onSubmit={(e) => e.preventDefault()} className="flex gap-2">
        <label htmlFor="msg" className="sr-only">Message</label>
        <input id="msg" className="input flex-1" placeholder="Demo only: replies are scripted" disabled />
        <button className="btn preset-filled-primary-500" disabled>Send</button>
      </form>
    </div>
  );
}
