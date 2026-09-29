"use client";

import { useState, useTransition } from "react";
import { useToast } from "@/components/ui/Toast";
import { updateAiAutoQuoteSettingsAction } from "./actions";

export function AiAutoQuoteForm({
  initialEnabled,
  initialSlaHours,
  initialWhatsappEnabled,
}: {
  initialEnabled: boolean;
  initialSlaHours: number;
  initialWhatsappEnabled: boolean;
}) {
  const notify = useToast();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [slaHours, setSlaHours] = useState(String(initialSlaHours));
  const [whatsappEnabled, setWhatsappEnabled] = useState(initialWhatsappEnabled);
  const [pending, startTransition] = useTransition();

  function save() {
    startTransition(async () => {
      const result = await updateAiAutoQuoteSettingsAction(enabled, Number(slaHours), whatsappEnabled);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("AI Assistant settings saved");
    });
  }

  return (
    <div className="mt-4 max-w-md space-y-5">
      <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
        <span>
          <span className="block text-sm font-bold">Enable AI Assistant</span>
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
          Time limit (business hours before AI takes over)
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

      <div className="border-t pt-5">
        <label className="flex items-center justify-between gap-4 rounded-xl border p-4">
          <span>
            <span className="block text-sm font-bold">Instant quote for new WhatsApp leads</span>
            <span className="block text-xs text-slate-500">
              When on, a lead captured over WhatsApp is priced and quoted by AI the moment it&rsquo;s created — email and
              WhatsApp both — instead of waiting for the time limit above. Off by default; a separate switch from AI
              Assistant itself.
            </span>
          </span>
          <input
            type="checkbox"
            checked={whatsappEnabled}
            onChange={(e) => setWhatsappEnabled(e.target.checked)}
            className="h-5 w-5 shrink-0 accent-primary-500"
          />
        </label>
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
