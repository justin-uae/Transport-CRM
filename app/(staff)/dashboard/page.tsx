import dynamic from "next/dynamic";
import { requireProfile } from "@/lib/auth";

// /dashboard is the first page every staff member lands on after login —
// recharts is otherwise already route-split by Next.js, but a dynamic()
// import here still lets the page shell stream in while the chart-heavy
// chunk downloads, instead of blocking on it.
const ControlCentre = dynamic(() => import("@/components/pages/ControlCentre").then((m) => m.ControlCentre), {
  loading: () => <div className="p-6 text-sm text-slate-400">Loading dashboard…</div>,
});

export default async function DashboardPage() {
  const profile = await requireProfile();
  const firstName = profile.full_name.split(" ")[0] ?? profile.full_name;
  return <ControlCentre firstName={firstName} />;
}
