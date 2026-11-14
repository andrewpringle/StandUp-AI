import { classRoster, learnerNotes } from "@/mock/data";
import MasteryBadge from "@/components/MasteryBadge";

export default function Teacher() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Class overview</h1>
      <section className="card bg-surface-100 p-4 overflow-x-auto" aria-labelledby="roster">
        <h2 id="roster" className="text-xl font-semibold mb-2">Mastery by student</h2>
        <table className="table w-full text-left">
          <thead>
            <tr><th>Student</th><th>Polynomials</th><th>Punctuation</th><th>Points</th></tr>
          </thead>
          <tbody>
            {classRoster.map((r) => (
              <tr key={r.name}>
                <td>{r.name}</td>
                <td><MasteryBadge state={r.poly} /></td>
                <td><MasteryBadge state={r.punct} /></td>
                <td>{r.points}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="card bg-surface-100 p-4" aria-labelledby="notes">
        <h2 id="notes" className="text-xl font-semibold mb-2">Learner notes</h2>
        <ul className="space-y-3">
          {learnerNotes.map((n) => (
            <li key={n.student + n.skill} className="border-b border-surface-300 pb-3 last:border-b-0">
              <p className="font-medium">{n.student} · {n.skill} <span className="text-xs font-normal">{n.date}</span></p>
              <p className="text-sm">{n.note}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
