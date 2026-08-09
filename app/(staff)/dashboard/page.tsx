import dynamic from "next/dynamic";
import { requireProfile } from "@/lib/auth";
import { getLeadsByCountry } from "@/lib/liveOperations";
import { getControlCentreSummary } from "@/lib/controlCentreSummary";
import { SkeletonDashboardBody } from "@/components/ui/Skeleton";

// /dashboard is the first page every staff member lands on after login —
// recharts is otherwise already route-split by Next.js, but a dynamic()
// import here still lets the page shell stream in while the chart-heavy
// chunk downloads, instead of blocking on it.
const ControlCentre = dynamic(() => import("@/components/pages/ControlCentre").then((m) => m.ControlCentre), {
  loading: () => <SkeletonDashboardBody />,
});

export default async function DashboardPage() {
  const profile = await requireProfile();
  const firstName = profile.full_name.split(" ")[0] ?? profile.full_name;
  const [leadClusters, summary] = await Promise.all([
    getLeadsByCountry(profile.tenant_id),
    getControlCentreSummary(profile.tenant_id),
  ]);
  return <ControlCentre firstName={firstName} leadClusters={leadClusters} summary={summary} />;
}
