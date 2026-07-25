// Hand-written types for the Phase 1 (Foundation) schema. Once the schema is
// live in a real Supabase project, regenerate with:
//   npx supabase gen types typescript --project-id <ref> > lib/supabase/database.types.ts
// and this file becomes redundant.

export type ProfileStatus = "invited" | "active" | "suspended" | "disabled" | "archived";
export type TerritoryType = "country" | "region" | "city" | "postcode" | "airport" | "custom";
export type PermissionOverrideEffect = "grant" | "revoke";
export type LoginEvent = "login_success" | "login_failed" | "logout" | "forced_logout" | "session_expired";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  created_at: string;
}

export interface Company {
  id: string;
  tenant_id: string;
  legal_name: string;
  trading_name: string | null;
  registration_number: string | null;
  vat_number: string | null;
  registered_address: string | null;
  trading_address: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  default_currency: string;
  created_at: string;
}

export interface Brand {
  id: string;
  tenant_id: string;
  company_id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  primary_color: string;
  secondary_color: string | null;
  default_currency: string;
  default_language: string;
  quote_number_prefix: string;
  booking_number_prefix: string;
  invoice_number_prefix: string;
  is_active: boolean;
  webhook_secret: string;
  created_at: string;
}

export interface Office {
  id: string;
  tenant_id: string;
  company_id: string;
  brand_id: string | null;
  name: string;
  country: string | null;
  city: string | null;
  address: string | null;
  created_at: string;
}

export interface Department {
  id: string;
  tenant_id: string;
  name: string;
  created_at: string;
}

export interface Team {
  id: string;
  tenant_id: string;
  department_id: string | null;
  office_id: string | null;
  name: string;
  manager_id: string | null;
  created_at: string;
}

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_system: boolean;
  created_at: string;
}

export interface Permission {
  id: string;
  key: string;
  category: string;
  description: string | null;
}

export interface RolePermission {
  role_id: string;
  permission_id: string;
}

export interface UserPermissionOverride {
  id: string;
  tenant_id: string;
  user_id: string;
  permission_id: string;
  effect: PermissionOverrideEffect;
  created_at: string;
}

export interface Profile {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  job_title: string | null;
  department_id: string | null;
  team_id: string | null;
  office_id: string | null;
  manager_id: string | null;
  role_id: string | null;
  default_company_id: string | null;
  default_brand_id: string | null;
  status: ProfileStatus;
  is_master_admin: boolean;
  requires_password_reset: boolean;
  requires_2fa: boolean;
  access_expires_at: string | null;
  avatar_url: string | null;
  preferred_language: string;
  created_at: string;
  updated_at: string;
}

export interface UserBrand {
  user_id: string;
  brand_id: string;
}

export interface Territory {
  id: string;
  tenant_id: string;
  type: TerritoryType;
  value: string;
  label: string;
  created_at: string;
}

export interface UserTerritory {
  user_id: string;
  territory_id: string;
}

export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface LoginHistoryEntry {
  id: string;
  tenant_id: string;
  user_id: string;
  event: LoginEvent;
  ip_address: string | null;
  user_agent: string | null;
  device: string | null;
  created_at: string;
}

// -----------------------------------------------------------------------------
// Phase 2 — Sales CRM (0002_sales_crm.sql)
// -----------------------------------------------------------------------------

export type LeadSource =
  | "website"
  | "email"
  | "whatsapp"
  | "phone"
  | "live_chat"
  | "manual"
  | "social"
  | "partner"
  | "affiliate"
  | "api"
  | "ad_form";

export type LeadStatus =
  | "new"
  | "assigned"
  | "open_pool"
  | "contacted"
  | "converted"
  | "closed"
  | "spam"
  | "duplicate";

export type LeadPriority = "high" | "normal";

export type EnquiryStatus =
  | "new"
  | "contacted"
  | "quoting"
  | "awaiting_customer"
  | "accepted"
  | "declined"
  | "expired"
  | "cancelled"
  | "converted_to_booking"
  | "completed";

export type JourneyType = "one_way" | "return" | "disposal" | "multi_day";

export type QuoteStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled"
  | "converted";

export type QuoteDecisionType = "accepted" | "rejected";

export type QuoteEventType = "sent" | "viewed" | "accepted" | "rejected" | "expired" | "cancelled";

export interface Customer {
  id: string;
  tenant_id: string;
  company_name: string | null;
  contact_name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  whatsapp: string | null;
  billing_address: string | null;
  country: string | null;
  vat_number: string | null;
  preferred_language: string;
  account_manager_id: string | null;
  default_brand_id: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface VehicleType {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  seat_capacity: number;
  is_active: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  source: LeadSource;
  status: LeadStatus;
  customer_id: string | null;
  assigned_user_id: string | null;
  territory_id: string | null;
  claimed_at: string | null;
  priority: LeadPriority;
  pickup_text: string | null;
  destination_text: string | null;
  travel_date: string | null;
  passenger_count: number | null;
  vehicle_requested: string | null;
  notes: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_term: string | null;
  utm_content: string | null;
  referrer: string | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface Enquiry {
  id: string;
  tenant_id: string;
  brand_id: string | null;
  lead_id: string | null;
  customer_id: string;
  assigned_user_id: string | null;
  status: EnquiryStatus;
  quote_deadline: string | null;
  internal_notes: string | null;
  customer_notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface EnquiryLeg {
  id: string;
  enquiry_id: string;
  sequence: number;
  journey_type: JourneyType;
  pickup_address: string;
  pickup_lat: number | null;
  pickup_lng: number | null;
  destination_address: string;
  destination_lat: number | null;
  destination_lng: number | null;
  via_points: string[];
  pickup_date: string | null;
  pickup_time: string | null;
  return_date: string | null;
  return_time: string | null;
  passenger_count: number | null;
  luggage_count: number | null;
  vehicle_type_id: string | null;
  wheelchair_required: boolean;
  child_seats: number;
  special_requirements: string | null;
  created_at: string;
}

export interface Quote {
  id: string;
  tenant_id: string;
  brand_id: string;
  enquiry_id: string;
  customer_id: string;
  quote_number: string;
  status: QuoteStatus;
  currency: string;
  expiry_at: string | null;
  public_token: string;
  current_version_id: string | null;
  created_by: string | null;
  sent_at: string | null;
  viewed_at: string | null;
  decided_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface QuoteVersion {
  id: string;
  quote_id: string;
  version_number: number;
  vehicle_type_id: string | null;
  vehicle_description: string | null;
  supplier_estimated_cost: number | null;
  selling_price: number;
  currency: string;
  deposit_options: number[];
  payment_methods: { stripe: boolean; bank_transfer: boolean };
  customer_notes: string | null;
  terms_snapshot: string | null;
  brand_snapshot: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface QuoteDecision {
  id: string;
  quote_id: string;
  decision: QuoteDecisionType;
  reason: string | null;
  free_text: string | null;
  decided_at: string;
  ip_address: string | null;
}

export interface QuoteEvent {
  id: string;
  quote_id: string;
  event: QuoteEventType;
  created_at: string;
}

export interface NumberSequence {
  brand_id: string;
  doc_type: string;
  next_value: number;
}

// Minimal shape of a table entry as @supabase/postgrest-js's generics expect
// it (Row/Insert/Update plus an empty Relationships tuple — we don't encode
// foreign-key relationship metadata by hand, so embedded-resource selects
// like `.select("brands(*)")` are typed as `any` rather than fully checked).
type Table<TRow> = { Row: TRow; Insert: Partial<TRow>; Update: Partial<TRow>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      tenants: Table<Tenant>;
      companies: Table<Company>;
      brands: Table<Brand>;
      offices: Table<Office>;
      departments: Table<Department>;
      teams: Table<Team>;
      roles: Table<Role>;
      permissions: Table<Permission>;
      role_permissions: Table<RolePermission>;
      user_permission_overrides: Table<UserPermissionOverride>;
      profiles: Table<Profile>;
      user_brands: Table<UserBrand>;
      territories: Table<Territory>;
      user_territories: Table<UserTerritory>;
      audit_log: Table<AuditLogEntry>;
      login_history: Table<LoginHistoryEntry>;
      customers: Table<Customer>;
      vehicle_types: Table<VehicleType>;
      leads: Table<Lead>;
      enquiries: Table<Enquiry>;
      enquiry_legs: Table<EnquiryLeg>;
      quotes: Table<Quote>;
      quote_versions: Table<QuoteVersion>;
      quote_decisions: Table<QuoteDecision>;
      quote_events: Table<QuoteEvent>;
      number_sequences: Table<NumberSequence>;
    };
    Views: Record<string, never>;
    Functions: {
      current_tenant_id: { Args: Record<string, never>; Returns: string };
      is_master_admin: { Args: Record<string, never>; Returns: boolean };
      has_permission: { Args: { permission_key: string }; Returns: boolean };
      can_view_assignment: { Args: { p_assigned_user_id: string | null }; Returns: boolean };
      claim_lead: { Args: { p_lead_id: string }; Returns: Lead };
      next_document_number: {
        Args: { p_brand_id: string; p_doc_type: string; p_prefix: string };
        Returns: string;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
