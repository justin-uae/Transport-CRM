import Link from "next/link";
import {
  Bus,
  Route,
  Wallet,
  ShieldCheck,
  Network,
  FileCheck2,
  Car,
  Users2,
  ArrowRight,
  MapPin,
  Star,
} from "lucide-react";
import { HeroImage } from "./HeroImage";
import { NavTabs } from "./NavTabs";
import { PartnersMarquee } from "./PartnersMarquee";
import { getHeroJobPreview } from "@/lib/heroLocale";

const FEATURES = [
  {
    icon: Route,
    title: "Jobs matched to your region",
    text: "Offers go out based on where you actually operate and what you drive — not a generic broadcast list.",
  },
  {
    icon: Network,
    title: "One network, multiple brands",
    text: "You're onboarded once, but see job demand from every brand across the group — more opportunities from a single account.",
  },
  {
    icon: Car,
    title: "Manage your fleet online",
    text: "Add your vehicles, seat capacity and plate numbers from your own dashboard — keep it up to date whenever it changes.",
  },
  {
    icon: FileCheck2,
    title: "Documents on file, once",
    text: "Upload your licence, insurance and registration a single time so they're ready whenever we need to verify them.",
  },
  {
    icon: Wallet,
    title: "Straightforward invoicing",
    text: "Submit your invoice as soon as a job is done and track its payment status yourself, without chasing anyone.",
  },
  {
    icon: ShieldCheck,
    title: "A clear, honest process",
    text: "No hidden fees to join. Apply, get reviewed, and know exactly where your application stands at every step.",
  },
];

const STEPS = [
  {
    title: "Apply online",
    text: "Tell us about your business or your vehicle — takes a couple of minutes, no account needed.",
  },
  {
    title: "We review your application",
    text: "Our operations team checks your details against the regions and fleet types we need.",
  },
  {
    title: "Set up your account",
    text: "Approved? You'll get an email to set your password and finish your profile — add vehicles and documents.",
  },
  {
    title: "Start receiving job offers",
    text: "From then on, matching jobs land straight in your dashboard for you to accept or decline.",
  },
];

const FLEET_TYPES = ["Coaches", "Minibuses", "Executive cars", "Individual drivers"];

export default async function SupplierLandingPage() {
  const jobPreview = await getHeroJobPreview();

  return (
    <div className="min-h-screen overflow-x-hidden bg-appbg">
      <header className="sticky top-0 z-20 border-b border-slate-200/70 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-panel">
              <Bus size={20} />
            </div>
            <div>
              <div className="font-black leading-tight text-slate-900">Supplier Network</div>
              <div className="text-[10px] font-bold uppercase leading-tight tracking-[.16em] text-primary-500">
                Worldwide Group Transport
              </div>
            </div>
          </div>
          <NavTabs />
          <div className="flex items-center gap-2">
            <Link href="/login" className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100">
              Log in
            </Link>
            <Link
              href="/join/apply"
              className="hidden rounded-xl bg-primary-500 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-primary-600 sm:inline-block"
            >
              Apply now
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          className="pointer-events-none absolute -left-32 -top-40 -z-10 h-[36rem] w-[36rem] rounded-full opacity-60 blur-3xl"
          style={{ background: "radial-gradient(closest-side, #ffedd5, transparent)" }}
        />
        <div
          className="pointer-events-none absolute -right-40 top-20 -z-10 h-[30rem] w-[30rem] rounded-full opacity-50 blur-3xl"
          style={{ background: "radial-gradient(closest-side, #fed7aa, transparent)" }}
        />

        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-2 lg:gap-10">
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1 text-xs font-bold uppercase tracking-wide text-primary-600">
              <span className="h-1.5 w-1.5 rounded-full bg-primary-500" />
              Now accepting new suppliers
            </span>
            <h1 className="mt-5 text-4xl font-black leading-[1.1] text-slate-900 sm:text-5xl lg:text-[3.25rem]">
              More jobs for your fleet. One simple network.
            </h1>
            <p className="mt-5 max-w-lg text-base leading-relaxed text-slate-500 sm:text-lg">
              Join the Worldwide Group Transport supplier network and start receiving transport job offers from a
              group of coach hire and ground transport brands — all through one account.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/join/apply"
                className="flex items-center justify-center gap-2 rounded-xl bg-primary-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary-500/25 transition hover:-translate-y-0.5 hover:bg-primary-600 hover:shadow-xl hover:shadow-primary-500/30"
              >
                Apply as a supplier
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/login"
                className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-6 py-3.5 text-sm font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50"
              >
                Already approved? Log in
              </Link>
            </div>
            <div className="mt-9 flex flex-wrap items-center gap-2">
              {FLEET_TYPES.map((type) => (
                <span
                  key={type}
                  className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-600"
                >
                  <Users2 size={13} className="text-primary-500" />
                  {type}
                </span>
              ))}
            </div>
          </div>

          {/* Visual side — gradient frame that works with or without a real
              photo dropped into public/images/supplier-hero.jpg, plus a
              floating "job offer" preview card for a bit of product feel. */}
          <div className="relative mx-auto w-full max-w-md lg:max-w-none">
            <div className="relative aspect-[4/5] w-full overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-800 to-primary-700 shadow-2xl">
              <div className="absolute inset-0">
                <HeroImage />
              </div>
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/70 via-slate-900/10 to-transparent" />
              <div className="absolute inset-0 grid place-items-center">
                <Bus size={72} className="text-white/15" strokeWidth={1.25} />
              </div>
            </div>

            <div className="absolute -left-4 bottom-8 w-64 rounded-2xl bg-white p-4 shadow-2xl sm:-left-8 sm:w-72">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-emerald-600">
                  New job offer
                </span>
                <span className="flex items-center gap-0.5 text-xs font-bold text-amber-500">
                  <Star size={12} className="fill-amber-400 text-amber-400" /> 4.9
                </span>
              </div>
              <div className="mt-2.5 flex items-center gap-2 text-sm font-black text-slate-900">
                <MapPin size={14} className="shrink-0 text-primary-500" />
                {jobPreview.from} → {jobPreview.to}
              </div>
              <div className="mt-1 text-xs font-semibold text-slate-400">Coach · 45 seats · Tomorrow, 09:00</div>
              <div className="mt-2.5 flex items-center justify-between rounded-lg bg-emerald-50 px-2.5 py-1.5">
                <span className="flex items-center gap-1 text-[10px] font-black uppercase tracking-wide text-emerald-600">
                  <Wallet size={11} />
                  Est. earnings
                </span>
                <span className="text-sm font-black text-emerald-700">
                  {jobPreview.currency} {jobPreview.price.toLocaleString()}
                </span>
              </div>
              <div className="mt-3 flex gap-2">
                <span className="flex-1 rounded-lg bg-primary-500 py-1.5 text-center text-xs font-bold text-white">Accept</span>
                <span className="flex-1 rounded-lg bg-slate-100 py-1.5 text-center text-xs font-bold text-slate-500">Decline</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why join */}
      <section id="why-join" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16 sm:px-6 sm:py-20">
        <div className="mx-auto max-w-xl text-center">
          <span className="text-xs font-black uppercase tracking-widest text-primary-500">Why join</span>
          <h2 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">Why suppliers work with us</h2>
          <p className="mt-2 text-sm text-slate-500">
            Everything you need to take on more jobs and manage them, built into one supplier portal.
          </p>
        </div>
        <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ icon: Icon, title, text }) => (
            <div
              key={title}
              className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-white p-7 text-center shadow-panel transition duration-300 hover:-translate-y-1.5 hover:border-primary-200/80 hover:shadow-2xl hover:shadow-primary-500/10"
            >
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-primary-50/0 via-primary-50/0 to-primary-50/0 opacity-0 transition duration-300 group-hover:from-primary-50/80 group-hover:via-primary-50/20 group-hover:to-transparent group-hover:opacity-100" />
              <div className="relative">
                <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary-400 to-primary-600 text-white shadow-lg shadow-primary-500/25 transition duration-300 group-hover:scale-110 group-hover:shadow-primary-500/40">
                  <Icon size={22} />
                </div>
                <h3 className="mt-5 font-black text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{text}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="scroll-mt-24 bg-white py-16 sm:py-20">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <div className="mx-auto max-w-xl text-center">
            <span className="text-xs font-black uppercase tracking-widest text-primary-500">The process</span>
            <h2 className="mt-2 text-2xl font-black text-slate-900 sm:text-3xl">How it works</h2>
            <p className="mt-2 text-sm text-slate-500">From application to your first job offer, in four steps.</p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(({ title, text }, i) => (
              <div
                key={title}
                className="group relative overflow-hidden rounded-3xl border border-slate-200/80 bg-appbg p-7 text-center transition duration-300 hover:-translate-y-1.5 hover:border-primary-200/80 hover:bg-white hover:shadow-2xl hover:shadow-primary-500/10"
              >
                <div
                  className="pointer-events-none absolute inset-0 opacity-40 transition duration-300 group-hover:opacity-70"
                  style={{
                    backgroundImage: "radial-gradient(#94a3b8 1.5px, transparent 1.5px)",
                    backgroundSize: "11px 11px",
                    maskImage: "radial-gradient(circle 85px at 100% 0%, black 0%, transparent 100%)",
                    WebkitMaskImage: "radial-gradient(circle 85px at 100% 0%, black 0%, transparent 100%)",
                  }}
                />
                <div className="relative">
                  <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-primary-400 to-primary-600 text-base font-black text-white shadow-lg shadow-primary-500/25 transition duration-300 group-hover:scale-110">
                    {i + 1}
                  </div>
                  <h3 className="mt-4 font-black text-slate-900">{title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{text}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <PartnersMarquee />

      {/* Final CTA */}
      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-20">
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 px-6 py-14 text-center sm:px-14">
          <div
            className="pointer-events-none absolute inset-0 opacity-40"
            style={{ background: "radial-gradient(600px 300px at 50% 0%, rgba(249,115,22,0.35), transparent)" }}
          />
          <div className="relative">
            <h2 className="text-2xl font-black text-white sm:text-3xl">Ready to grow your business with us?</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-slate-300">
              Applying takes a couple of minutes. Our team will review your details and email you once you&apos;re
              approved.
            </p>
            <Link
              href="/join/apply"
              className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary-500 px-6 py-3.5 text-sm font-bold text-white shadow-lg shadow-primary-500/30 transition hover:-translate-y-0.5 hover:bg-primary-600"
            >
              Apply as a supplier
              <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-slate-200 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center gap-2 px-4 text-center sm:px-6">
          <p className="text-xs font-bold text-slate-500">In Association with Global Bus Rental Worldwide Group Transport</p>
          <p className="text-xs text-slate-400">
            Already have an approved account?{" "}
            <Link href="/login" className="font-bold text-primary-600">
              Log in here
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
