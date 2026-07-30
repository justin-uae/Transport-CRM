"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";

/**
 * A debounced search box that drives a URL search param (server-side
 * filtering) instead of filtering an already-fetched array on every
 * keystroke client-side. Resets pagination on a new search term.
 */
export function SearchInput({
  placeholder,
  paramName = "q",
}: {
  placeholder: string;
  paramName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get(paramName) ?? "");

  useEffect(() => {
    const handle = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString());
      if (value.trim()) params.set(paramName, value.trim());
      else params.delete(paramName);
      params.delete("page");
      router.replace(`${pathname}?${params.toString()}`);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, 300);
    return () => clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  return (
    <div className="relative flex-1">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
      <input
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-3 outline-none"
      />
    </div>
  );
}
