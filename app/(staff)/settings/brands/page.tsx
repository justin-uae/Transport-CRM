import { Building2, Landmark } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewCompanyForm } from "./NewCompanyForm";
import { NewBrandForm } from "./NewBrandForm";
import { NewBankAccountForm } from "./NewBankAccountForm";
import { BrandCredentials } from "./BrandCredentials";

export default async function BrandsPage() {
  await requireProfile();
  const supabase = await createClient();

  const [{ data: companies }, { data: allBrands }] = await Promise.all([
    supabase
      .from("companies")
      .select(
        "id, legal_name, trading_name, default_currency, brands(id, name, slug, webhook_secret, default_currency, primary_color, is_active, bank_accounts(id, account_name, bank_name, currency, iban, account_number))",
      )
      .order("legal_name"),
    supabase.from("brands").select("id, name, default_currency").order("name"),
  ]);

  return (
    <div>
      <PageHead
        eyebrow="Administration"
        title="Companies & Brands"
        text="Legal entities and the trading brands under them — quote, invoice and email identity flow from here."
        action={<NewCompanyForm />}
      />

      <div className="space-y-4">
        {(companies ?? []).map((company) => (
          <Panel key={company.id}>
            <div className="flex items-center gap-4">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                <Building2 size={20} />
              </div>
              <div>
                <b>{company.legal_name}</b>
                <div className="text-sm text-slate-500">
                  {company.trading_name ?? "No trading name"} · {company.default_currency}
                </div>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {(company.brands ?? []).map((brand) => (
                <div key={brand.id} className="rounded-xl border p-3">
                  <div className="flex items-center gap-3">
                    <span
                      className="h-4 w-4 shrink-0 rounded-full"
                      style={{ backgroundColor: brand.primary_color }}
                    />
                    <div className="min-w-0">
                      <div className="truncate font-bold">{brand.name}</div>
                      <div className="text-xs text-slate-500">{brand.default_currency}</div>
                    </div>
                  </div>
                  {(brand.bank_accounts ?? []).length > 0 && (
                    <div className="mt-3 space-y-2 border-t pt-3">
                      {(brand.bank_accounts ?? []).map((account) => (
                        <div key={account.id} className="flex items-start gap-2 text-xs">
                          <Landmark size={14} className="mt-0.5 shrink-0 text-slate-400" />
                          <div>
                            <div className="font-bold">{account.account_name} · {account.bank_name}</div>
                            <div className="text-slate-500">
                              {account.iban ?? account.account_number ?? "—"} · {account.currency}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <BrandCredentials slug={brand.slug} secret={brand.webhook_secret} />
                </div>
              ))}
              {(company.brands ?? []).length === 0 && (
                <p className="text-sm text-slate-400">No brands yet under this company.</p>
              )}
            </div>
          </Panel>
        ))}
        {(companies ?? []).length === 0 && (
          <Panel>
            <p className="py-8 text-center text-sm text-slate-500">
              No companies yet — create one to start adding brands.
            </p>
          </Panel>
        )}
      </div>

      <div className="mt-6 flex flex-wrap gap-4">
        <NewBrandForm companies={(companies ?? []).map((c) => ({ id: c.id, legal_name: c.legal_name }))} />
        <NewBankAccountForm brands={allBrands ?? []} />
      </div>
    </div>
  );
}
