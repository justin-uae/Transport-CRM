import {
  LayoutDashboard,
  Users,
  FileText,
  CalendarDays,
  Bus,
  Building2,
  Mail,
  MessageCircle,
  Phone,
  Headphones,
  WalletCards,
  BadgeDollarSign,
  Clock3,
  BarChart3,
  FolderKanban,
  Workflow,
  Target,
  MessagesSquare,
  ListTodo,
  Star,
  Plug,
  Bot,
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
   * (undefined) means universally visible — used for modules with no
   * permission catalog entry yet (Part 8 doesn't define one for every
   * placeholder module) or ones every signed-in user should reach
   * (Dashboard, Attendance).
   */
  anyOf?: PermissionKey[];
}

export const NAV: NavItem[] = [
  { label: "Control Centre", href: "/dashboard", icon: LayoutDashboard },
  {
    label: "Leads",
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
  { label: "Quotes", href: "/quotes", icon: FileText, anyOf: [PERMISSIONS.QUOTES_CREATE, PERMISSIONS.QUOTES_VIEW_SELLING_PRICE] },
  { label: "Bookings", href: "/bookings", icon: CalendarDays, anyOf: [PERMISSIONS.BOOKINGS_VIEW] },
  {
    label: "Dispatch",
    href: "/dispatch",
    icon: Bus,
    anyOf: [PERMISSIONS.DISPATCH_SEND_MANUAL, PERMISSIONS.DISPATCH_USE_ASSISTED, PERMISSIONS.DISPATCH_USE_AUTOMATIC],
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
      PERMISSIONS.FINANCE_VIEW_INVOICES,
    ],
  },
  {
    label: "Suppliers",
    href: "/suppliers",
    icon: Truck,
    anyOf: [PERMISSIONS.SUPPLIERS_ADD, PERMISSIONS.SUPPLIERS_VIEW_PERFORMANCE, PERMISSIONS.SUPPLIERS_SEND_JOBS],
  },
  { label: "Email Centre", href: "/email", icon: Mail },
  { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle },
  { label: "Calls", href: "/calls", icon: Phone },
  { label: "Live Chat", href: "/live-chat", icon: Headphones },
  { label: "Accounting", href: "/accounting", icon: WalletCards, anyOf: [PERMISSIONS.FINANCE_VIEW_INVOICES] },
  { label: "Commissions", href: "/commissions", icon: BadgeDollarSign, anyOf: [PERMISSIONS.FINANCE_VIEW_COMMISSIONS] },
  { label: "Attendance", href: "/attendance", icon: Clock3 },
  { label: "Business Intelligence", href: "/business-intelligence", icon: BarChart3, anyOf: [PERMISSIONS.FINANCE_VIEW_PROFIT] },
  { label: "Documents", href: "/documents", icon: FolderKanban },
  { label: "Automations", href: "/automations", icon: Workflow, anyOf: [PERMISSIONS.ADMIN_MANAGE_AUTOMATIONS] },
  { label: "KPIs & Targets", href: "/kpis", icon: Target },
  { label: "Team Chat", href: "/team-chat", icon: MessagesSquare },
  { label: "Tasks", href: "/tasks", icon: ListTodo },
  { label: "Customer Experience", href: "/customer-experience", icon: Star },
  { label: "Integrations", href: "/integrations", icon: Plug, anyOf: [PERMISSIONS.ADMIN_MANAGE_INTEGRATIONS] },
  { label: "AI Optimisation", href: "/ai-optimisation", icon: Bot },
];
