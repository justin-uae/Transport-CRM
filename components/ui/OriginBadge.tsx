/** Distinguishes a supplier who self-applied via /join/apply from one a staff member added directly — shown on the Suppliers list and detail page. */
export function OriginBadge({ appliedPublicly }: { appliedPublicly: boolean }) {
  return (
    <span
      className={`rounded-full px-2.5 py-1 text-xs font-bold ${
        appliedPublicly ? "bg-sky-50 text-sky-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      {appliedPublicly ? "Applied online" : "Added by staff"}
    </span>
  );
}
