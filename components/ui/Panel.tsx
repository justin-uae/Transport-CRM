import clsx from "clsx";

export function Panel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={clsx(
        "rounded-3xl border border-slate-200 bg-white p-5 shadow-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}
