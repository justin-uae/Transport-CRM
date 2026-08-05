import { NextRequest, NextResponse } from "next/server";
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { createAdminClient } from "@/lib/supabase/admin";
import { decryptSecret } from "@/lib/crypto";
import type { EmailAccount, EmailAttachmentMeta } from "@/lib/supabase/database.types";

// Render Cron Job hits this on a schedule (render.yaml) — every active
// mailbox's INBOX is polled for mail since the last successful sync (or the
// last 30 days, on first run) and upserted into email_messages. Only INBOX
// is polled: the "Sent" folder is populated directly by the send action
// (lib/userEmail.ts) as mail goes out, so there's nothing to reconcile
// between a locally-recorded send and an IMAP-side copy.
const FIRST_SYNC_LOOKBACK_DAYS = 30;

function firstNameOrAddress(value: { name?: string; address?: string }[] | undefined): string | null {
  return value?.[0]?.address ?? null;
}

async function syncAccount(admin: ReturnType<typeof createAdminClient>, account: EmailAccount) {
  const since = account.last_synced_at
    ? new Date(account.last_synced_at)
    : new Date(Date.now() - FIRST_SYNC_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  const client = new ImapFlow({
    host: account.imap_host,
    port: account.imap_port,
    secure: account.imap_security === "ssl",
    auth: { user: account.imap_username, pass: decryptSecret(account.imap_password_enc) },
    logger: false,
  });

  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX");
    try {
      const uids = await client.search({ since }, { uid: true });
      if (uids && uids.length > 0) {
        const rows = [];
        for await (const msg of client.fetch(uids, { source: true, uid: true }, { uid: true })) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          const references = Array.isArray(parsed.references) ? parsed.references[0] : parsed.references;

          rows.push({
            tenant_id: account.tenant_id,
            email_account_id: account.id,
            direction: "inbound" as const,
            folder: "inbox" as const,
            message_uid: String(msg.uid),
            message_id: parsed.messageId ?? null,
            in_reply_to: parsed.inReplyTo ?? null,
            thread_key: references ?? parsed.messageId ?? null,
            from_name: parsed.from?.value?.[0]?.name || null,
            from_address: firstNameOrAddress(parsed.from?.value) ?? account.email_address,
            to_addresses: (parsed.to && "value" in parsed.to ? parsed.to.value : []).map((v) => v.address).filter(Boolean),
            cc_addresses: (parsed.cc && "value" in parsed.cc ? parsed.cc.value : []).map((v) => v.address).filter(Boolean),
            subject: parsed.subject ?? null,
            body_text: parsed.text ?? null,
            body_html: typeof parsed.html === "string" ? parsed.html : null,
            snippet: (parsed.text ?? "").slice(0, 200),
            has_attachments: (parsed.attachments?.length ?? 0) > 0,
            attachment_meta: (parsed.attachments ?? []).map(
              (a): EmailAttachmentMeta => ({
                filename: a.filename ?? "attachment",
                size: a.size ?? null,
                contentType: a.contentType ?? null,
              }),
            ),
            occurred_at: (parsed.date ?? new Date()).toISOString(),
          });
        }

        if (rows.length > 0) {
          const { error } = await admin
            .from("email_messages")
            .upsert(rows, { onConflict: "email_account_id,folder,message_uid", ignoreDuplicates: true });
          if (error) throw new Error(`Storing messages failed: ${error.message}`);
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
}

export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: accounts, error } = await admin.from("email_accounts").select("*").eq("is_active", true);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const results = await Promise.all(
    (accounts ?? []).map(async (account) => {
      try {
        await syncAccount(admin, account);
        await admin
          .from("email_accounts")
          .update({ last_synced_at: new Date().toISOString(), last_sync_error: null })
          .eq("id", account.id);
        return { accountId: account.id, ok: true };
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown sync error.";
        await admin.from("email_accounts").update({ last_sync_error: message }).eq("id", account.id);
        return { accountId: account.id, ok: false, error: message };
      }
    }),
  );

  return NextResponse.json({ synced: results.length, results });
}
