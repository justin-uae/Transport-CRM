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
    };
    Views: Record<string, never>;
    Functions: {
      current_tenant_id: { Args: Record<string, never>; Returns: string };
      is_master_admin: { Args: Record<string, never>; Returns: boolean };
      has_permission: { Args: { permission_key: string }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
