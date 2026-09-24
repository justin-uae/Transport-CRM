import { notFound } from "next/navigation";
import { PageHead } from "@/components/ui/PageHead";
import { PageGuide } from "@/components/ui/PageGuide";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { AiAutoQuoteForm } from "./AiAutoQuoteForm";

export default async function AiAutoQuotePage() {
  const profile = await requireProfile();
  if (!profile.is_master_admin) notFound();

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("ai_auto_quote_enabled, ai_auto_quote_sla_hours")
    .eq("id", profile.tenant_id)
    .single();

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="AI Auto-Quote"
        text="Have Global Bus AI price and send a quote automatically when a lead sits unquoted too long."
        action={
          <PageGuide
            title="AI Auto-Quote"
            subtitle="A safety net for leads nobody's got to in time — not a replacement for a human quote."
            sections={[
              {
                heading: "How it decides a lead is overdue",
                bullets: true,
                body: [
                  "The clock starts the moment a lead is created, whether or not it's ever assigned to a sales user.",
                  "Only Monday-Saturday counts — Sunday never adds to the total, so a lead created Saturday evening with a 24-hour SLA breaches Monday evening, not on the Sunday in between.",
                  "Turning this on never treats existing leads as instantly overdue — every lead's countdown is floored at the moment you switch it on, so the first sweep only ever catches ones that are still unquoted after a fresh SLA window from now.",
                  "A lead that's already been quoted, closed, marked spam/duplicate, or whose travel date has already passed is never picked up.",
                ],
              },
              {
                heading: "What happens on breach",
                bullets: true,
                body: [
                  "If the lead is currently assigned to a sales user, it's released back to the open pool first — visible on the lead's Assignment history.",
                  "Global Bus AI estimates a market-rate selling price and supplier cost for the trip, and a real quote is created and emailed to the customer automatically — same email, PDF and quote lifecycle as a human-sent quote.",
                  "Every AI-priced quote shows up in Sales -> AI Created Quotes so it's easy to review what went out automatically.",
                ],
              },
              {
                heading: "Who can change this",
                body: ["Master Admin only — this runs hourly for the whole organisation, so it's kept out of individual role permissions."],
              },
            ]}
          />
        }
      />

      <Panel>
        <SectionTitle title="Settings" sub="Applies tenant-wide, checked every hour" />
        <AiAutoQuoteForm initialEnabled={tenant?.ai_auto_quote_enabled ?? false} initialSlaHours={tenant?.ai_auto_quote_sla_hours ?? 24} />
      </Panel>
    </div>
  );
}
