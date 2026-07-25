import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Global Transport CRM",
  description: "Enterprise CRM for coach, minibus and transport operations.",
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
