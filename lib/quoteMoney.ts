// Pure pricing math shared by server code (lib/quotePayments.ts, the Stripe
// webhook) and client components (CustomerPaymentsPage) — deliberately has
// no "server-only" import so it can be pulled into both.

function round2(amount: number) {
  return Math.round(amount * 100) / 100;
}

interface VersionForDue {
  selling_price: number;
  deposit_percentage: number | null;
}

/** The amount owed for the *current* payment step — the deposit percentage of the selling price if one was chosen, otherwise the full selling price — minus whatever has already been paid. */
export function amountDueNow(version: VersionForDue, alreadyPaid: number): number {
  const target = version.deposit_percentage ? round2((version.selling_price * version.deposit_percentage) / 100) : version.selling_price;
  return Math.max(0, round2(target - alreadyPaid));
}
