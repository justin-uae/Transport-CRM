"use client";

import { Plus, Search, MoreHorizontal, Paperclip, Sparkles, Send } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { useToast } from "@/components/ui/Toast";
import { inboxMessages } from "@/components/demo/demoData";

const FOLDERS = ["Inbox 18", "Assigned to me 7", "Awaiting reply 11", "Sent", "Drafts 3", "Archived"];

export function EmailCentrePage() {
  const notify = useToast();

  return (
    <div>
      <PageHead
        eyebrow="Integrated Communications"
        title="Email Centre"
        text="Shared inboxes, CRM-linked conversations, templates and AI-assisted replies."
        action={
          <button
            onClick={() => notify("Composer opened")}
            className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
          >
            <Plus size={17} />
            Compose
          </button>
        }
      />
      <div className="grid min-h-[650px] overflow-hidden rounded-3xl border bg-white shadow-sm lg:grid-cols-[220px_340px_1fr]">
        <div className="border-r p-4">
          <button
            onClick={() => notify("Composer opened")}
            className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 py-3 text-sm font-bold text-white"
          >
            <Plus size={17} />
            Compose
          </button>
          {FOLDERS.map((x, i) => (
            <button
              key={x}
              className={
                "mb-1 w-full rounded-xl px-3 py-2.5 text-left text-sm " +
                (i === 0 ? "bg-primary-50 font-bold text-primary-700" : "hover:bg-slate-50")
              }
            >
              {x}
            </button>
          ))}
        </div>
        <div className="border-r">
          <div className="border-b p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input placeholder="Search inbox" className="w-full rounded-xl bg-slate-100 py-2.5 pl-9 pr-3 outline-none" />
            </div>
          </div>
          {inboxMessages.map((x, i) => (
            <div key={x[0]} className={"border-b p-4 " + (i === 0 ? "bg-orange-50/60" : "")}>
              <div className="flex justify-between">
                <b className="text-sm">{x[0]}</b>
                <span className="text-xs text-slate-400">{x[2]}</span>
              </div>
              <p className="mt-1 truncate text-sm text-slate-600">{x[1]}</p>
              <div className="mt-2 text-xs font-bold text-primary-600">
                {i === 0 ? "Booking BK-28741" : "Assigned to sales"}
              </div>
            </div>
          ))}
        </div>
        <div className="p-6">
          <div className="flex items-start justify-between border-b pb-5">
            <div>
              <h2 className="text-xl font-black">Re: London group transport quote</h2>
              <p className="mt-1 text-sm text-slate-500">Horizon Events • Booking BK-28741</p>
            </div>
            <MoreHorizontal />
          </div>
          <div className="py-8 text-sm leading-7 text-slate-600">
            <p>Hello,</p>
            <p className="mt-4">
              Thank you for the revised quotation. We are happy to proceed with the 49-seat executive coach and
              would like to pay the deposit by bank transfer.
            </p>
            <p className="mt-4">Please confirm the bank details and next steps.</p>
            <p className="mt-4">
              Kind regards,
              <br />
              Sarah
            </p>
          </div>
          <div className="rounded-2xl border p-4">
            <textarea className="min-h-28 w-full resize-none outline-none" placeholder="Write a reply…" />
            <div className="flex items-center justify-between border-t pt-3">
              <div className="flex gap-2">
                <button className="rounded-lg p-2 hover:bg-slate-100">
                  <Paperclip size={18} />
                </button>
                <button className="rounded-lg p-2 text-primary-600 hover:bg-primary-50">
                  <Sparkles size={18} />
                </button>
              </div>
              <button
                onClick={() => notify("Reply sent and linked to booking")}
                className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white"
              >
                <Send size={16} />
                Send
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
