"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Send } from "lucide-react";
import clsx from "clsx";
import { createClient } from "@/lib/supabase/client";
import { PageHead } from "@/components/ui/PageHead";
import { useToast } from "@/components/ui/Toast";
import { formatDateTime } from "@/lib/formatDate";
import { sendWhatsAppReplyAction } from "@/app/(staff)/whatsapp/actions";
import type { WhatsAppMessageDirection } from "@/lib/supabase/database.types";

export interface ConversationSummary {
  waId: string;
  customerId: string | null;
  name: string;
  phone: string;
  lastBody: string;
  lastDirection: WhatsAppMessageDirection;
  lastAt: string;
}

export interface WhatsAppMessageRow {
  id: string;
  direction: WhatsAppMessageDirection;
  messageType: string;
  body: string;
  createdAt: string;
}

interface RealtimeRow {
  id: string;
  wa_id: string;
  customer_id: string | null;
  direction: WhatsAppMessageDirection;
  message_type: string;
  body: string;
  created_at: string;
}

/**
 * Two-pane WhatsApp conversation inbox (app/(staff)/whatsapp) — was a bare
 * placeholder before, since inbound message text only ever lived transiently
 * inside the guided-intake state machine. Reads from whatsapp_messages
 * (0063_whatsapp_messages.sql), which every inbound message and every
 * outbound send — automated prompt or a staff-typed reply — now logs to.
 * New messages arrive live via the same postgres_changes realtime pattern
 * Team Chat uses (components/pages/ChatChannelView.tsx).
 */
export function WhatsAppInboxPage({
  tenantId,
  conversations: initialConversations,
  initialSelectedWaId,
  initialThread,
}: {
  tenantId: string;
  conversations: ConversationSummary[];
  initialSelectedWaId: string | null;
  initialThread: WhatsAppMessageRow[];
}) {
  const notify = useToast();
  const [pending, startTransition] = useTransition();
  const [conversations, setConversations] = useState(initialConversations);
  const [selectedWaId, setSelectedWaId] = useState(initialSelectedWaId);
  const [thread, setThread] = useState<WhatsAppMessageRow[]>(initialThread);
  const [threadLoading, setThreadLoading] = useState(false);
  const [reply, setReply] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.waId === selectedWaId) ?? null;

  async function selectConversation(waId: string) {
    if (waId === selectedWaId) return;
    setSelectedWaId(waId);
    setThreadLoading(true);
    const supabase = createClient();
    const { data } = await supabase
      .from("whatsapp_messages")
      .select("id, direction, message_type, body, created_at")
      .eq("wa_id", waId)
      .order("created_at", { ascending: true })
      .limit(300);
    setThread(
      (data ?? []).map((r) => ({
        id: r.id,
        direction: r.direction,
        messageType: r.message_type,
        body: r.body,
        createdAt: r.created_at,
      })),
    );
    setThreadLoading(false);
  }

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [thread.length]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`whatsapp-messages-${tenantId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "whatsapp_messages", filter: `tenant_id=eq.${tenantId}` },
        (payload) => {
          const row = payload.new as RealtimeRow;

          setConversations((prev) => {
            const existing = prev.find((c) => c.waId === row.wa_id);
            const updated: ConversationSummary = existing
              ? { ...existing, lastBody: row.body, lastDirection: row.direction, lastAt: row.created_at }
              : {
                  waId: row.wa_id,
                  customerId: row.customer_id,
                  name: row.wa_id,
                  phone: row.wa_id,
                  lastBody: row.body,
                  lastDirection: row.direction,
                  lastAt: row.created_at,
                };
            return [updated, ...prev.filter((c) => c.waId !== row.wa_id)];
          });

          setSelectedWaId((current) => {
            if (current === row.wa_id) {
              setThread((prev) =>
                prev.some((m) => m.id === row.id)
                  ? prev
                  : [...prev, { id: row.id, direction: row.direction, messageType: row.message_type, body: row.body, createdAt: row.created_at }],
              );
            }
            return current;
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId]);

  function submitReply() {
    const customerId = selected?.customerId;
    const text = reply.trim();
    if (!text || !customerId) return;
    setReply("");
    startTransition(async () => {
      const result = await sendWhatsAppReplyAction(customerId, text);
      if (result.error) notify(result.error);
    });
  }

  return (
    <div>
      <PageHead eyebrow="Communications" title="WhatsApp" text="Conversations synced from your connected WhatsApp number." />
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]" style={{ height: "calc(100vh - 220px)", minHeight: 480 }}>
        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          <div className="flex-1 overflow-y-auto">
            {conversations.length === 0 && <p className="p-4 text-sm text-slate-400">No WhatsApp conversations yet.</p>}
            {conversations.map((c) => (
              <button
                key={c.waId}
                type="button"
                onClick={() => selectConversation(c.waId)}
                className={clsx(
                  "block w-full border-b border-slate-100 px-4 py-3 text-left",
                  c.waId === selectedWaId ? "bg-primary-50" : "hover:bg-slate-50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-slate-800">{c.name}</span>
                  <span className="shrink-0 text-[11px] text-slate-400">{formatDateTime(c.lastAt)}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-slate-500">
                  {c.lastDirection === "outbound" ? "You: " : ""}
                  {c.lastBody}
                </div>
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
          {!selected ? (
            <div className="grid flex-1 place-items-center text-sm text-slate-400">Select a conversation</div>
          ) : (
            <>
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="font-bold text-slate-800">{selected.name}</div>
                <div className="text-xs text-slate-400">{selected.phone}</div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
                {threadLoading && <p className="text-xs text-slate-400">Loading…</p>}
                {thread.map((m) => (
                  <div key={m.id} className={clsx("flex", m.direction === "outbound" ? "justify-end" : "justify-start")}>
                    <div
                      className={clsx(
                        "max-w-[75%] rounded-2xl px-3.5 py-2 text-sm",
                        m.direction === "outbound" ? "bg-primary-500 text-white" : "bg-white text-slate-800 shadow-sm",
                      )}
                    >
                      <div className="whitespace-pre-line">{m.body}</div>
                      <div className={clsx("mt-1 text-[10px]", m.direction === "outbound" ? "text-white/70" : "text-slate-400")}>
                        {formatDateTime(m.createdAt)}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
              <div className="flex items-end gap-2 border-t border-slate-100 p-3">
                <textarea
                  value={reply}
                  onChange={(e) => setReply(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      submitReply();
                    }
                  }}
                  rows={1}
                  placeholder={selected.customerId ? "Type a message…" : "No linked customer record — cannot reply"}
                  disabled={!selected.customerId || pending}
                  className="max-h-32 flex-1 resize-none rounded-xl border px-3 py-2 text-sm disabled:bg-slate-50"
                />
                <button
                  type="button"
                  onClick={submitReply}
                  disabled={!selected.customerId || pending || !reply.trim()}
                  className="rounded-xl bg-primary-500 p-2.5 text-white disabled:opacity-50"
                  aria-label="Send"
                >
                  <Send size={18} />
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
