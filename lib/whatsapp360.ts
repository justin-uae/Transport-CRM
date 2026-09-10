import "server-only";

// Outbound side of the 360dialog integration — sends the guided-intake
// prompts (app/api/webhooks/360dialog/route.ts) back to a WhatsApp contact.
// WHATSAPP_API_BASE_URL defaults to 360dialog's sandbox host; point it at
// the production host once the account goes live. Never throws — a failed
// send shouldn't take down the webhook that's mid-conversation with a real
// customer, it just means that one prompt didn't arrive and gets logged.

const DEFAULT_BASE_URL = "https://waba-v2.360dialog.io";

async function sendMessage(payload: Record<string, unknown>): Promise<void> {
  const apiKey = process.env.WHATSAPP_API_KEY;
  if (!apiKey) {
    console.error("whatsapp360: WHATSAPP_API_KEY is not set — message not sent.");
    return;
  }
  const baseUrl = process.env.WHATSAPP_API_BASE_URL || DEFAULT_BASE_URL;

  try {
    const res = await fetch(`${baseUrl}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "D360-API-KEY": apiKey },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      console.error(`whatsapp360: 360dialog returned ${res.status}: ${await res.text().catch(() => "")}`);
    }
  } catch (err) {
    console.error("whatsapp360: send failed:", err);
  }
}

export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  await sendMessage({ messaging_product: "whatsapp", to, type: "text", text: { body } });
}

/**
 * Sends a "📍 Send Location" button instead of a plain text question — the
 * contact taps it to open WhatsApp's own location picker (current location
 * or search a place) rather than typing an address freehand. This is a
 * standard Meta Cloud API interactive message type (`location_request_
 * message`), not a 360dialog-specific extension, so it needs no extra
 * approval beyond what sending any message already requires.
 */
export async function sendWhatsAppLocationRequest(to: string, bodyText: string): Promise<void> {
  await sendMessage({
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
