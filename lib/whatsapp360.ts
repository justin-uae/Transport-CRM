import "server-only";

// Outbound side of the 360dialog integration — sends the guided-intake
// prompts (app/api/webhooks/360dialog/route.ts) back to a WhatsApp contact.
// WHATSAPP_API_BASE_URL defaults to 360dialog's sandbox host; point it at
// the production host once the account goes live. Never throws — a failed
// send shouldn't take down the webhook that's mid-conversation with a real
// customer, it just means that one prompt didn't arrive and gets logged.

const DEFAULT_BASE_URL = "https://waba-sandbox.360dialog.io";

export async function sendWhatsAppText(to: string, body: string): Promise<void> {
  const apiKey = process.env.WHATSAPP_API_KEY;
  if (!apiKey) {
    console.error("sendWhatsAppText: WHATSAPP_API_KEY is not set — message not sent.");
    return;
  }
  const baseUrl = process.env.WHATSAPP_API_BASE_URL || DEFAULT_BASE_URL;

  try {
    const res = await fetch(`${baseUrl}/v1/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "D360-API-KEY": apiKey },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });
    if (!res.ok) {
      console.error(`sendWhatsAppText: 360dialog returned ${res.status}: ${await res.text().catch(() => "")}`);
    }
  } catch (err) {
    console.error("sendWhatsAppText failed:", err);
  }
}
