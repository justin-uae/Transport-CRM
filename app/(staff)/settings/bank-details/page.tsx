import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { requireProfile } from "@/lib/auth";
import { hasPermission, PERMISSIONS } from "@/lib/permissions";
import { createClient } from "@/lib/supabase/server";
import { BankProfilesManager } from "./BankProfilesManager";
import { TermsForm } from "./TermsForm";
import type { BankAccount } from "@/lib/supabase/database.types";

export default async function BankDetailsPage() {
  const profile = await requireProfile();
  const canManage = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_ACCOUNTING_SETTINGS);
  const supabase = await createClient();

  const [{ data: profiles }, { data: tenant }] = await Promise.all([
    supabase.from("bank_accounts").select("*").eq("tenant_id", profile.tenant_id).order("sort_order"),
    supabase.from("tenants").select("terms_and_conditions").eq("id", profile.tenant_id).single(),
  ]);

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Bank Details & Terms"
        text="Payment profiles and the Terms & Conditions boilerplate shown to customers on quotes and invoices."
      />

      <Panel>
        <SectionTitle
          title="Payment profiles"
          sub="Shown on the public quote page, invoice and quote PDF — matched to the quote's own currency"
        />
        <BankProfilesManager profiles={(profiles ?? []) as BankAccount[]} canManage={canManage} />
      </Panel>

      <div className="mt-6">
        <Panel>
          <SectionTitle title="Terms & Conditions" sub="Fallback shown whenever a quote has no per-quote override" />
          <TermsForm initialValue={tenant?.terms_and_conditions ?? ""} canManage={canManage} />
        </Panel>
      </div>
    </div>
  );
}
