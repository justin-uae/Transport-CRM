import { Globe2 } from "lucide-react";

// A curated slice of the group's ~300 country/city brand sites — picked for
// geographic spread (not the first N in the list) rather than an exhaustive
// dump, which would be unreadable in a marquee. The "+290 more" line below
// keeps the real scale honest without listing every domain.
const ROW_1 = [
  "francebusrental.com",
  "germanybusrentals.com",
  "busrentalspain.com",
  "italybusrental.com",
  "uaebusrental.com",
  "saudiarabiabusrental.com",
  "busrentalsingapore.com",
  "japanbusrental.com",
];

const ROW_2 = [
  "canadabusrentals.com",
  "australiabusrental.com",
  "bushiredubai.com",
  "busrentallondon.com",
  "newyorkbusrent.com",
  "southafricabusrental.com",
  "thailandbusrental.com",
  "busrentalmexico.com",
];

function MarqueeRow({ domains, reverse }: { domains: string[]; reverse?: boolean }) {
  const doubled = [...domains, ...domains];
  return (
    <div className="marquee-row overflow-hidden">
      <div className={`flex w-max gap-3 ${reverse ? "marquee-track-reverse" : "marquee-track"}`}>
        {doubled.map((domain, i) => (
          <span
            key={`${domain}-${i}`}
            className="flex shrink-0 items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-bold text-slate-500 shadow-panel transition hover:border-primary-200 hover:text-primary-600"
          >
            <Globe2 size={14} className="text-primary-400" />
            {domain}
          </span>
        ))}
      </div>
    </div>
  );
}

export function PartnersMarquee() {
  return (
    <section className="border-y border-slate-200 bg-white py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 text-center sm:px-6">
        <span className="text-xs font-black uppercase tracking-widest text-primary-500">Our partners</span>
        <h2 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">One group, hundreds of brand sites</h2>
        <p className="mx-auto mt-2 max-w-xl text-sm text-slate-500">
          Every one of these routes job demand into the same supplier network you&apos;re joining today.
        </p>
      </div>

      <div
        className="relative mx-auto mt-10 max-w-6xl space-y-3"
        style={{ maskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)", WebkitMaskImage: "linear-gradient(to right, transparent, black 8%, black 92%, transparent)" }}
      >
        <MarqueeRow domains={ROW_1} />
        <MarqueeRow domains={ROW_2} reverse />
      </div>

      <p className="mt-8 text-center text-xs font-bold text-slate-400">+290 more brand sites, across six continents</p>
    </section>
  );
}
