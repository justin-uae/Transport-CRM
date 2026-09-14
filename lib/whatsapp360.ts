import "server-only";

// Outbound side of the 360dialog integration — sends the guided-intake
// prompts (app/api/webhooks/360dialog/route.ts) back to a WhatsApp contact,
// and staff replies (app/(staff)/whatsapp/actions.ts) to an existing thread.
// WHATSAPP_API_BASE_URL defaults to 360dialog's sandbox host; point it at
// the production host once the account goes live.
//
// Never throws — a failed send shouldn't take down the webhook that's
// mid-conversation with a real customer. It does report success/failure via
// its return value though, so a caller that DOES need to know (staff
// sending a manual reply, who'd otherwise see their message marked "sent"
// when WhatsApp actually rejected it — most commonly because it's been over
// 24h since the contact's last message, which WhatsApp only allows
// re-opening with an approved template, not freeform text) can act on it.
// The webhook flow is free to ignore the return value, same as before.

const DEFAULT_BASE_URL = "https://waba-v2.360dialog.io";

export interface SendResult {
  ok: boolean;
  error?: string;
}

async function sendMessage(payload: Record<string, unknown>): Promise<SendResult> {
  const apiKey = process.env.WHATSAPP_API_KEY;
  if (!apiKey) {
    const error = "WHATSAPP_API_KEY is not set — message not sent.";
    console.error(`whatsapp360: ${error}`);
    return { ok: false, error };
  }
  const baseUrl = process.env.WHATSAPP_API_BASE_URL || DEFAULT_BASE_URL;

  try {
    const res = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "D360-API-KEY": apiKey },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const error = `360dialog returned ${res.status}: ${body}`;
      console.error(`whatsapp360: ${error}`);
      return { ok: false, error };
    }
    return { ok: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : "Network error contacting 360dialog.";
    console.error("whatsapp360: send failed:", err);
    return { ok: false, error };
  }
}

export async function sendWhatsAppText(to: string, body: string): Promise<SendResult> {
  return sendMessage({ messaging_product: "whatsapp", to, type: "text", text: { body } });
}

/**
 * Sends a "📍 Send Location" button instead of a plain text question — the
 * contact taps it to open WhatsApp's own location picker (current location
 * or search a place) rather than typing an address freehand. This is a
 * standard Meta Cloud API interactive message type (`location_request_
 * message`), not a 360dialog-specific extension, so it needs no extra
 * approval beyond what sending any message already requires.
 */
export async function sendWhatsAppLocationRequest(to: string, bodyText: string): Promise<SendResult> {
  return sendMessage({
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "location_request_message",
      body: { text: bodyText },
      action: { name: "send_location" },
    },
  });
}
