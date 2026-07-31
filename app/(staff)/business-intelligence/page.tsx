import dynamic from "next/dynamic";
import { SkeletonDashboardBody } from "@/components/ui/Skeleton";

const BusinessIntelligencePage = dynamic(
  () => import("@/components/pages/BusinessIntelligencePage").then((m) => m.BusinessIntelligencePage),
  { loading: () => <SkeletonDashboardBody /> },
);

export default function Page() {
  return <BusinessIntelligencePage />;
}
