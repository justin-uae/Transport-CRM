"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { updateAiAutoQuoteSettingsAction } from "./actions";

export function AiAutoQuoteForm({ initialEnabled, initialSlaHours }: { initialEnabled: boolean; initialSlaHours: number }) {
  const notify = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [slaHours, setSlaHours] = useState(String(initialSlaHours));
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateAiAutoQuoteSettingsAction(enabled, Number(slaHours));
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("AI Auto-Quote settings saved");
    });
  }

  return (
    <div className="mt-4 max-w-md space-y-5">
      <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
        <span>
          <span className="block text-sm font-bold">Enable AI Auto-Quote</span>
          <span className="block text-xs text-slate-500">When off, unquoted leads are left for staff regardless of how long they sit.</span>
        </span>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          className="h-5 w-5 shrink-0 accent-primary-500"
        />
      </label>

      <div>
        <label className="block text-sm font-bold" htmlFor="ai-auto-quote-sla-hours">
          SLA (business hours before AI takes over)
        </label>
        <p className="mt-1 text-xs text-slate-500">Monday-Saturday only — Sundays don&rsquo;t count toward this total. Default 24.</p>
        <input
          id="ai-auto-quote-sla-hours"
          type="number"
          min={1}
          max={500}
          value={slaHours}
          onChange={(e) => setSlaHours(e.target.value)}
          disabled={!enabled}
          className="mt-2 w-32 rounded-xl border px-3 py-2.5 text-sm font-semibold disabled:opacity-50"
        />
      </div>

      <button
        disabled={pending}
        onClick={save}
        className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Saving…" : "Save"}
      </button>
    </div>
  );
}
