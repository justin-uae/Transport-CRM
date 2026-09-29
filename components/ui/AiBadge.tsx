import { Bot } from "lucide-react";

/** Small "AI" pill marking a quote/job that lib/aiAutoQuote.ts priced and
    sent on its own, wherever that quote naturally shows up (Pending Quotes,
    or whichever Bookings tab it's since moved on to) — replaces the old
    standalone "AI Created Quotes" page, which just listed the same quotes a
    second time instead of badging them in place. */
export function AiBadge() {
  return (
    <span
      title="Priced and sent automatically by AI Auto-Quote"
      className="flex items-center gap-1 rounded-full bg-indigo-50 px-2.5 py-1 text-xs font-bold text-indigo-600"
    >
      <Bot size={12} /> AI
    </span>
  );
}
