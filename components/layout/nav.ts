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

export interface NavItem {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const NAV: NavItem[] = [
  { label: "Control Centre", href: "/dashboard", icon: LayoutDashboard },
  { label: "Leads", href: "/leads", icon: Users },
  { label: "Quotes", href: "/quotes", icon: FileText },
  { label: "Bookings", href: "/bookings", icon: CalendarDays },
  { label: "Dispatch", href: "/dispatch", icon: Bus },
  { label: "Customers", href: "/customers", icon: Building2 },
  { label: "Suppliers", href: "/suppliers", icon: Truck },
  { label: "Email Centre", href: "/email", icon: Mail },
  { label: "WhatsApp", href: "/whatsapp", icon: MessageCircle },
  { label: "Calls", href: "/calls", icon: Phone },
  { label: "Live Chat", href: "/live-chat", icon: Headphones },
  { label: "Accounting", href: "/accounting", icon: WalletCards },
  { label: "Commissions", href: "/commissions", icon: BadgeDollarSign },
  { label: "Attendance", href: "/attendance", icon: Clock3 },
  { label: "Business Intelligence", href: "/business-intelligence", icon: BarChart3 },
  { label: "Documents", href: "/documents", icon: FolderKanban },
  { label: "Automations", href: "/automations", icon: Workflow },
  { label: "KPIs & Targets", href: "/kpis", icon: Target },
  { label: "Team Chat", href: "/team-chat", icon: MessagesSquare },
  { label: "Tasks", href: "/tasks", icon: ListTodo },
  { label: "Customer Experience", href: "/customer-experience", icon: Star },
  { label: "Integrations", href: "/integrations", icon: Plug },
  { label: "AI Optimisation", href: "/ai-optimisation", icon: Bot },
];
