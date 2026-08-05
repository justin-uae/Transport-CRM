"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Paperclip, Send, Mail as MailIcon } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { useToast } from "@/components/ui/Toast";
import { sendEmailAction } from "@/app/(staff)/email/mailActions";
import { EmailTemplatesPage } from "./EmailTemplatesPage";
import type { EmailAccount, EmailFolder, EmailMessage, EmailTemplate } from "@/lib/supabase/database.types";

const FOLDERS: { key: EmailFolder; label: string }[] = [
  { key: "inbox", label: "Inbox" },
  { key: "sent", label: "Sent" },
  { key: "archived", label: "Archived" },
];

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr`;
  return `${Math.round(hours / 24)} d`;
}

export function EmailCentrePage({
  templates,
  canManageTemplates,
  account,
  messages,
}: {
  templates: EmailTemplate[];
  canManageTemplates: boolean;
  account: EmailAccount | null;
  messages: EmailMessage[];
}) {
  const router = useRouter();
  const notify = useToast();
  const [tab, setTab] = useState<"inbox" | "templates">("inbox");
  const [folder, setFolder] = useState<EmailFolder>("inbox");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const showTemplates = canManageTemplates && tab === "templates";

  const inFolder = useMemo(() => messages.filter((m) => m.folder === folder), [messages, folder]);
  const selected = useMemo(
    () => inFolder.find((m) => m.id === selectedId) ?? inFolder[0] ?? null,
    [inFolder, selectedId],
  );

  const [replyText, setReplyText] = useState("");
  const [composeTo, setComposeTo] = useState("");
  const [composeSubject, setComposeSubject] = useState("");
  const [composeBody, setComposeBody] = useState("");

  function send(payload: { to: string; subject: string; bodyText: string; inReplyTo?: string | null }) {
    startTransition(async () => {
      const result = await sendEmailAction(payload);
      if (result?.error) {
        notify(result.error);
        return;
      }
      notify("Email sent");
      setReplyText("");
      setComposeOpen(false);
      setComposeTo("");
      setComposeSubject("");
      setComposeBody("");
      router.refresh();
    });
  }

  if (!account) {
    return (
      <div>
        <PageHead
          eyebrow="Integrated Communications"
          title="Email Centre"
          text="Shared inboxes, CRM-linked conversations, templates and AI-assisted replies."
        />
        <div className="grid min-h-[400px] place-items-center rounded-3xl border bg-white p-10 text-center shadow-sm">
          <div>
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary-50 text-primary-600">
              <MailIcon size={24} />
            </div>
            <h2 className="mt-4 text-lg font-black">No mailbox connected yet</h2>
            <p className="mx-auto mt-2 max-w-sm text-sm text-slate-500">
              Ask your Master Admin to connect your email account (IMAP/SMTP) from Settings → Users, then your sent
              and received mail will appear here automatically.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHead
        eyebrow="Integrated Communications"
        title="Email Centre"
        text={`Connected as ${account.email_address}`}
        action={
          !showTemplates ? (
            <button
              onClick={() => setComposeOpen(true)}
              className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
            >
              <Plus size={17} />
              Compose
            </button>
          ) : undefined
        }
      />

      {canManageTemplates && (
        <div className="mb-4 flex gap-2">
          {(["inbox", "templates"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={
                "rounded-xl px-3 py-2 text-sm font-bold " +
                (tab === t ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-600")
              }
            >
              {t === "inbox" ? "Inbox" : "Templates"}
            </button>
          ))}
        </div>
      )}

      {showTemplates ? (
        <EmailTemplatesPage templates={templates} />
      ) : (
        <div className="grid min-h-[650px] overflow-hidden rounded-3xl border bg-white shadow-sm lg:grid-cols-[220px_340px_1fr]">
          <div className="border-r p-4">
            <button
              onClick={() => setComposeOpen(true)}
              className="mb-5 flex w-full items-center justify-center gap-2 rounded-xl bg-primary-500 py-3 text-sm font-bold text-white"
            >
              <Plus size={17} />
              Compose
            </button>
            {FOLDERS.map((f) => {
              const count = messages.filter((m) => m.folder === f.key).length;
              return (
                <button
                  key={f.key}
                  onClick={() => {
                    setFolder(f.key);
                    setSelectedId(null);
                  }}
                  className={
                    "mb-1 w-full rounded-xl px-3 py-2.5 text-left text-sm " +
                    (folder === f.key ? "bg-primary-50 font-bold text-primary-700" : "hover:bg-slate-50")
                  }
                >
                  {f.label} {count > 0 && count}
                </button>
              );
            })}
          </div>
          <div className="border-r">
            <div className="border-b p-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                <input placeholder="Search inbox" className="w-full rounded-xl bg-slate-100 py-2.5 pl-9 pr-3 outline-none" />
              </div>
            </div>
            {inFolder.map((m) => (
              <button
                key={m.id}
                onClick={() => setSelectedId(m.id)}
                className={
                  "block w-full border-b p-4 text-left " + (selected?.id === m.id ? "bg-orange-50/60" : "")
                }
              >
                <div className="flex justify-between">
                  <b className="text-sm">{m.from_name || m.from_address}</b>
                  <span className="text-xs text-slate-400">{timeAgo(m.occurred_at)}</span>
                </div>
                <p className="mt-1 truncate text-sm text-slate-600">{m.subject || "(no subject)"}</p>
                <div className="mt-1 truncate text-xs text-slate-400">{m.snippet}</div>
              </button>
            ))}
            {inFolder.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-500">No messages in this folder.</p>
            )}
          </div>
          <div className="p-6">
            {selected ? (
              <>
                <div className="flex items-start justify-between border-b pb-5">
                  <div>
                    <h2 className="text-xl font-black">{selected.subject || "(no subject)"}</h2>
                    <p className="mt-1 text-sm text-slate-500">
                      {selected.from_name || selected.from_address} &lt;{selected.from_address}&gt;
                    </p>
                  </div>
                </div>
                <div className="py-8 text-sm leading-7 text-slate-600">
                  {selected.body_html ? (
                    <div dangerouslySetInnerHTML={{ __html: selected.body_html }} />
                  ) : (
                    <p className="whitespace-pre-wrap">{selected.body_text}</p>
                  )}
                </div>
                <div className="rounded-2xl border p-4">
                  <textarea
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="min-h-28 w-full resize-none outline-none"
                    placeholder="Write a reply…"
                  />
                  <div className="flex items-center justify-between border-t pt-3">
                    <button className="rounded-lg p-2 text-slate-300" disabled title="Attachments coming soon">
                      <Paperclip size={18} />
                    </button>
                    <button
                      disabled={pending || !replyText.trim()}
                      onClick={() =>
                        send({
                          to: selected.from_address,
                          subject: selected.subject?.startsWith("Re:") ? selected.subject : `Re: ${selected.subject ?? ""}`,
                          bodyText: replyText,
                          inReplyTo: selected.message_id,
                        })
                      }
                      className="flex items-center gap-2 rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                    >
                      <Send size={16} />
                      {pending ? "Sending…" : "Send"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <p className="py-8 text-center text-sm text-slate-500">Select a message to read it.</p>
            )}
          </div>
        </div>
      )}

      {composeOpen && (
        <div className="fixed inset-0 z-[200] grid place-items-center bg-slate-900/40 p-4" onClick={() => setComposeOpen(false)}>
          <div
            className="w-full max-w-lg rounded-3xl border bg-white p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black">New message</h3>
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-bold">
                To
                <input
                  value={composeTo}
                  onChange={(e) => setComposeTo(e.target.value)}
                  placeholder="name@example.com, another@example.com"
                  className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                Subject
                <input
                  value={composeSubject}
                  onChange={(e) => setComposeSubject(e.target.value)}
                  className="mt-1 w-full rounded-xl border px-3 py-2 font-normal"
                />
              </label>
              <label className="block text-sm font-bold">
                Message
                <textarea
                  value={composeBody}
                  onChange={(e) => setComposeBody(e.target.value)}
                  className="mt-1 min-h-32 w-full rounded-xl border px-3 py-2 font-normal"
                />
              </label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setComposeOpen(false)} className="rounded-xl border px-4 py-2.5 text-sm font-bold">
                Cancel
              </button>
              <button
                disabled={pending}
                onClick={() => send({ to: composeTo, subject: composeSubject, bodyText: composeBody })}
                className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-60"
              >
                {pending ? "Sending…" : "Send"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
