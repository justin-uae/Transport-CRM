import "server-only";
import { getOpenAIClient } from "@/lib/openai";

// AI-driven replacement for the old fixed-step WhatsApp Q&A
// (app/api/webhooks/360dialog/route.ts). Each inbound message is answered
// by an OpenAI call that both carries on a natural conversation and extracts
// the cumulative trip details gathered so far — the webhook then decides,
// deterministically (not by trusting the model alone), whether enough is
// known to create a lead.

export interface CollectedTrip {
  name: string | null;
  email: string | null;
  pickup: string | null;
  destination: string | null;
  passenger_count: number | null;
  travel_date: string | null;
}

export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

export interface AiTurnResult {
  reply: string;
  collected: CollectedTrip;
  ready: boolean;
}

const EMPTY_COLLECTED: CollectedTrip = {
  name: null,
  email: null,
  pickup: null,
  destination: null,
  passenger_count: null,
  travel_date: null,
};

/** Circuit breaker on both cost and customer experience — a conversation
    that's gone this long without completing is handed off to staff
    (app/(staff)/whatsapp) rather than looping the AI forever. */
export const MAX_INTAKE_MESSAGES = 24;

const TURN_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description:
        "Your next WhatsApp message to the customer. Short and conversational — 1-3 sentences, no markdown, no bullet lists.",
    },
    collected: {
      type: "object",
      properties: {
        name: { type: ["string", "null"] },
        email: { type: ["string", "null"] },
        pickup: { type: ["string", "null"], description: "Pickup location, in the customer's own words" },
        destination: { type: ["string", "null"], description: "Destination, in the customer's own words" },
        passenger_count: { type: ["integer", "null"] },
        travel_date: { type: ["string", "null"], description: "The travel date as the customer described it — keep their own wording if it isn't a clean date" },
      },
      required: ["name", "email", "pickup", "destination", "passenger_count", "travel_date"],
      additionalProperties: false,
      description:
        "The COMPLETE, cumulative set of trip details known so far across the whole conversation — not just this message. Carry forward every previously known value; only change one if the customer corrects it.",
    },
    ready: {
      type: "boolean",
      description: "True only once name, pickup, destination and travel_date are all known well enough to create a booking lead.",
    },
  },
  required: ["reply", "collected", "ready"],
  additionalProperties: false,
} as const;

function systemPrompt(brandName: string): string {
  return (
    `You are the WhatsApp booking assistant for ${brandName}, a coach and transport hire company. You are chatting ` +
    `directly with a customer to understand what trip they need.\n\n` +
    `Goals:\n` +
    `- Have a natural, warm, concise WhatsApp conversation — short messages, no markdown, no long paragraphs.\n` +
    `- Collect: the customer's name, email address, pickup location, destination, travel date, and number of passengers.\n` +
    `- Ask about one or two missing things at a time — never demand everything in a single message.\n` +
    `- Never invent or guess a value the customer hasn't actually told you. Leave a field null until they say it.\n` +
    `- If the customer shares a location pin, it will already be described to you as text (e.g. "Shared location: ...") — treat it as their answer for whichever question you just asked.\n` +
    `- If the customer asks something unrelated to booking a trip, answer briefly and helpfully if you can, then steer the conversation back to finishing their request.\n` +
    `- Once you have name, pickup, destination and travel date (email and passenger count are nice to have but never block), set ready to true and make your reply a warm confirmation summarizing what you've got and letting them know the team will follow up shortly.\n` +
    `- Never set ready to true until you genuinely have those fields — don't rush the customer.`
  );
}

/** Every OpenAI call gets the full transcript plus a reminder of what's been
    gathered so far (belt-and-braces alongside asking the model to return the
    cumulative state itself — long conversations can otherwise drift). */
export async function runIntakeTurn(
  brandName: string,
  history: ConversationMessage[],
  collectedSoFar: CollectedTrip,
  latestUserText: string,
): Promise<AiTurnResult> {
  const client = getOpenAIClient();
  const response = await client.responses.create(
    {
      model: "gpt-4o-mini",
      instructions: `${systemPrompt(brandName)}\n\nData already collected (do not drop a value unless the customer corrects it): ${JSON.stringify(
        collectedSoFar,
      )}`,
      input: [...history.map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: latestUserText }],
      text: {
        format: {
          type: "json_schema",
          name: "whatsapp_intake_turn",
          strict: true,
          schema: TURN_SCHEMA,
        },
      },
    },
    { timeout: 20000 },
  );

  const raw = response.output_text;
  if (!raw) throw new Error("OpenAI returned no output for a WhatsApp intake turn.");

  const parsed = JSON.parse(raw) as AiTurnResult;
  return { reply: parsed.reply, collected: { ...EMPTY_COLLECTED, ...parsed.collected }, ready: Boolean(parsed.ready) };
}

/** The deterministic gate the webhook actually trusts — the model's `ready`
    flag is a signal, not the decision, so a hallucinated true (or a false
    despite everything being present) can't create a broken lead or stall a
    finished one. */
export function hasRequiredTripFields(collected: CollectedTrip): boolean {
  return Boolean(collected.name?.trim() && collected.pickup?.trim() && collected.destination?.trim() && collected.travel_date?.trim());
}
