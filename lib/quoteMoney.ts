// Pure pricing math shared by server code (lib/quotePayments.ts, the Stripe
// webhook) and client components (CustomerPaymentsPage) — deliberately has
// no "server-only" import so it can be pulled into both.

function round2(amount: number) {
  return Math.round(amount * 100) / 100;
}

interface VersionForDue {
  selling_price: number;
  deposit_percentage: number | null;
  deposit_fixed_amount?: number | null;
}

interface MilestoneForDue {
  sequence: number;
  amount: number;
}

/**
 * The amount owed for the *current* payment step.
 *
 * With a milestone schedule (QTE-04), that's the running total of every
 * milestone up to and including the first one not yet covered by what's
 * already been paid — so the customer pays one milestone at a time in order.
 * Without one, it's a fixed deposit amount, a deposit percentage of the
 * selling price, or the full selling price — whichever was chosen — minus
 * whatever has already been paid. Milestones, when present, supersede the
 * deposit fields entirely rather than combining with them.
 */
export function amountDueNow(version: VersionForDue, alreadyPaid: number, milestones: MilestoneForDue[] = []): number {
  if (milestones.length > 0) {
    const ordered = [...milestones].sort((a, b) => a.sequence - b.sequence);
    let cumulative = 0;
    for (const m of ordered) {
      cumulative = round2(cumulative + m.amount);
      if (cumulative > alreadyPaid + 0.01) {
        return Math.max(0, round2(cumulative - alreadyPaid));
      }
    }
    // Every scheduled milestone is already covered by payments so far —
    // fall back to whatever's left of the full price rather than reporting
    // nothing due on an under-scheduled quote.
    return Math.max(0, round2(version.selling_price - alreadyPaid));
  }

  const target = version.deposit_fixed_amount
    ? version.deposit_fixed_amount
    : version.deposit_percentage
      ? round2((version.selling_price * version.deposit_percentage) / 100)
      : version.selling_price;
  return Math.max(0, round2(target - alreadyPaid));
}

/**
 * GBP. The quote's selling price is converted to its GBP equivalent (see
 * lib/fxRates.ts's convertToGbp — quotes are priced in whatever currency the
 * brand/customer uses) before this is applied: below it, the customer pays
 * online (Stripe) only; at or above it, bank transfer only — the two are
 * mutually exclusive, never both offered on the same quote.
 */
export const STRIPE_PRICE_THRESHOLD = 1000;

export function paymentMethodsForGbpValue(gbpValue: number): { stripe: boolean; bank_transfer: boolean } {
  const stripeEligible = gbpValue < STRIPE_PRICE_THRESHOLD;
  return { stripe: stripeEligible, bank_transfer: !stripeEligible };
}
