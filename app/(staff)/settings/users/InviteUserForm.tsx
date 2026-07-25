"use client";

import { useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { useToast } from "@/components/ui/Toast";
import { inviteUserAction } from "./actions";

export function InviteUserForm({ roles }: { roles: { id: string; name: string }[] }) {
  const notify = useToast();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result = await inviteUserAction({ error: null, link: null }, formData);
      if (result?.error) {
        setError(result.error);
        return;
      }
      setLink(result.link);
      notify("User created — share the link below");
    });
  }

  if (link) {
    return (
      <div className="w-full max-w-xl rounded-2xl border p-5">
        <h3 className="font-black">Share this invite link</h3>
        <p className="mt-1 text-sm text-slate-500">
          Send it to the new user directly (email, WhatsApp, Slack) — it lets them set their password and sign in.
        </p>
        <div className="mt-4 flex items-center gap-2 rounded-xl border bg-slate-50 p-3">
          <code className="flex-1 truncate text-sm">{link}</code>
          <button
            type="button"
            onClick={() => navigator.clipboard.writeText(link).then(() => notify("Link copied"))}
            className="rounded-lg bg-primary-500 px-3 py-2 text-xs font-bold text-white"
          >
            Copy
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setLink(null);
            setOpen(false);
          }}
          className="mt-4 rounded-xl border px-4 py-2.5 text-sm font-bold"
        >
          Done
        </button>
      </div>
    );
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
      >
        <UserPlus size={17} />
        Invite User
      </button>
    );
  }

  return (
    <form action={handleSubmit} className="w-full max-w-xl rounded-2xl border p-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Full name
          <input name="fullName" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Email
          <input name="email" type="email" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Job title
          <input name="jobTitle" className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal" />
        </label>
        <label className="text-sm font-bold">
          Role
          <select name="roleId" required className="mt-2 w-full rounded-xl border px-3 py-2.5 font-normal">
            {roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {error && (
        <div className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</div>
      )}
      <div className="mt-4 flex gap-2">
        <button
          type="submit"
          disabled={pending}
          className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
        >
          {pending ? "Creating…" : "Create invite"}
        </button>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="rounded-xl border px-4 py-2.5 text-sm font-bold"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
