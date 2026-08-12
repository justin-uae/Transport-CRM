"use client";

const TABS = [
  { id: "why-join", label: "Why join" },
  { id: "how-it-works", label: "How it works" },
];

export function NavTabs() {
  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <nav className="hidden items-center gap-1 md:flex">
      {TABS.map((tab) => (
        <button
          key={tab.id}
          type="button"
          onClick={() => scrollTo(tab.id)}
          className="rounded-lg px-3 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
        >
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
