import { Building2, Landmark } from "lucide-react";
import { PageHead } from "@/components/ui/PageHead";
import { Panel } from "@/components/ui/Panel";
import { SearchInput } from "@/components/ui/SearchInput";
import { Pagination } from "@/components/ui/Pagination";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { NewCompanyForm } from "./NewCompanyForm";
import { NewBrandForm } from "./NewBrandForm";
import { NewBankAccountForm } from "./NewBankAccountForm";
import { BrandCredentials } from "./BrandCredentials";

// Companies stay few (legal entities), but brands don't — the "Join as a
// Supplier"/website-lead work means every external brand site gets its own
// row here, so unlike companies, brands need to be searchable and paginated
// rather than rendered as one big unpaginated grid per company.
const PAGE_SIZE = 12;

export default async function BrandsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const params = await searchParams;
  await requireProfile();
  const supabase = await createClient();

  const q = params.q?.trim() || "";
  const page = Math.max(1, Number(params.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let brandsQuery = supabase
    .from("brands")
    .select(
      "id, name, slug, webhook_secret, default_currency, primary_color, is_active, company:companies(id, legal_name), bank_accounts(id, account_name, bank_name, currency, iban, account_number)",
      { count: "exact" },
    );
  if (q) {
    brandsQuery = brandsQuery.or(`name.ilike.%${q}%,slug.ilike.%${q}%`);
  }

  const [{ data: companies }, { data: brands, count }, { data: allBrands }] = await Promise.all([
    supabase.from("companies").select("id, legal_name, trading_name, default_currency").order("legal_name"),
    // Newest-first while brands are still being bulk-added (easiest to spot
    // the one you just created) — switch to .order("name") once onboarding
    // settles down and alphabetical is more useful for finding a brand.
    brandsQuery.order("created_at", { ascending: false }).range(from, to),
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

      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(companies ?? []).map((company) => (
          <div key={company.id} className="flex items-center gap-3 rounded-2xl border bg-white p-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-50 text-primary-600">
              <Building2 size={18} />
            </div>
            <div className="min-w-0">
              <div className="truncate font-bold">{company.legal_name}</div>
              <div className="truncate text-xs text-slate-500">
                {company.trading_name ?? "No trading name"} · {company.default_currency}
              </div>
            </div>
          </div>
        ))}
        {(companies ?? []).length === 0 && (
          <p className="text-sm text-slate-400 sm:col-span-2 lg:col-span-3">No companies yet — create one to start adding brands.</p>
        )}
      </div>

      <Panel>
        <div className="mb-4">
          <SearchInput placeholder="Search brands by name…" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {(brands ?? []).map((brand) => {
            const company = brand.company as unknown as { id: string; legal_name: string } | null;
            return (
              <div key={brand.id} className="rounded-xl border p-3">
                <div className="flex items-center gap-3">
                  <span className="h-4 w-4 shrink-0 rounded-full" style={{ backgroundColor: brand.primary_color }} />
                  <div className="min-w-0">
                    <div className="truncate font-bold">{brand.name}</div>
                    <div className="truncate text-xs text-slate-500">
                      {company?.legal_name ?? "—"} · {brand.default_currency}
                    </div>
                  </div>
                </div>
                {(brand.bank_accounts ?? []).length > 0 && (
                  <div className="mt-3 space-y-2 border-t pt-3">
                    {(brand.bank_accounts ?? []).map((account) => (
                      <div key={account.id} className="flex items-start gap-2 text-xs">
                        <Landmark size={14} className="mt-0.5 shrink-0 text-slate-400" />
                        <div>
                          <div className="font-bold">
                            {account.account_name} · {account.bank_name}
                          </div>
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
            );
          })}
          {(brands ?? []).length === 0 && (
            <p className="py-8 text-center text-sm text-slate-400 sm:col-span-2 lg:col-span-3">
              {q ? `No brands match "${q}".` : "No brands yet — create one to get started."}
            </p>
          )}
        </div>
        <Pagination page={page} pageSize={PAGE_SIZE} total={count ?? 0} />
      </Panel>

      <div className="mt-6 flex flex-wrap gap-4">
        <NewBrandForm companies={(companies ?? []).map((c) => ({ id: c.id, legal_name: c.legal_name }))} />
        <NewBankAccountForm brands={allBrands ?? []} />
      </div>
    </div>
  );
}
