export interface JourneyLeg {
  sequence: number;
  journey_type: string;
  pickup_address: string;
  destination_address: string;
  via_points: string[];
  pickup_date: string | null;
  pickup_time: string | null;
  return_date: string | null;
  return_time: string | null;
  passenger_count: number | null;
  luggage_count: number | null;
  wheelchair_required: boolean;
  child_seats: number;
  special_requirements: string | null;
  vehicle_types: { name: string } | null;
}

/** Full detail block for one enquiry leg — used on both the quote and job detail pages so a multi-leg or return journey shows every field instead of just the first leg's pickup/destination/date. */
export function JourneyLegDetail({ leg, index, total }: { leg: JourneyLeg; index: number; total: number }) {
  return (
    <div className={index > 0 ? "mt-4 border-t pt-4" : ""}>
      {total > 1 && (
        <div className="mb-2 text-xs font-black uppercase tracking-wide text-primary-500">
          Leg {leg.sequence} of {total} · {leg.journey_type.replaceAll("_", " ")}
        </div>
      )}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-2xl bg-slate-50 p-4 text-sm">
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Pickup</dt>
          <dd className="mt-0.5 font-semibold">{leg.pickup_address}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Destination</dt>
          <dd className="mt-0.5 font-semibold">{leg.destination_address}</dd>
        </div>
        {leg.via_points.length > 0 && (
          <div className="col-span-2">
            <dt className="text-xs font-bold uppercase text-slate-400">Via</dt>
            <dd className="mt-0.5 font-semibold">{leg.via_points.join(" → ")}</dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Date</dt>
          <dd className="mt-0.5 font-semibold">
            {leg.pickup_date ?? "—"} {leg.pickup_time ?? ""}
          </dd>
        </div>
        {leg.journey_type === "return" && (leg.return_date || leg.return_time) && (
          <div>
            <dt className="text-xs font-bold uppercase text-slate-400">Return</dt>
            <dd className="mt-0.5 font-semibold">
              {leg.return_date ?? "—"} {leg.return_time ?? ""}
            </dd>
          </div>
        )}
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Passengers</dt>
          <dd className="mt-0.5 font-semibold">{leg.passenger_count ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Luggage</dt>
          <dd className="mt-0.5 font-semibold">{leg.luggage_count ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Vehicle type</dt>
          <dd className="mt-0.5 font-semibold">{leg.vehicle_types?.name ?? "—"}</dd>
        </div>
        <div>
          <dt className="text-xs font-bold uppercase text-slate-400">Wheelchair / child seats</dt>
          <dd className="mt-0.5 font-semibold">
            {leg.wheelchair_required ? "Wheelchair required" : "No wheelchair"}
            {leg.child_seats > 0 ? ` · ${leg.child_seats} child seat${leg.child_seats === 1 ? "" : "s"}` : ""}
          </dd>
        </div>
        {leg.special_requirements && (
          <div className="col-span-2">
            <dt className="text-xs font-bold uppercase text-slate-400">Special requirements</dt>
            <dd className="mt-0.5 font-semibold">{leg.special_requirements}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
