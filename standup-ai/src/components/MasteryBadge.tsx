import type { MasteryState } from "@/mock/data";

const styles: Record<MasteryState, string> = {
  unseen: "bg-surface-200 text-surface-900",
  learning: "bg-warning-200 text-warning-900",
  mastered: "bg-success-200 text-success-900",
  needs_review: "bg-error-200 text-error-900",
};

export default function MasteryBadge({ state }: { state: string }) {
  return <span className={`px-2 py-0.5 rounded text-xs font-medium ${styles[state as MasteryState]}`}>{state.replace("_", " ")}</span>;
}
