import Link from "next/link";

const links = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/practice", label: "Practice" },
  { href: "/tutor", label: "Tutor" },
  { href: "/teacher", label: "Teacher" },
];

export default function Nav() {
  return (
    <header className="bg-primary-500 text-white">
      <nav aria-label="Main" className="max-w-6xl mx-auto flex flex-wrap items-center gap-4 p-4">
        <Link href="/" className="font-bold text-lg">StandUp AI</Link>
        <ul className="flex gap-1 ml-auto">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="px-3 py-2 rounded hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white">
                {l.label}
              </Link>
            </li>
          ))}
          <li>
            {/* Static page in public/, so a plain anchor rather than next/link. */}
            <a href="/student-demo/index.html" className="px-3 py-2 rounded hover:bg-white/20 focus-visible:outline-2 focus-visible:outline-white">
              Student demo
            </a>
          </li>
        </ul>
      </nav>
    </header>
  );
}
