import Link from "next/link";

export default function Landing() {
  return (
    <div className="grid md:grid-cols-2 gap-8 items-center py-8">
      <section className="space-y-4">
        <h1 className="text-4xl font-bold">ACT &amp; SAT tutoring that adapts to every student</h1>
        <p className="text-lg">
          Diagnostics find weak spots. An AI tutor learns how each student thinks, then quizzes at the right difficulty until skills are mastered.
        </p>
        <p className="text-sm">Demo build with sample data.</p>
      </section>
      <section aria-labelledby="login" className="card bg-surface-100 p-6 space-y-4">
        <h2 id="login" className="text-xl font-semibold">Sign in</h2>
        <form className="space-y-3">
          <label className="label">
            <span>School email</span>
            <input className="input" type="email" placeholder="student@school.edu" />
          </label>
          <div className="flex gap-2">
            <Link href="/dashboard" className="btn preset-filled-primary-500">Student demo</Link>
            <Link href="/teacher" className="btn preset-tonal">Teacher demo</Link>
          </div>
        </form>
      </section>
    </div>
  );
}
