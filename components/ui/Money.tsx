"use client";

import { useEffect, useState } from "react";
import clsx from "clsx";

// Module-level, not per-component state — Money can appear dozens of times
// on one page (every row of a list), and they all want the exact same rate
// table, fetched once rather than once each. /api/fx/rates just proxies
// lib/fxRates.ts's own 12h in-memory cache, so this is cheap either way, but
// there's no reason for 40 rows to each fire their own request on mount.
let ratesPromise: Promise<Record<string, number> | null> | null = null;
function getRates(): Promise<Record<string, number> | null> {
  if (!ratesPromise) {
    ratesPromise = fetch("/api/fx/rates")
      .then((r) => r.json())
      .then((data) => data.rates ?? null)
      .catch(() => null);
  }
  return ratesPromise;
}

function format(amount: number, currency: string) {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

/**
 * Displays a money amount converted to GBP, with the original amount/
 * currency available on hover (desktop) or tap (touch/mobile, where there's
 * no hover state so the `title` tooltip never fires) — the single shared way
 * every staff-facing page shows money, so every figure in the CRM reads in
 * one currency at a glance instead of staff mentally converting USD/GHS/
 * AED/... row by row.
 *
 * Deliberately NOT used for: customer-facing pages (app/q/[token]/*) or
 * generated PDFs (lib/pdfDocument.ts) — a customer/supplier must see the
 * real amount they're being charged/paid, not a GBP approximation of it —
 * or for a live data-entry form (e.g. quotes/new) where staff are actively
 * typing a real-currency amount and need to see that real number, not a
 * converted preview of their own input.
 *
 * Conversion happens client-side (the rate table is public, non-sensitive)
 * so this drops straight into both server-rendered list pages and
 * client-interactive ones without plumbing a conversion through every
 * loader. Before the rate table has loaded, or if `currency` isn't one the
 * rate source recognises, this shows the original amount/currency rather
 * than a wrong or blank number.
 */
export function Money({
  amount,
  currency,
  className,
}: {
  amount: number | null | undefined;
  currency: string;
  className?: string;
}) {
  const [rates, setRates] = useState<Record<string, number> | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getRates().then((r) => {
      if (!cancelled) setRates(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (amount == null) return <>—</>;

  const code = currency.toUpperCase();
  if (code === "GBP") return <span className={className}>{format(amount, "GBP")}</span>;

  const rate = rates?.[code];
  if (!rate) return <span className={className}>{format(amount, code)}</span>;

  const original = format(amount, code);
  const gbp = format(amount / rate, "GBP");

  return (
    <span
      className={clsx("cursor-help underline decoration-dotted decoration-slate-300 underline-offset-2", className)}
      title={`${original} (original)`}
      // Tapping toggles the display on touch devices — there's no hover
      // state to reveal the title tooltip there, so without this the
      // original currency was simply unreachable on mobile. stopPropagation
      // keeps the tap from also firing a parent row/Link's click (several
      // call sites render this inside a clickable list row).
      onClick={(e) => {
        e.stopPropagation();
        setShowOriginal((v) => !v);
      }}
    >
      {showOriginal ? original : gbp}
    </span>
  );
}
