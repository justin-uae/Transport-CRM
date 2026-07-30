import dynamic from "next/dynamic";

const BusinessIntelligencePage = dynamic(
  () => import("@/components/pages/BusinessIntelligencePage").then((m) => m.BusinessIntelligencePage),
  { loading: () => <div className="p-6 text-sm text-slate-400">Loading…</div> },
);

export default function Page() {
  return <BusinessIntelligencePage />;
}
