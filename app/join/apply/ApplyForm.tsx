"use client";

import { useActionState } from "react";
import Link from "next/link";
import { PhoneNumberField } from "@/components/ui/PhoneNumberField";
import { applySupplierAction } from "./actions";

export function ApplyForm() {
  const [state, formAction, pending] = useActionState(applySupplierAction, { error: null, success: false });

  if (state.success) {
    return (
      <div className="rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h2 className="text-xl font-black text-slate-900">Application received</h2>
        <p className="mt-2 text-sm text-slate-500">
          Thanks for applying — our team will review your details and email you once a decision has been made. There&apos;s
          nothing else to do for now.
        </p>
        <Link href="/join" className="mt-6 inline-block rounded-xl border px-4 py-2.5 text-sm font-bold">
          Back to overview
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
      <h1 className="text-2xl font-black text-slate-900">Apply as a supplier</h1>
      <p className="mt-1 text-sm text-slate-500">
        Tell us about your business — you&apos;ll get an email to set up your account once we&apos;ve reviewed your
        application.
      </p>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-bold">
          Business / driver name
          <input name="name" required className="mt-2 w-full rounded-xl border px-3 py-2.5 text-base font-normal" />
        </label>
        <label className="text-sm font-bold">
          Type
          <select name="type" required defaultValue="" className="mt-2 w-full rounded-xl border px-3 py-2.5 text-base font-normal">
            <option value="" disabled>
              Select type…
            </option>
            <option value="company">Company / travel agency</option>
            <option value="individual">Individual driver</option>
          </select>
        </label>
        <label className="text-sm font-bold">
          Contact name
          <input name="contactName" className="mt-2 w-full rounded-xl border px-3 py-2.5 text-base font-normal" />
        </label>
        <label className="text-sm font-bold">
          Email
          <input name="email" type="email" required className="mt-2 w-full rounded-xl border px-3 py-2.5 text-base font-normal" />
        </label>
        <label className="text-sm font-bold">
          Phone
          <PhoneNumberField name="phone" className="mt-2" />
        </label>
        <label className="text-sm font-bold">
          WhatsApp
          <PhoneNumberField name="whatsapp" className="mt-2" />
        </label>
        <label className="text-sm font-bold sm:col-span-2">
          Region / area covered
          <input name="region" placeholder="e.g. Dubai" className="mt-2 w-full rounded-xl border px-3 py-2.5 text-base font-normal" />
        </label>
        <label className="text-sm font-bold sm:col-span-2">
          Tell us about your fleet / experience
          <textarea name="notes" className="mt-2 min-h-24 w-full rounded-xl border px-3 py-2.5 text-base font-normal" />
        </label>
      </div>

      {state.error && <div className="mt-4 rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{state.error}</div>}

      <button
        type="submit"
        disabled={pending}
        className="mt-6 w-full rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
      >
        {pending ? "Submitting…" : "Submit application"}
      </button>

      <p className="mt-4 text-center text-xs text-slate-400">
        Already approved?{" "}
        <Link href="/login" className="font-bold text-primary-600">
          Log in
        </Link>
      </p>
    </form>
  );
}
