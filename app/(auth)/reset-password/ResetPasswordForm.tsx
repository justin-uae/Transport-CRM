"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function ResetPasswordForm({ hasSession = false }: { hasSession?: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"request" | "confirm">(hasSession ? "confirm" : "request");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const supabase = createClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setMode("confirm");
    });
    return () => subscription.unsubscribe();
  }, []);

  function handleRequest(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const supabase = createClient();
      const { error: requestError } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (requestError) {
        setError(requestError.message);
        return;
      }
      setMessage("If that email has an account, a reset link has been sent.");
    });
  }

  function handleConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters.");
      return;
    }
    startTransition(async () => {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  if (mode === "confirm") {
    return (
      <form onSubmit={handleConfirm} className="space-y-4">
        <div>
          <label className="text-sm font-bold text-slate-700" htmlFor="password">
            New password
          </label>
          <input
            id="password"
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
            className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100"
          />
        </div>
        {error && (
          <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={pending}
          className="w-full rounded-xl bg-primary-500 py-3 text-sm font-black text-white hover:bg-primary-600 disabled:opacity-60"
        >
          {pending ? "Saving…" : "Set new password"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleRequest} className="space-y-4">
      <div>
        <label className="text-sm font-bold text-slate-700" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-3 outline-none focus:border-primary-300 focus:ring-4 focus:ring-primary-100"
        />
      </div>
      {message && (
        <div className="rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700">
          {message}
        </div>
      )}
      {error && (
        <div className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-xl bg-primary-500 py-3 text-sm font-black text-white hover:bg-primary-600 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>
    </form>
  );
}
