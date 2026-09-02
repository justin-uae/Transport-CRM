import {
  LayoutDashboard,
  Users,
  FileText,
  CalendarDays,
  CalendarX2,
  CalendarCheck2,
  Bus,
  Building2,
  Mail,
  MessageCircle,
  Phone,
  WalletCards,
  BadgeDollarSign,
  Clock3,
  BarChart3,
  FolderKanban,
  Target,
  MessagesSquare,
  ListTodo,
  Star,
  Truck,
  type LucideIcon,
} from "lucide-react";
import { PERMISSIONS, type PermissionKey } from "@/lib/permissionKeys";

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
  /**
   * Shown if the user holds ANY of these permission keys. Omitted entirely
   * (undefined) means universally visible. Every role holds
   * general.workspace_access except Finance Manager (whose access is
   * deliberately scoped to exactly the Accounting pages), so "universal"
   * items use that key rather than being left ungated.
   */
  anyOf?: PermissionKey[];
}

const WORKSPACE = [PERMISSIONS.GENERAL_WORKSPACE_ACCESS];

export const NAV: NavItem[] = [
  { label: "Control Centre", href: "/dashboard", icon: LayoutDashboard, anyOf: WORKSPACE },
  {
    label: "Customer Leads",
    href: "/leads",
    icon: Users,
    anyOf: [
      PERMISSIONS.ENQUIRIES_VIEW_OWN,
      PERMISSIONS.ENQUIRIES_VIEW_TEAM,
      PERMISSIONS.ENQUIRIES_VIEW_ALL,
      PERMISSIONS.ENQUIRIES_ADD,
      PERMISSIONS.ENQUIRIES_CLAIM_OPEN_LEADS,
    ],
  },
  {
    label: "Pending Quotes",
    href: "/quotes",
    icon: FileText,
    anyOf: [PERMISSIONS.QUOTES_CREATE, PERMISSIONS.QUOTES_VIEW_SELLING_PRICE],
  },
  { label: "Confirmed Booking", href: "/bookings", icon: CalendarDays, anyOf: [PERMISSIONS.BOOKINGS_VIEW] },
  { label: "Lost Booking", href: "/bookings/lost", icon: CalendarX2, anyOf: [PERMISSIONS.BOOKINGS_VIEW] },
  { label: "Completed Booking", href: "/bookings/completed", icon: CalendarCheck2, anyOf: [PERMISSIONS.BOOKINGS_VIEW] },
  {
    label: "Dispatch",
    href: "/dispatch",
    icon: Bus,
    // Sales roles can also always dispatch a job they personally created
    // (see canDispatch() in app/(staff)/dispatch/actions.ts) — quotes.create
    // is the marker for "this role can end up owning a paid job", so it
    // keeps the nav item consistent with that ownership bypass. bookings.view
    // is here too so Read-Only (and anyone else who can see the Booking
    // tabs) gets a real sidebar match when they click "View job" — read-only
    // visibility into job detail, no write capability (offer/withdraw/
    // transfer stay separately gated at the action layer).
    anyOf: [
      PERMISSIONS.DISPATCH_SEND_MANUAL,
      PERMISSIONS.DISPATCH_USE_ASSISTED,
      PERMISSIONS.DISPATCH_USE_AUTOMATIC,
      PERMISSIONS.QUOTES_CREATE,
      PERMISSIONS.BOOKINGS_VIEW,
    ],
  },
  {
    label: "Customers",
    href: "/customers",
    icon: Building2,
    anyOf: [
      PERMISSIONS.ENQUIRIES_VIEW_OWN,
      PERMISSIONS.ENQUIRIES_VIEW_TEAM,
      PERMISSIONS.ENQUIRIES_VIEW_ALL,
      PERMISSIONS.BOOKINGS_VIEW,
    ],
  },
  {
    label: "Suppliers",
    href: "/suppliers",
    icon: Truck,
    anyOf: [PERMISSIONS.SUPPLIERS_ADD, PERMISSIONS.SUPPLIERS_VIEW_PERFORMANCE, PERMISSIONS.SUPPLIERS_SEND_JOBS],
  },
  { label: "Email Centre", href: "/email", icon: Mail, anyOf: WORKSPACE },
  { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle, anyOf: WORKSPACE },
  { label: "Calls", href: "/calls", icon: Phone, anyOf: WORKSPACE },
  { label: "Accounting", href: "/accounting", icon: WalletCards, anyOf: [PERMISSIONS.FINANCE_VIEW_INVOICES] },
  {
    label: "Customer Payments",
    href: "/accounting/customer-payments",
    icon: WalletCards,
    anyOf: [PERMISSIONS.FINANCE_RECORD_PAYMENTS],
  },
  {
    label: "Supplier Payments",
    href: "/accounting/supplier-payments",
    icon: WalletCards,
    anyOf: [PERMISSIONS.FINANCE_PAY_SUPPLIERS],
  },
  { label: "Commissions", href: "/commissions", icon: BadgeDollarSign, anyOf: [PERMISSIONS.FINANCE_VIEW_COMMISSIONS] },
  { label: "Attendance", href: "/attendance", icon: Clock3, anyOf: WORKSPACE },
  { label: "Business Intelligence", href: "/business-intelligence", icon: BarChart3, anyOf: [PERMISSIONS.FINANCE_VIEW_PROFIT] },
  { label: "Documents", href: "/documents", icon: FolderKanban, anyOf: WORKSPACE },
  { label: "KPIs & Targets", href: "/kpis", icon: Target, anyOf: WORKSPACE },
  { label: "Team Chat", href: "/team-chat", icon: MessagesSquare, anyOf: WORKSPACE },
  { label: "Tasks", href: "/tasks", icon: ListTodo, anyOf: WORKSPACE },
  { label: "Customer Experience", href: "/customer-experience", icon: Star, anyOf: WORKSPACE },
  // AI Optimisation — hidden from the sidebar for now (not ready), route/page left in place for when
  // it's finished. Restore by re-adding the entry below and importing Bot from lucide-react again:
  // { label: "AI Optimisation", href: "/ai-optimisation", icon: Bot, anyOf: WORKSPACE },
];

/** Every nav href the given permission set unlocks, in NAV order. */
export function computeVisibleHrefs(granted: Set<PermissionKey>): string[] {
  return NAV.filter((item) => !item.anyOf || item.anyOf.some((key) => granted.has(key))).map((item) => item.href);
}

/** Where to land a signed-in user with no more specific destination in mind — the first nav item they can actually see. */
export function defaultLandingHref(granted: Set<PermissionKey>): string {
  return computeVisibleHrefs(granted)[0] ?? "/dashboard";
}

/**
 * A couple of roles have a deliberately different "home" than whatever's
 * first in NAV order — Sales User works out of Leads day-to-day, and
 * Finance Manager's first visible item would be Accounting anyway (nothing
 * before it in NAV is visible to them), but pinning it here keeps that
 * explicit rather than incidental to array order.
 */
const ROLE_LANDING_OVERRIDE: Record<string, string> = {
  "Sales User": "/leads",
  "Finance Manager": "/accounting",
};

/** Full landing-page decision: role-specific override (for anyone but Master Admin) falling back to the first visible nav item. */
export function landingHref(roleName: string | null, isMasterAdmin: boolean, granted: Set<PermissionKey>): string {
  if (!isMasterAdmin && roleName && ROLE_LANDING_OVERRIDE[roleName]) {
    return ROLE_LANDING_OVERRIDE[roleName];
  }
  return defaultLandingHref(granted);
}
