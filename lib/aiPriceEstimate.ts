import "server-only";
import { estimateTripDistance } from "./tripDistance";
import { estimatePricing, type LeadForSweep } from "./aiAutoQuote";
import type { PricingBenchmark } from "./quotePricingBenchmark";

// An on-demand price benchmark for an EXISTING quote (Master Admin only, see
// estimateQuotePriceAction in app/(staff)/quotes/actions.ts) — a read-only
// sanity check against whatever price was actually charged, using the exact
// same pricing brain (lib/aiAutoQuote.ts's estimatePricing) that actually
// prices and sends a quote unattended. These used to be two separately-
// prompted AI calls that reasoned completely differently — this one asked
// for a flat "market rate per km", which drifts toward taxi-tier numbers,
// while estimatePricing asks for supplier cost then a margin on top, which
// in practice lands on far more sensible figures — and disagreed by roughly
// 3x on the same kind of trip in real testing. Rather than maintain two
// pricing philosophies that happen to agree sometimes, this now delegates
// to that one function, adding on top of it:
// 1. Every leg of the journey, not just the first — a quote's enquiry can
//    have more than one leg (a multi-stop tour, a separate return leg, ...),
//    and reading only enquiry_legs[0] silently threw the rest of the trip
//    away. Real per-leg distances are summed into one real total, and each
//    leg's own special requirements/luggage are folded in too, not just
//    leg 1's — see aggregateLegs() below.
// 2. A real driving distance from Google's Distance Matrix API
//    (lib/tripDistance.ts) for each leg, fed into the same call as
//    grounding — estimatePricing's own direct callers (the SLA sweep,
//    WhatsApp-lead and manual-assign triggers) don't pass this, so this is
//    currently the one caller that does.
// 3. This tenant's own real historical rate/km for a similarly-sized
//    vehicle (lib/quotePricingBenchmark.ts), when there's enough of it to
//    trust — overrides the model's own price entirely in that case, since
//    real accepted-quote data beats any LLM's guess, however well-reasoned.

export interface QuoteEstimateLeg {
  sequence: number;
  pickup: string | null;
  destination: string | null;
  passengerCount: number | null;
  luggageCount: number | null;
  specialRequirements: string | null;
}

export interface QuoteEstimateInput {
  brandName: string;
  travelDate: string | null;
  vehicleDescription: string | null;
  legs: QuoteEstimateLeg[];
  /** This tenant's own real historical rate/km for a similarly-sized
      vehicle, if lib/quotePricingBenchmark.ts found enough comparable past
      bookings to trust — overrides estimatePricing's own selling price
      (recomputed as total distance × this rate) when present. */
  historicalRatePerKm: PricingBenchmark | null;
}

export interface QuoteEstimateResult {
  currency: string;
  estimatedPrice: number;
  /** Sum across every leg that resolved a real distance — null only if none
      of them did (e.g. Distance Matrix unavailable/addresses too vague). */
  distanceKm: number | null;
  pricePerKm: number | null;
  legCount: number;
  /** True when the price came from this tenant's own quote history rather
      than estimatePricing's own figure — surfaced so the UI can say which. */
  usedHistoricalRate: boolean;
  historicalSampleSize: number | null;
  rationale: string;
}

/** Turns however many legs a quote has into the single pickup/destination/
    notes/passenger-count/luggage estimatePricing actually takes (it's
    shaped around a Lead, which only ever has one journey) — without this,
    only enquiry_legs[0] would ever reach the model, silently dropping every
    other leg of a multi-stop or return trip. */
function aggregateLegs(legs: QuoteEstimateLeg[]) {
  const first = legs[0];
  const last = legs[legs.length - 1] ?? first;

  // The vehicle has to be sized for whichever leg carries the most people/
  // luggage, not just leg 1 — a multi-leg trip that adds passengers partway
  // through needs pricing for its peak load.
  const passengerCount = legs.reduce<number | null>((max, l) => (l.passengerCount != null ? Math.max(max ?? 0, l.passengerCount) : max), null);
  const luggageCount = legs.reduce<number | null>((max, l) => (l.luggageCount != null ? Math.max(max ?? 0, l.luggageCount) : max), null);

  const notesParts: string[] = [];
  if (legs.length > 1) {
    notesParts.push(
      `Multi-leg journey (${legs.length} legs) — ` +
        legs.map((l) => `Leg ${l.sequence}: ${l.pickup ?? "?"} → ${l.destination ?? "?"}`).join("; "),
    );
  }
  for (const l of legs) {
    if (l.specialRequirements?.trim()) {
      notesParts.push(legs.length > 1 ? `Leg ${l.sequence} special requirements: ${l.specialRequirements.trim()}` : l.specialRequirements.trim());
    }
  }

  return {
    pickup: first?.pickup ?? null,
    destination: last?.destination ?? null,
    passengerCount,
    luggageCount,
    notes: notesParts.length ? notesParts.join(" | ") : null,
  };
}

export async function estimateQuoteTripPrice(input: QuoteEstimateInput): Promise<QuoteEstimateResult> {
  const legs = input.legs.length > 0 ? input.legs : [{ sequence: 1, pickup: null, destination: null, passengerCount: null, luggageCount: null, specialRequirements: null }];
  const aggregated = aggregateLegs(legs);

  // Real distance for EVERY leg, summed — a 3-leg tour's true distance is
  // leg 1 + leg 2 + leg 3, not just the first leg's, which is what a plain
  // pickup-to-destination lookup on the whole trip would otherwise measure
  // (cutting straight across intermediate stops, or missing a return leg
  // entirely).
  const legDistances = await Promise.all(legs.map((l) => estimateTripDistance(l.pickup, l.destination)));
  const resolvedDistances = legDistances.filter((d): d is NonNullable<typeof d> => d !== null);
  const totalDistanceKm = resolvedDistances.length > 0 ? Math.round(resolvedDistances.reduce((sum, d) => sum + d.distanceKm, 0) * 10) / 10 : null;
  const totalDurationMinutes = resolvedDistances.length > 0 ? resolvedDistances.reduce((sum, d) => sum + d.durationMinutes, 0) : undefined;

  // estimatePricing takes a LeadForSweep — most of its fields describe
  // things a quote doesn't have its own equivalent of (source channel, who
  // it's assigned to, ...), so this is a minimal stand-in built just to
  // reuse that one pricing brain rather than forking it. The vehicle
  // already recorded on the quote is passed through as "customer
  // requested" so it reasons about the SAME vehicle class the quote
  // actually used, not a freshly re-guessed one.
  const leadLike: LeadForSweep = {
    id: "quote-price-estimate",
    tenant_id: "",
    brand_id: null,
    customer_id: null,
    assigned_user_id: null,
    source: "manual",
    pickup_text: aggregated.pickup,
    destination_text: aggregated.destination,
    travel_date: input.travelDate,
    pickup_time: null,
    return_trip: false,
    return_date: null,
    return_time: null,
    passenger_count: aggregated.passengerCount,
    luggage_count: aggregated.luggageCount,
    vehicle_requested: input.vehicleDescription,
    notes: aggregated.notes,
    created_at: new Date().toISOString(),
  };

  const pricing = await estimatePricing(leadLike, input.brandName, {
    realDistanceKm: totalDistanceKm ?? undefined,
    realDurationMinutes: totalDurationMinutes,
  });

  const usedHistoricalRate = !!input.historicalRatePerKm;

  // Real historical data beats estimatePricing's own figure whenever
  // there's enough of it — recomputed from the total distance rather than
  // trusted as a flat override, since the historical rate is per-km.
  const estimatedPrice =
    usedHistoricalRate && totalDistanceKm
      ? Math.round(totalDistanceKm * input.historicalRatePerKm!.ratePerKm * 100) / 100
      : pricing.selling_price;

  const pricePerKm = totalDistanceKm ? Math.round((estimatedPrice / totalDistanceKm) * 100) / 100 : null;

  return {
    currency: pricing.currency,
    estimatedPrice,
    distanceKm: totalDistanceKm,
    pricePerKm,
    legCount: legs.length,
    usedHistoricalRate,
    historicalSampleSize: input.historicalRatePerKm?.sampleSize ?? null,
    rationale: usedHistoricalRate
      ? `Based on this tenant's own historical rate (${input.historicalRatePerKm!.sampleSize} comparable bookings) rather than the model's own figure. Model's own reasoning: ${pricing.pricing_rationale}`
      : pricing.pricing_rationale,
  };
}
