import { Suspense } from "react";
import { connection } from "next/server";
import { getTeacherView } from "@/server";
import type { TeacherView } from "@/server/contracts";
import MasteryBadge from "@/components/MasteryBadge";
import Skeleton from "@/components/Skeletons";
import { errorText } from "@/components/errors";

async function Live() {
  await connection();
  let v: TeacherView | undefined;
  let err = "";
  try { v = await getTeacherView(); } catch (e) { err = errorText(e); }
  if (!v) return <p role="alert" className="card bg-error-100 text-error-900 p-4">{err}</p>;

  return (
    <>
      <section className="card bg-surface-100 p-4 overflow-x-auto" aria-labelledby="roster">
        <h2 id="roster" className="text-xl font-semibold mb-2">Mastery by student</h2>
        {v.students.length === 0 ? (
          <p className="text-sm">No students yet. Students appear here after their first practice session.</p>
        ) : (
          <table className="table w-full text-left">
            <thead>
              <tr>
                <th scope="col">Student</th>
                <th scope="col">Answered</th>
                {v.skills.map((s) => <th key={s.id} scope="col" className="text-xs font-medium">{s.name}</th>)}
              </tr>
            </thead>
            <tbody>
              {v.students.map((st) => (
                <tr key={st.id}>
                  <th scope="row" className="font-medium">{st.name}</th>
                  <td>{st.attempts}</td>
                  {v.skills.map((s) => <td key={s.id}><MasteryBadge state={st.mastery[s.id] ?? "unseen"} /></td>)}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
      <section className="card bg-surface-100 p-4" aria-labelledby="notes">
        <h2 id="notes" className="text-xl font-semibold mb-2">Learner notes</h2>
        {v.notes.length === 0 ? (
          <p className="text-sm">
            No shared notes yet. Notes from tutor conversations stay private to the student until they are reviewed and shared.
          </p>
        ) : (
          <ul className="space-y-3">
            {v.notes.map((n, i) => (
              <li key={i} className="border-b border-surface-300 pb-3 last:border-b-0">
                <p className="font-medium">{n.student} · {n.skill} <span className="text-xs font-normal">{n.createdAt.slice(0, 10)}</span></p>
                <p className="text-sm">{n.summary}</p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

export default function Teacher() {
  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-bold">Class overview</h1>
      <Suspense fallback={<Skeleton rows={5} />}>
        <Live />
      </Suspense>
    </div>
  );
}
