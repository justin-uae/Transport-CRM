"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export interface CustomerOption {
  id: string;
  company_name: string | null;
  contact_name: string;
  email: string | null;
  phone: string | null;
}

function contactLine(c: CustomerOption) {
  return [c.email, c.phone].filter(Boolean).join(" · ") || "No contact details";
}

/**
 * Searchable existing-customer picker (CUS-02/UI-CUS-01) — filters on name,
 * company, email and phone as you type instead of a plain <select> forcing
 * a scroll through every customer alphabetically. Every result shows name,
 * email and phone so near-duplicate customers stay disambiguated.
 */
export function CustomerCombobox({
  customers,
  value,
  onChange,
  placeholder = "Search by name, company, email or phone…",
}: {
  customers: CustomerOption[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const selected = customers.find((c) => c.id === value) ?? null;

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const pool = !q
      ? customers
      : customers.filter((c) =>
          [c.company_name, c.contact_name, c.email, c.phone].some((field) => (field ?? "").toLowerCase().includes(q)),
        );
    return pool.slice(0, 25);
  }, [customers, query]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  if (selected && !open) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border px-3 py-3">
        <div className="min-w-0">
          <div className="truncate font-bold">{selected.company_name || selected.contact_name}</div>
          <div className="truncate text-xs text-slate-500">{contactLine(selected)}</div>
        </div>
        <button
          type="button"
          onClick={() => {
            setQuery("");
            setOpen(true);
          }}
          className="shrink-0 text-xs font-bold text-primary-600 hover:underline"
        >
          Change
        </button>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder={customers.length === 0 ? "No customers yet" : placeholder}
        disabled={customers.length === 0}
        className="w-full rounded-xl border px-3 py-3 disabled:bg-slate-50 disabled:text-slate-400"
      />
      {open && customers.length > 0 && (
        <div className="absolute z-20 mt-1 max-h-64 w-full overflow-y-auto rounded-xl border bg-white shadow-lg">
          {results.length === 0 ? (
            <div className="px-3 py-3 text-sm text-slate-400">No matching customers</div>
          ) : (
            results.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  onChange(c.id);
                  setOpen(false);
                  setQuery("");
                }}
                className="block w-full px-3 py-2.5 text-left text-sm hover:bg-slate-50"
              >
                <div className="font-bold">{c.company_name || c.contact_name}</div>
                <div className="text-xs text-slate-500">{contactLine(c)}</div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
