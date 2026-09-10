import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Global Transport CRM",
  description: "Enterprise CRM for coach, minibus and transport operations.",
};

// Without this, mobile browsers render the page at a virtual desktop width
// (~980px) and scale the whole thing down to fit the screen — every sm:/md:
// breakpoint then evaluates against that fake width instead of the real
// device width, so two-column layouts (e.g. JourneyLegDetail's Pickup/
// Destination and Passengers/Date rows) incorrectly render side-by-side and
// cramped even on an actual phone.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen text-slate-800 antialiased">
        {children}
      </body>
    </html>
  );
}
