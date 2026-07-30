import dynamic from "next/dynamic";

const AccountingPage = dynamic(() => import("@/components/pages/AccountingPage").then((m) => m.AccountingPage), {
  loading: () => <div className="p-6 text-sm text-slate-400">Loading…</div>,
});

export default function Page() {
  return <AccountingPage />;
}
