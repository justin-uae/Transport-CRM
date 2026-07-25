import { requireProfile } from "@/lib/auth";
import { ControlCentre } from "@/components/pages/ControlCentre";

export default async function DashboardPage() {
  const profile = await requireProfile();
  const firstName = profile.full_name.split(" ")[0] ?? profile.full_name;
  return <ControlCentre firstName={firstName} />;
}
