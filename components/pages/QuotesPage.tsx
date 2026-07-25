"use client";

import { useState } from "react";
import { Search, Send, CheckCircle2, Timer, ChevronRight, Check, FileText } from "lucide-react";
import { Panel } from "@/components/ui/Panel";
import { Kpi } from "@/components/ui/Kpi";
import { PageHead } from "@/components/ui/PageHead";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { useToast } from "@/components/ui/Toast";
import { demoQuotes, demoVehicles, demoCustomers, money } from "@/components/demo/demoData";

const STEPS = ["Customer", "Journey", "Vehicle", "Pricing", "Review"];

function ReviewRow({ a, b, strong }: { a: string; b: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-4 border-b py-3 last:border-0">
      <span className="text-slate-500">{a}</span>
      <span className={(strong ? "text-lg font-black text-primary-600" : "font-bold") + " text-right"}>{b}</span>
    </div>
  );
}

export function QuotesPage() {
  const notify = useToast();
  const [mode, setMode] = useState<"list" | "new">("list");
  const [step, setStep] = useState(1);
  const [customer, setCustomer] = useState(demoCustomers[0]!);
  const [journey, setJourney] = useState({
    type: "One Way",
    pickup: "Heathrow Airport, London",
    dropoff: "Hilton Hotel, Manchester",
    date: "2026-08-12",
    time: "09:00",
    passengers: 28,
    luggage: 15,
  });
  const [vehicle, setVehicle] = useState(demoVehicles[1]![0]);
  const [price, setPrice] = useState(demoVehicles[1]![2]);
  const [status, setStatus] = useState("Draft");

  function startNew() {
    setMode("new");
    setStep(1);
  }

  if (mode === "list") {
    return (
      <div>
        <PageHead
          eyebrow="Sales Workspace"
          title="Quotes"
          text="Create, price, send and monitor every customer quotation."
          action={
            <button
              onClick={startNew}
              className="flex items-center gap-2 self-start rounded-xl bg-primary-500 px-4 py-3 text-sm font-bold text-white"
            >
              <FileText size={17} />
              Add New Quote
            </button>
          }
        />
        <div className="grid gap-4 md:grid-cols-4">
          <Kpi title="Open Quotes" value="38" delta="AED 486k pipeline" icon={FileText} />
          <Kpi title="Sent Today" value="17" delta="+21% vs yesterday" icon={Send} />
          <Kpi title="Accepted" value="11" delta="64.7% conversion" icon={CheckCircle2} />
          <Kpi title="Awaiting Follow-up" value="9" delta="3 high priority" icon={Timer} warn />
        </div>
        <Panel className="mt-6">
          <div className="flex flex-col gap-3 border-b pb-4 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={17} />
              <input placeholder="Search quotes" className="w-full rounded-xl border bg-slate-50 py-2.5 pl-10 pr-3 outline-none" />
            </div>
            <button onClick={startNew} className="rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white">
              Add Quote
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b text-slate-500">
                  <th className="px-3 py-4">Quote</th>
                  <th className="px-3 py-4">Customer</th>
                  <th className="px-3 py-4">Journey</th>
                  <th className="px-3 py-4">Value</th>
                  <th className="px-3 py-4">Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {demoQuotes.map((q) => (
                  <tr key={q[0]} className="border-b last:border-0">
                    <td className="px-3 py-4 font-black text-primary-600">{q[0]}</td>
                    <td className="px-3 py-4 font-semibold">{q[1]}</td>
                    <td className="px-3 py-4 text-slate-600">{q[2]}</td>
                    <td className="px-3 py-4 font-black">{q[3]}</td>
                    <td className="px-3 py-4">
                      <span
                        className={
                          "rounded-full px-2.5 py-1 text-xs font-bold " +
                          (q[4] === "Accepted"
                            ? "bg-emerald-50 text-emerald-700"
                            : q[4] === "Sent"
                              ? "bg-blue-50 text-blue-700"
                              : q[4] === "Expired"
                                ? "bg-red-50 text-red-700"
                                : "bg-slate-100 text-slate-700")
                        }
                      >
                        {q[4]}
                      </span>
                    </td>
                    <td className="px-3 py-4">
                      <button className="rounded-lg p-2 hover:bg-slate-100">
                        <ChevronRight size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-5 flex flex-col justify-between gap-3 md:flex-row md:items-center">
        <div>
          <button onClick={() => setMode("list")} className="mb-2 text-sm font-bold text-primary-600">
            ← Back to quotes
          </button>
          <h1 className="text-3xl font-black">Add New Quote</h1>
          <p className="mt-1 text-slate-500">Create an accurate, conversion-focused quotation.</p>
        </div>
        <button onClick={() => setMode("list")} className="self-start rounded-xl border px-4 py-2.5 text-sm font-bold">
          Save Draft
        </button>
      </div>
      <Panel>
        <div className="grid grid-cols-5 gap-2">
          {STEPS.map((s, i) => (
            <button
              key={s}
              onClick={() => setStep(i + 1)}
              className={
                "rounded-xl px-2 py-3 text-xs font-bold md:text-sm " +
                (step === i + 1
                  ? "bg-primary-500 text-white"
                  : step > i + 1
                    ? "bg-primary-50 text-primary-700"
                    : "bg-slate-100 text-slate-500")
              }
            >
              {i + 1}. {s}
            </button>
          ))}
        </div>
      </Panel>
      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_330px]">
        <Panel>
          {step === 1 && (
            <div>
              <SectionTitle title="Select Customer" sub="Choose an existing customer or create a new one" />
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div>
                  <label className="text-sm font-bold">Search customer</label>
                  <input
                    className="mt-2 w-full rounded-xl border px-3 py-3 outline-none focus:ring-4 focus:ring-orange-100"
                    placeholder="Name, company, email or phone"
                  />
                  <div className="mt-4 space-y-2">
                    {demoCustomers.map((x) => (
                      <button
                        onClick={() => setCustomer(x)}
                        key={x}
                        className={
                          "w-full rounded-xl border p-3 text-left " +
                          (customer === x ? "border-primary-400 bg-primary-50" : "hover:bg-slate-50")
                        }
                      >
                        <div className="font-bold">{x}</div>
                        <div className="text-xs text-slate-500">info@{x.toLowerCase().replaceAll(" ", "")}.com</div>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="rounded-2xl bg-slate-50 p-5">
                  <div className="flex items-center gap-3">
                    <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-800 font-bold text-white">
                      {customer.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <b>{customer}</b>
                      <div className="text-sm text-slate-500">Corporate customer</div>
                    </div>
                  </div>
                  <dl className="mt-5 grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <dt className="text-slate-500">Account Manager</dt>
                      <dd className="font-bold">You</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Credit Limit</dt>
                      <dd className="font-bold">AED 250,000</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Outstanding</dt>
                      <dd className="font-bold">AED 12,450</dd>
                    </div>
                    <div>
                      <dt className="text-slate-500">Customer Score</dt>
                      <dd className="font-bold text-emerald-600">VIP · 92/100</dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          )}
          {step === 2 && (
            <div>
              <SectionTitle title="Journey Details" sub="Enter the route, schedule and passenger requirements" />
              <div className="mt-5 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-bold">
                  Journey type
                  <select
                    value={journey.type}
                    onChange={(e) => setJourney({ ...journey, type: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  >
                    <option>One Way</option>
                    <option>Return</option>
                    <option>Multi Trip</option>
                  </select>
                </label>
                <label className="text-sm font-bold">
                  Pickup date
                  <div className="mt-2 rounded-xl border px-3 py-3">
                    <input
                      type="date"
                      value={journey.date}
                      onChange={(e) => setJourney({ ...journey, date: e.target.value })}
                      className="w-full outline-none"
                    />
                  </div>
                </label>
                <label className="text-sm font-bold">
                  Pickup location
                  <input
                    value={journey.pickup}
                    onChange={(e) => setJourney({ ...journey, pickup: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Drop-off location
                  <input
                    value={journey.dropoff}
                    onChange={(e) => setJourney({ ...journey, dropoff: e.target.value })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Passengers
                  <input
                    type="number"
                    value={journey.passengers}
                    onChange={(e) => setJourney({ ...journey, passengers: Number(e.target.value) })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  />
                </label>
                <label className="text-sm font-bold">
                  Luggage
                  <input
                    type="number"
                    value={journey.luggage}
                    onChange={(e) => setJourney({ ...journey, luggage: Number(e.target.value) })}
                    className="mt-2 w-full rounded-xl border px-3 py-3 font-normal"
                  />
                </label>
              </div>
            </div>
          )}
          {step === 3 && (
            <div>
              <SectionTitle title="Select Vehicle" sub="Choose the best capacity and specification" />
              <div className="mt-5 grid gap-3">
                {demoVehicles.map((v) => (
                  <button
                    key={v[0]}
                    onClick={() => {
                      setVehicle(v[0]);
                      setPrice(v[2]);
                    }}
                    className={
                      "flex items-center justify-between rounded-2xl border p-4 text-left " +
                      (vehicle === v[0] ? "border-primary-400 bg-primary-50" : "hover:bg-slate-50")
                    }
                  >
                    <div className="flex items-center gap-4">
                      <div className="grid h-14 w-20 place-items-center rounded-xl bg-slate-900 text-white">
                        <FileText />
                      </div>
                      <div>
                        <div className="font-black">{v[0]}</div>
                        <div className="text-sm text-slate-500">{v[1]} · AC · Executive</div>
                      </div>
                    </div>
                    <div className="font-black">{money.format(v[2] * 4.6)}</div>
                  </button>
                ))}
              </div>
            </div>
          )}
          {step === 4 && (
            <div>
              <SectionTitle title="AI Pricing Recommendation" sub="Price guidance based on historic bookings, route demand and supplier costs" />
              <div className="mt-5 grid gap-5 md:grid-cols-3">
                <div className="rounded-2xl bg-emerald-50 p-5">
                  <div className="text-sm text-emerald-700">Suggested Selling Price</div>
                  <div className="mt-2 text-3xl font-black text-emerald-700">{money.format(price * 4.6)}</div>
                </div>
                <div className="rounded-2xl bg-primary-50 p-5">
                  <div className="text-sm text-primary-700">Estimated Margin</div>
                  <div className="mt-2 text-3xl font-black text-primary-700">32.4%</div>
                </div>
                <div className="rounded-2xl bg-slate-100 p-5">
                  <div className="text-sm text-slate-600">Estimated Profit</div>
                  <div className="mt-2 text-3xl font-black">{money.format(price * 1.49)}</div>
                </div>
              </div>
              <div className="mt-5 rounded-2xl border p-5">
                <div className="grid gap-3 text-sm">
                  <div className="flex justify-between">
                    <span>Supplier cost</span>
                    <b>{money.format(price * 3.1)}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Market average</span>
                    <b>{money.format(price * 4.5)}</b>
                  </div>
                  <div className="flex justify-between">
                    <span>Win probability</span>
                    <b className="text-emerald-600">67%</b>
                  </div>
                  <div className="flex justify-between">
                    <span>AI confidence</span>
                    <b>92%</b>
                  </div>
                </div>
                <label className="mt-5 block text-sm font-bold">
                  Override selling price
                  <input
                    type="number"
                    value={Math.round(price * 4.6)}
                    onChange={(e) => setPrice(Number(e.target.value) / 4.6)}
                    className="mt-2 w-full rounded-xl border px-3 py-3"
                  />
                </label>
              </div>
            </div>
          )}
          {step === 5 && (
            <div>
              <SectionTitle title="Review & Send" sub="Confirm details, add terms and send the professional quote" />
              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <div className="rounded-2xl bg-slate-50 p-5 text-sm">
                  <ReviewRow a="Customer" b={customer} />
                  <ReviewRow a="Journey" b={`${journey.pickup} → ${journey.dropoff}`} />
                  <ReviewRow a="Date" b={`${journey.date} at ${journey.time}`} />
                  <ReviewRow a="Vehicle" b={vehicle} />
                  <ReviewRow a="Passengers" b={journey.passengers} />
                  <ReviewRow a="Total" b={money.format(price * 4.6)} strong />
                </div>
                <div>
                  <label className="text-sm font-bold">
                    Send via
                    <select className="mt-2 w-full rounded-xl border px-3 py-3 font-normal">
                      <option>Email</option>
                      <option>WhatsApp</option>
                      <option>Download PDF</option>
                    </select>
                  </label>
                  <label className="mt-4 block text-sm font-bold">
                    Notes to customer
                    <textarea
                      className="mt-2 min-h-28 w-full rounded-xl border p-3 font-normal"
                      defaultValue="Thank you for considering our services. We look forward to welcoming your group."
                    />
                  </label>
                  <button
                    onClick={() => {
                      setStatus("Sent");
                      notify("Quote QT-40622 sent successfully");
                      setMode("list");
                    }}
                    className="mt-4 w-full rounded-xl bg-primary-500 px-5 py-3 font-black text-white"
                  >
                    Send Quote
                  </button>
                </div>
              </div>
            </div>
          )}
          <div className="mt-6 flex justify-between border-t pt-5">
            <button
              disabled={step === 1}
              onClick={() => setStep(Math.max(1, step - 1))}
              className="rounded-xl border px-4 py-2.5 text-sm font-bold disabled:opacity-40"
            >
              Previous
            </button>
            {step < 5 && (
              <button onClick={() => setStep(step + 1)} className="rounded-xl bg-primary-500 px-5 py-2.5 text-sm font-bold text-white">
                Next Step →
              </button>
            )}
          </div>
        </Panel>
        <div className="space-y-5">
          <Panel>
            <div className="flex items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-2xl bg-primary-50 text-primary-600">
                <FileText />
              </div>
              <div>
                <h3 className="font-black">AI Pricing Assistant</h3>
                <p className="text-xs text-slate-500">Real-time quote intelligence</p>
              </div>
            </div>
            <div className="mt-5 space-y-3 text-sm">
              {["Historical booking data", "Seasonal demand", "Route popularity", "Vehicle availability", "Market competition"].map(
                (x) => (
                  <div key={x} className="flex items-center gap-2">
                    <Check size={16} className="text-emerald-600" />
                    {x}
                  </div>
                ),
              )}
            </div>
            <div className="mt-5">
              <div className="flex justify-between text-xs font-bold">
                <span>AI confidence</span>
                <span>92%</span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-slate-100">
                <div className="h-2 w-[92%] rounded-full bg-primary-500" />
              </div>
            </div>
          </Panel>
          <Panel>
            <h3 className="font-black">Quote Summary</h3>
            <div className="mt-4 space-y-3 text-sm">
              <ReviewRow a="Status" b={status} />
              <ReviewRow a="Customer" b={customer} />
              <ReviewRow a="Vehicle" b={vehicle} />
              <ReviewRow a="Estimated total" b={money.format(price * 4.6)} strong />
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
