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
  notes: string | null;
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
  notes: null,
};

/** Circuit breaker on both cost and customer experience — a conversation
    that's gone this long without completing is handed off to staff
    (app/(staff)/whatsapp) rather than looping the AI forever. Sized well
    above what a real intake conversation needs (a normal one completes in
    well under 20 messages) now that webhook redeliveries are de-duplicated
    (migration 0083_whatsapp_message_dedup.sql) rather than each counting
    twice against this cap. */
export const MAX_INTAKE_MESSAGES = 40;

// A short "thanks"/"ok"/"👍"-style reply to an already-finished conversation
// doesn't need a full new intake spun up around it — that's what produced
// the "AI starts over from scratch just because I said thanks" complaint.
// Caught here with a cheap regex (no OpenAI call) rather than an AI
// classification step, since the whole point is to avoid firing the model
// (and opening a new session/lead) for something this trivial.
const CLOSING_ACK_RE =
  /^[\s!.?,]*(thanks(\s*(a lot|so much|very much))?|thank\s?(you|u)(\s*(so much|very much))?|thx|ty|ok(ay)?|k+|cool|great|perfect(o)?|awesome|nice|noted|got\s?it|sounds good|appreciate it|cheers|good|alright|sure( thing)?|no problem|np|👍|🙏|❤️|😊|🙂|😀)[\s!.?,👍🙏❤️😊🙂😀]*$/i;

export function isClosingAcknowledgement(text: string): boolean {
  return CLOSING_ACK_RE.test(text.trim());
}

/** Warm, human sign-off for that case — never re-opens the conversation or
    asks anything further. */
export function closingAckReply(customerName: string | null): string {
  const name = customerName?.trim();
  return name
    ? `You're welcome, ${name}! Our team will be in touch shortly to confirm everything. 🙂`
    : `You're welcome! Our team will be in touch shortly to confirm everything. 🙂`;
}

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
        passenger_count: { type: ["integer", "null"], description: "How many passengers are travelling. Required — always ask for a number, never leave it unasked." },
        travel_date: {
          type: ["string", "null"],
          description:
            "The travel date, resolved to an explicit calendar date (e.g. \"2026-10-06\") whenever you can work it out from what the customer said plus today's date given in your instructions — including relative phrases like \"next Friday\" or \"6th of next month\". Only fall back to their raw wording if it's genuinely too vague to resolve to a specific date (e.g. \"sometime in the new year\").",
        },
        notes: {
          type: ["string", "null"],
          description:
            "Any further/special requirements the customer mentions when you ask (e.g. wheelchair access, luggage, child seats, a specific pickup time). This must always be explicitly asked about once the trip basics are known. If the customer says they have nothing else to add, set this to \"None\" rather than leaving it null — null means you haven't asked yet.",
        },
      },
      required: ["name", "email", "pickup", "destination", "passenger_count", "travel_date", "notes"],
      additionalProperties: false,
      description:
        "The COMPLETE, cumulative set of trip details known so far across the whole conversation — not just this message. Carry forward every previously known value; only change one if the customer corrects it.",
    },
    ready: {
      type: "boolean",
      description:
        "True only once name, email, pickup, destination, travel_date, passenger_count are all known AND notes has been explicitly asked about (set to \"None\" if the customer had nothing to add) — all seven fields are required, none may be skipped.",
    },
  },
  required: ["reply", "collected", "ready"],
  additionalProperties: false,
} as const;

function systemPrompt(brandName: string, todayIso: string): string {
  return (
    `You're texting on WhatsApp for ${brandName}, a coach and transport hire company, helping a customer book a trip. ` +
    `You're a real person on the team, not a bot or an AI — never say or imply otherwise, never break character, and never ` +
    `use stiff, robotic, or "customer service script" phrasing. Text the way a helpful, friendly staff member actually would: ` +
    `casual, warm, brief reactions before a question are good ("Perfect, thanks!", "Got it.", "Nice, okay.") but keep every ` +
    `message short — 1-3 sentences, contractions, no markdown, no bullet lists, no corporate tone. Today's date is ${todayIso}.\n\n` +
    `THE MOST IMPORTANT RULE — READ THIS FIRST: your instructions include a "Data already collected" block with the ` +
    `cumulative trip details known so far. Treat every non-null value in that block as settled fact, permanently — never ` +
    `re-ask a question whose field is already non-null there, even if the transcript looks incomplete, confusing, or you're ` +
    `unsure. Silently skip straight to the next field that's still null. Asking someone something they already told you is ` +
    `the single worst thing you can do here — it reads as broken, not human.\n\n` +
    `Goals:\n` +
    `- These SEVEN fields are ALL required, every single time, with no exceptions — never skip one, never decide a customer "seems like" they don't need to answer one: full name, email address, pickup location, destination, travel date, number of passengers, and any further/special requirements (notes).\n` +
    `- Some of these may already be known before the conversation even starts (a returning contact's name/email can be pre-filled in the "Data already collected" block) — if so, don't ask for them again, just move on to the first missing field.\n` +
    `- Ask for ONLY ONE field per message — never combine two questions in the same message. In particular, name and email are two separate questions asked one after another, never in the same message. The same applies to every other field.\n` +
    `- Suggested order: name, then email, then pickup, then destination, then travel date, then number of passengers, then finally ask "Anything else we should know, or any special requirements for the trip?" as its own separate message. If the customer says no/none, record notes as "None" — do not leave notes null, since null means you haven't asked yet, not that the answer was empty.\n` +
    `- Never invent or guess a value the customer hasn't actually told you. Leave a field null until they've actually answered that specific question.\n` +
    `- When the customer gives a travel date, work out the actual calendar date yourself using today's date above — resolve relative phrases like "next Friday" or "6th of next month" into an explicit date rather than leaving them as vague wording.\n` +
    `- If the customer volunteers several fields unprompted in one message (e.g. they type their whole trip in one go), that's fine — extract everything they gave you, then continue by asking for whichever of the seven fields is still missing, one at a time.\n` +
    `- If the customer shares a location pin, it will already be described to you as text (e.g. "Shared location: ...") — treat it as their answer for whichever question you just asked.\n` +
    `- If the customer asks something unrelated to booking a trip, answer briefly and helpfully like a real person would, then steer the conversation back to finishing their request.\n` +
    `- Once you have all seven fields — name, email, pickup, destination, travel date, passenger count, and notes (explicitly asked, "None" if nothing else) — set ready to true. Make your final reply feel like a genuine, warm sign-off: thank them by name, briefly confirm the trip in your own words, and let them know the team will follow up shortly. Do not ask anything further after this point.\n` +
    `- Never set ready to true until you genuinely have all seven — don't rush the customer, and don't skip asking for email, passenger count, or the "anything else" question just because you have some of the others. This must behave the exact same way for every conversation — always ask every field.`
  );
}

/** Combines what the model just extracted with what was already known,
    field by field — a later turn's null/empty value never erases a
    previously-known one. This is the actual fix for the "keeps asking the
    same question" bug: gpt-4o-mini occasionally drops a value when
    re-summarizing a long transcript from scratch every turn, and without
    this guard that dropped value gets persisted, making a field that was
    already answered look unasked again on the very next turn. Only a
    genuine new non-null value (the customer correcting themselves) can
    change an already-known field. */
export function mergeCollected(previous: CollectedTrip, next: CollectedTrip): CollectedTrip {
  const merged = { ...EMPTY_COLLECTED } as CollectedTrip;
  (Object.keys(EMPTY_COLLECTED) as (keyof CollectedTrip)[]).forEach((key) => {
    const nextVal = next[key];
    const isEmpty = nextVal === null || nextVal === undefined || (typeof nextVal === "string" && nextVal.trim() === "");
    (merged[key] as unknown) = isEmpty ? (previous[key] ?? null) : nextVal;
  });
  return merged;
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
  const todayIso = new Date().toISOString().slice(0, 10);
  const response = await client.responses.create(
    {
      model: "gpt-4o-mini",
      instructions: `${systemPrompt(brandName, todayIso)}\n\nData already collected (do not drop a value unless the customer corrects it): ${JSON.stringify(
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
    finished one. All seven fields are required — notes just needs to have
    been explicitly set (even to "None"), since null there means the model
    never actually asked. */
export function hasRequiredTripFields(collected: CollectedTrip): boolean {
  return Boolean(
    collected.name?.trim() &&
      collected.email?.trim() &&
      collected.pickup?.trim() &&
      collected.destination?.trim() &&
      collected.travel_date?.trim() &&
      collected.passenger_count !== null &&
      collected.passenger_count > 0 &&
      collected.notes !== null &&
      collected.notes.trim() !== "",
  );
}
