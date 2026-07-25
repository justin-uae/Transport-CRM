import { Building2 } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewCompanyForm } from "./NewCompanyForm";
import { NewBrandForm } from "./NewBrandForm";

export default async function BrandsPage() {
  await requireProfile();
  const supabase = await createClient();

  const { data: companies } = await supabase
    .from("companies")
    .select("id, legal_name, trading_name, default_currency, brands(id, name, slug, default_currency, primary_color, is_active)")
    .order("legal_name");

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
                <div key={brand.id} className="flex items-center gap-3 rounded-xl border p-3">
                  <span
                    className="h-4 w-4 shrink-0 rounded-full"
                    style={{ backgroundColor: brand.primary_color }}
                  />
                  <div className="min-w-0">
                    <div className="truncate font-bold">{brand.name}</div>
                    <div className="text-xs text-slate-500">{brand.default_currency}</div>
                  </div>
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

      <div className="mt-6">
        <NewBrandForm companies={(companies ?? []).map((c) => ({ id: c.id, legal_name: c.legal_name }))} />
      </div>
    </div>
  );
}
