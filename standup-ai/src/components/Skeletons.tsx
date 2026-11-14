// Loading placeholder for Suspense fallbacks.
export default function Skeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div role="status" aria-busy="true" aria-label="Loading" className="card bg-surface-100 p-6 space-y-3 animate-pulse">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={`h-5 rounded bg-surface-300 ${i === 0 ? "w-1/3" : "w-full"}`} />
      ))}
    </div>
  );
}
