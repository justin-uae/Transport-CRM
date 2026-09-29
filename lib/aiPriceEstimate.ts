import "server-only";
import { getOpenAIClient } from "./openai";
import { estimateTripDistance } from "./tripDistance";
import type { PricingBenchmark } from "./quotePricingBenchmark";

// An on-demand OpenAI price benchmark for an EXISTING quote (Master Admin
// only, see estimateQuotePriceAction in app/(staff)/quotes/actions.ts) —
// distinct from lib/aiAutoQuote.ts's estimatePricing, which prices and sends
// a brand-new quote unattended. This one is purely a read-only sanity check
// against whatever price was actually charged, so it returns a single
// market-rate figure rather than a full vehicle/customer-notes/deposit quote
// build.
//
// Three things made this unreliable, all fixed here:
// 1. No temperature set, so the model sampled a fresh, loosely-anchored
//    number each call instead of reasoning the same way twice (reported
//    live: MXN 25,000 on one click, MXN 4,500 on the very next, same
//    unchanged trip). Now pinned to temperature: 0.
// 2. The model had to guess BOTH the geography and the price from two
//    address strings alone, with nothing to anchor the number to. Now
//    grounded with a real driving distance from Google's Distance Matrix
//    API (lib/tripDistance.ts) whenever it's available.
// 3. Even once grounded in real distance, gpt-4o-mini's own "market rate"
//    guess still isn't reliable — a real test came back pricing a 15-seat
//    coach at roughly taxi per-km rates (₹3,174 for 211km, vs. an actual
//    accepted quote of ₹35,000 for a comparable trip). An LLM's parametric
//    knowledge of niche regional commercial-vehicle rates just isn't
//    trustworthy. So price_per_km is no longer trusted from the model at
//    all when there's real data to use instead: the caller
//    (estimateQuotePriceAction) looks up this tenant's own recent accepted
//    quotes for a similarly-sized vehicle (lib/quotePricingBenchmark.ts)
//    and, when there's enough of them, that empirical rate — not the
//    model's guess — becomes price_per_km. The model still runs for
//    currency/minimum-fee/rationale, and remains the sole source of
//    price_per_km only when there isn't enough real history yet (e.g. a
//    brand-new tenant, or a genuinely novel route/vehicle size).

export interface QuoteEstimateInput {
  brandName: string;
  pickup: string | null;
  destination: string | null;
  travelDate: string | null;
  passengerCount: number | null;
  vehicleDescription: string | null;
  /** This tenant's own real historical rate/km for a similarly-sized
      vehicle, if lib/quotePricingBenchmark.ts found enough comparable past
      bookings to trust — takes over from the model's own price_per_km when
      present. */
  historicalRatePerKm: PricingBenchmark | null;
}

export interface QuoteEstimateResult {
  currency: string;
  estimatedPrice: number;
  distanceKm: number | null;
  pricePerKm: number;
  /** True when pricePerKm came from this tenant's own quote history rather
      than the model's guess — surfaced so the UI/rationale can say which. */
  usedHistoricalRate: boolean;
  historicalSampleSize: number | null;
  rationale: string;
}

const ESTIMATE_SCHEMA = {
  type: "object",
  properties: {
    currency: {
      type: "string",
      description:
        "The ISO 4217 currency code (e.g. USD, EUR, GBP, AED, INR, MXN) for the country where this trip actually takes place — work it out from the pickup/destination locations. If you can't confidently tell, use USD as the safe default, never EUR.",
    },
    distance_km: {
      type: "number",
      description:
        "The one-way driving distance for this trip in kilometres. If a real driving distance is given to you in the input, use that EXACT figure — never re-estimate or round it differently. Otherwise, your best estimate from the pickup/destination. Must be greater than 0.",
    },
    price_per_km: {
      type: "number",
      description:
        "A fair, realistic market rate per kilometre for hiring THIS SPECIFIC vehicle/group size in this country, in the currency you chose. This is a commercial passenger vehicle (minibus/coach), NOT a private car or taxi — its per-km rate is typically several times a taxi's, since it must cover a professional driver, a much larger vehicle's fuel/maintenance cost, and the driver's return leg (many operators charge for the round trip even on a one-way hire, since the vehicle and driver still have to get back). Reason explicitly about vehicle class before naming a rate — do not default to a generic per-km transport figure. Must be greater than 0.",
    },
    minimum_fee: {
      type: "number",
      description:
        "A flat minimum charge for a short trip, in the currency you chose, covering base costs regardless of distance (e.g. a local airport transfer) — the final price is whichever is higher: distance_km × price_per_km, or this minimum. Use a realistic local minimum, not 0, unless the trip is long enough that a minimum would never apply.",
    },
    rationale: {
      type: "string",
      description: "One sentence, for internal staff eyes only, explaining how you arrived at this figure.",
    },
  },
  required: ["currency", "distance_km", "price_per_km", "minimum_fee", "rationale"],
  additionalProperties: false,
} as const;

const CURRENCY_CODE_RE = /^[A-Z]{3}$/;

export async function estimateQuoteTripPrice(input: QuoteEstimateInput): Promise<QuoteEstimateResult> {
  const client = getOpenAIClient();
  const realDistance = await estimateTripDistance(input.pickup, input.destination);

  const response = await client.responses.create(
    {
      model: "gpt-4o-mini",
      // temperature: 0 — this is a pricing benchmark a Master Admin re-runs
      // to sanity-check a quote; it needs to give the same answer for the
      // same unchanged trip every time, not a fresh guess each click.
      temperature: 0,
      instructions:
        `You are a pricing analyst for ${input.brandName}, a coach and transport hire company. Reason step by step: ` +
        `identify the vehicle class from the group size, pick a realistic per-km rate for THAT vehicle class (not a car/taxi ` +
        `rate) in this country's market, and a sensible minimum fee for a short trip, then let the actual total follow ` +
        `from those — never jump straight to a round total figure. Price it in the currency of the country where the ` +
        `trip takes place.`,
      input: [
        {
          role: "user" as const,
          content: [
            `Pickup: ${input.pickup ?? "Not specified"}`,
            `Destination: ${input.destination ?? "Not specified"}`,
            realDistance
              ? `Real driving distance (from mapping data — use this exact figure, do not re-estimate it): ${realDistance.distanceKm} km, approx ${realDistance.durationMinutes} minutes`
              : null,
            `Travel date: ${input.travelDate ?? "Not specified"}`,
            `Passengers: ${input.passengerCount ?? "Not specified"}`,
            input.vehicleDescription ? `Vehicle: ${input.vehicleDescription}` : null,
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "quote_price_estimate",
          strict: true,
          schema: ESTIMATE_SCHEMA,
        },
      },
    },
    { timeout: 20000 },
  );

  const raw = response.output_text;
  if (!raw) throw new Error("OpenAI returned no output for a quote price estimate.");
  const parsed = JSON.parse(raw) as {
    currency: string;
    distance_km: number;
    price_per_km: number;
    minimum_fee: number;
    rationale: string;
  };

  const code = parsed.currency?.toUpperCase().trim();
  const currency = code && CURRENCY_CODE_RE.test(code) ? code : "USD";

  // The real, mapping-derived distance always wins over the model's own
  // figure when we have one — the model is only asked to echo it back so it
  // reasons in the right units, not to override real data with a guess.
  const distanceKm = realDistance?.distanceKm ?? (parsed.distance_km > 0 ? parsed.distance_km : null);

  // Real historical data beats the model's own rate guess whenever there's
  // enough of it — see the module comment above for why the guess alone
  // isn't trustworthy.
  const usedHistoricalRate = !!input.historicalRatePerKm;
  const pricePerKm = input.historicalRatePerKm?.ratePerKm ?? parsed.price_per_km;

  if (!(pricePerKm > 0)) {
    throw new Error("AI price estimate returned a non-positive rate.");
  }

  // Computed here, not trusted from the model's own arithmetic — removes
  // "the model can't multiply reliably" as a further source of
  // same-input-different-answer inconsistency.
  const distanceCharge = distanceKm ? distanceKm * pricePerKm : 0;
  const estimatedPrice = Math.round(Math.max(distanceCharge, parsed.minimum_fee || 0) * 100) / 100;

  if (!(estimatedPrice > 0)) {
    throw new Error("AI price estimate resolved to a non-positive amount.");
  }

  return {
    currency,
    estimatedPrice,
    distanceKm,
    pricePerKm,
    usedHistoricalRate,
    historicalSampleSize: input.historicalRatePerKm?.sampleSize ?? null,
    rationale: parsed.rationale,
  };
}
