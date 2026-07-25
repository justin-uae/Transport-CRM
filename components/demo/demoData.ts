// Sample data for modules whose backend lands in a later phase (Leads,
// Quotes, Accounting, Commissions, Email, AI Optimisation, BI). Ported from
// the original design prototype (legacy-prototype/src/main.jsx) so the
// visual system stays identical while the schema/API for these modules is
// built out. Never treat this as production data (Part 42).

export const revenueData = [
  { name: "Mon", revenue: 92000, profit: 24200 },
  { name: "Tue", revenue: 118000, profit: 30400 },
  { name: "Wed", revenue: 102000, profit: 28600 },
  { name: "Thu", revenue: 146000, profit: 39800 },
  { name: "Fri", revenue: 132000, profit: 36100 },
  { name: "Sat", revenue: 168000, profit: 46800 },
  { name: "Sun", revenue: 154000, profit: 42500 },
];

export const channelData = [
  { name: "Website", value: 42 },
  { name: "WhatsApp", value: 24 },
  { name: "Telephone", value: 16 },
  { name: "Email", value: 11 },
  { name: "Live Chat", value: 7 },
];

export const CHANNEL_COLORS = ["#f97316", "#fb923c", "#fdba74", "#172033", "#94a3b8"];

export const teamPerformance = [
  { name: "Amir Khan", territory: "United Kingdom", leads: 18, conversion: "34%", revenue: "AED 284k", status: "Working" },
  { name: "Sofia Martin", territory: "France & Benelux", leads: 12, conversion: "31%", revenue: "AED 226k", status: "Working" },
  { name: "Omar Ali", territory: "UAE", leads: 15, conversion: "38%", revenue: "AED 312k", status: "Break" },
  { name: "Daniel Weber", territory: "DACH", leads: 9, conversion: "29%", revenue: "AED 198k", status: "Working" },
];

export interface DemoLead {
  id: string;
  customer: string;
  route: string;
  country: string;
  source: string;
  value: string;
  age: string;
  priority: "High" | "Normal";
  assigned: string | null;
}

export const seedLeads: DemoLead[] = [
  { id: "LD-10842", customer: "Horizon Events", route: "London → Oxford", country: "United Kingdom", source: "Website", value: "AED 18,400", age: "4 min", priority: "High", assigned: "Amir Khan" },
  { id: "LD-10841", customer: "Maison Travel", route: "Paris → Versailles", country: "France", source: "WhatsApp", value: "AED 9,800", age: "7 min", priority: "Normal", assigned: "Sofia Martin" },
  { id: "LD-10840", customer: "Al Noor School", route: "Dubai → Abu Dhabi", country: "UAE", source: "Telephone", value: "AED 24,500", age: "11 min", priority: "High", assigned: "Omar Ali" },
  { id: "LD-10839", customer: "Open enquiry", route: "Milan → Lake Como", country: "Italy", source: "Email", value: "AED 12,200", age: "15 min", priority: "Normal", assigned: null },
  { id: "LD-10838", customer: "Open enquiry", route: "Madrid → Toledo", country: "Spain", source: "Live Chat", value: "AED 7,900", age: "18 min", priority: "Normal", assigned: null },
];

export const demoQuotes: [string, string, string, string, string][] = [
  ["QT-40621", "ABC Travel Group", "London → Manchester", "AED 7,590", "Draft"],
  ["QT-40620", "Horizon Events", "London → Oxford", "AED 18,400", "Sent"],
  ["QT-40619", "Al Noor School", "Dubai → Abu Dhabi", "AED 24,500", "Accepted"],
  ["QT-40618", "Maison Travel", "Paris → Versailles", "AED 9,800", "Expired"],
];

export const demoVehicles: [string, string, number][] = [
  ["Mercedes Sprinter", "16 Seater Minibus", 850],
  ["Mercedes Touring", "35 Seater Coach", 1250],
  ["Volvo Coach", "53 Seater Coach", 1650],
  ["Scania Executive", "49 Seater Coach", 1450],
];

export const demoCustomers = [
  "ABC Travel Group",
  "London Business Events",
  "Blue Sky Holidays",
  "Manchester United Supporters Club",
];

export const bankTransferQueue: [string, string, string][] = [
  ["INV-4382", "Horizon Events", "AED 18,400"],
  ["INV-4379", "Al Noor School", "AED 24,500"],
  ["INV-4371", "Maison Travel", "AED 9,800"],
];

export const receivablesAgeing = [
  { n: "Current", v: 186000 },
  { n: "1–30", v: 62000 },
  { n: "31–60", v: 26000 },
  { n: "61+", v: 12000 },
];

export const commissionLifecycle = [
  "Job completed",
  "Supplier costs final",
  "Margin calculated",
  "Manager approved",
  "Payroll paid",
];

export const inboxMessages: [string, string, string][] = [
  ["Horizon Events", "Re: London group transport quote", "2 min"],
  ["Al Noor School", "Payment remittance attached", "14 min"],
  ["Maison Travel", "Paris booking amendments", "31 min"],
  ["Premier Tours", "New enquiry for 55 passengers", "1 hr"],
];

export const optimisationCards: [string, string, string, "High" | "Medium"][] = [
  ["Revenue opportunity", "Increase Paris airport transfer prices by 4%.", "AED 42,000 annual impact", "High"],
  ["Lead rescue", "Reassign three high-value leads with no activity.", "AED 31,500 pipeline", "High"],
  ["Supplier saving", "Shift 18% of London work to two better-value compliant suppliers.", "AED 67,800 annual saving", "Medium"],
  ["Customer retention", "Contact 14 high-value dormant corporate customers.", "AED 186,000 potential revenue", "Medium"],
];

export const revenueForecast = [
  { m: "Jan", a: 1.1, f: 1.05 },
  { m: "Feb", a: 1.24, f: 1.2 },
  { m: "Mar", a: 1.38, f: 1.32 },
  { m: "Apr", a: 1.52, f: 1.48 },
  { m: "May", a: 1.69, f: 1.64 },
  { m: "Jun", a: 1.82, f: 1.78 },
  { m: "Jul", a: 1.94, f: 2.02 },
];

export const profitByBrand = [
  { n: "Global Bus Rental", v: 186 },
  { n: "Coach Hire Dubai", v: 142 },
  { n: "Prime Coach Hire", v: 98 },
  { n: "A2B Transport", v: 66 },
];

export const money = new Intl.NumberFormat("en-AE", {
  style: "currency",
  currency: "AED",
  maximumFractionDigits: 0,
});
