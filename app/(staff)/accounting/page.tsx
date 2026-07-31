import dynamic from "next/dynamic";
import { SkeletonDashboardBody } from "@/components/ui/Skeleton";

const AccountingPage = dynamic(() => import("@/components/pages/AccountingPage").then((m) => m.AccountingPage), {
  loading: () => <SkeletonDashboardBody />,
});

export default function Page() {
  return <AccountingPage />;
}
