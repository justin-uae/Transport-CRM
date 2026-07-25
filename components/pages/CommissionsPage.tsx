import { CircleGauge, Clock3, FileCheck2, CheckCircle2 } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { commissionLifecycle } from "@/components/demo/demoData";

export function CommissionsPage() {
  return (
    <div>
      <PageHead
        eyebrow="Completed-Job Commission"
        title="Commission management"
        text="Commission becomes payable only after the journey is completed and final costs are approved."
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi title="Estimated" value="AED 46,800" delta="Future jobs" icon={CircleGauge} />
        <Kpi title="Awaiting completion" value="AED 31,200" delta="22 bookings" icon={Clock3} />
        <Kpi title="Ready to approve" value="AED 18,460" delta="14 completed jobs" icon={FileCheck2} />
        <Kpi title="Paid this month" value="AED 62,900" delta="Payroll closed" icon={CheckCircle2} />
      </div>
      <Panel className="mt-6">
        <SectionTitle title="Commission lifecycle" sub="Final margin calculation and approval" />
        <div className="mt-5 grid gap-3 md:grid-cols-5">
          {commissionLifecycle.map((x, i) => (
            <div key={x} className="rounded-2xl border p-4 text-center">
              <div
                className={
                  "mx-auto mb-3 grid h-10 w-10 place-items-center rounded-full " +
                  (i < 3 ? "bg-primary-500 text-white" : "bg-slate-100 text-slate-400")
                }
              >
                {i + 1}
              </div>
              <b className="text-sm">{x}</b>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}
