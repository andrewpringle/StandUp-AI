import Link from "next/link";

// Links to the publishers' own sites; nothing is copied. Checked to resolve on 2026-11-14.
const LINKS = [
  { name: "SAT practice tests", org: "College Board", note: "Official full-length SAT practice tests.", url: "https://satsuite.collegeboard.org/practice/practice-tests" },
  { name: "Bluebook", org: "College Board", note: "The official digital testing app.", url: "https://bluebook.collegeboard.org/" },
  { name: "Free ACT practice", org: "ACT", note: "Free official ACT practice tests and prep.", url: "https://www.act.org/content/act/en/products-and-services/the-act/test-preparation/free-act-test-prep.html" },
];

export default function OfficialPractice({ showPracticeLink = false }: { showPracticeLink?: boolean }) {
  return (
    <section className="card bg-surface-100 p-4 space-y-3" aria-labelledby="official">
      <h2 id="official" className="text-xl font-semibold">Official practice tests</h2>
      <p className="text-sm">
        Take an official full-length test every few weeks as a timed checkpoint. For everyday studying, use the practice
        questions here: they adapt to your weak skills, give instant feedback, and track your progress. Official test
        activity isn&apos;t tracked here.
        {showPracticeLink && <> <Link href="/practice" className="underline">Go to practice</Link></>}
      </p>
      <ul className="grid md:grid-cols-3 gap-3">
        {LINKS.map((l) => (
          <li key={l.url} className="p-3 rounded border border-surface-300 space-y-1">
            <p className="text-xs">{l.org}</p>
            <a href={l.url} target="_blank" rel="noopener noreferrer" className="font-medium underline">
              {l.name}<span className="sr-only"> (opens in a new tab)</span>
            </a>
            <p className="text-sm">{l.note}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
