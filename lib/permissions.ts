import "server-only";
import { createClient } from "./supabase/server";
import type { Profile } from "./supabase/database.types";

/**
 * Mirrors the `permissions` catalog seeded by
 * supabase/migrations/0001_foundation.sql. Keep in sync with that file —
 * this is only used for typed references in the UI (e.g. gating a button),
 * the database function `has_permission()` is the actual source of truth
 * enforced by RLS policies.
 */
export const PERMISSIONS = {
  ENQUIRIES_VIEW_OWN: "enquiries.view_own",
  ENQUIRIES_VIEW_TEAM: "enquiries.view_team",
  ENQUIRIES_VIEW_ALL: "enquiries.view_all",
  ENQUIRIES_ADD: "enquiries.add",
  ENQUIRIES_EDIT: "enquiries.edit",
  ENQUIRIES_DELETE: "enquiries.delete",
  ENQUIRIES_REASSIGN: "enquiries.reassign",
  ENQUIRIES_CLAIM_OPEN_LEADS: "enquiries.claim_open_leads",
  ENQUIRIES_RETURN_TO_POOL: "enquiries.return_to_pool",

  QUOTES_CREATE: "quotes.create",
  QUOTES_EDIT: "quotes.edit",
  QUOTES_SEND: "quotes.send",
  QUOTES_RESEND: "quotes.resend",
  QUOTES_CANCEL: "quotes.cancel",
  QUOTES_APPLY_DISCOUNTS: "quotes.apply_discounts",
  QUOTES_OVERRIDE_AI_PRICING: "quotes.override_ai_pricing",
  QUOTES_VIEW_SUPPLIER_COST: "quotes.view_supplier_cost",
  QUOTES_VIEW_SELLING_PRICE: "quotes.view_selling_price",
  QUOTES_VIEW_MARGIN_ESTIMATED: "quotes.view_margin_estimated",
  QUOTES_VIEW_MARGIN_FINAL: "quotes.view_margin_final",
  QUOTES_APPROVE_LOW_MARGIN: "quotes.approve_low_margin",
  QUOTES_ACCEPT_MANUALLY: "quotes.accept_manually",
  QUOTES_CHANGE_EXPIRY: "quotes.change_expiry",

  BOOKINGS_VIEW: "bookings.view",
  BOOKINGS_EDIT: "bookings.edit",
  BOOKINGS_CANCEL: "bookings.cancel",
  DISPATCH_SEND_MANUAL: "dispatch.send_manual",
  DISPATCH_USE_ASSISTED: "dispatch.use_assisted",
  DISPATCH_USE_AUTOMATIC: "dispatch.use_automatic",
  DISPATCH_OVERRIDE_ALLOCATION: "dispatch.override_allocation",
  DISPATCH_REASSIGN_SUPPLIER: "dispatch.reassign_supplier",
  DISPATCH_REASSIGN_DRIVER: "dispatch.reassign_driver",
  DISPATCH_CONFIRM_COMPLETION: "dispatch.confirm_completion",

  FINANCE_VIEW_INVOICES: "finance.view_invoices",
  FINANCE_CREATE_INVOICES: "finance.create_invoices",
  FINANCE_EDIT_DRAFT_INVOICES: "finance.edit_draft_invoices",
  FINANCE_APPROVE_INVOICES: "finance.approve_invoices",
  FINANCE_VERIFY_BANK_TRANSFERS: "finance.verify_bank_transfers",
  FINANCE_RECORD_PAYMENTS: "finance.record_payments",
  FINANCE_PROCESS_REFUNDS: "finance.process_refunds",
  FINANCE_ISSUE_CREDIT_NOTES: "finance.issue_credit_notes",
  FINANCE_VIEW_BANK_DETAILS: "finance.view_bank_details",
  FINANCE_VIEW_PROFIT: "finance.view_profit",
  FINANCE_VIEW_COMMISSIONS: "finance.view_commissions",
  FINANCE_APPROVE_COMMISSIONS: "finance.approve_commissions",
  FINANCE_EXPORT: "finance.export",

  SUPPLIERS_ADD: "suppliers.add",
  SUPPLIERS_INVITE: "suppliers.invite",
  SUPPLIERS_APPROVE: "suppliers.approve",
  SUPPLIERS_EDIT: "suppliers.edit",
  SUPPLIERS_VIEW_PRICES: "suppliers.view_prices",
  SUPPLIERS_VIEW_PERFORMANCE: "suppliers.view_performance",
  SUPPLIERS_SEND_JOBS: "suppliers.send_jobs",
  SUPPLIERS_SUSPEND: "suppliers.suspend",
  SUPPLIERS_OVERRIDE_EXPIRED_DOCUMENTS: "suppliers.override_expired_documents",

  ADMIN_MANAGE_USERS: "admin.manage_users",
  ADMIN_MANAGE_ROLES: "admin.manage_roles",
  ADMIN_MANAGE_BRANDS: "admin.manage_brands",
  ADMIN_MANAGE_TEMPLATES: "admin.manage_templates",
  ADMIN_MANAGE_INTEGRATIONS: "admin.manage_integrations",
  ADMIN_MANAGE_AUTOMATIONS: "admin.manage_automations",
  ADMIN_MANAGE_ACCOUNTING_SETTINGS: "admin.manage_accounting_settings",
  ADMIN_EXPORT_COMPANY_DATA: "admin.export_company_data",
  ADMIN_VIEW_AUDIT_LOGS: "admin.view_audit_logs",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/**
 * Checks a single permission for the current session via the database
 * `has_permission()` function (role grant minus/plus per-user overrides).
 * Master Admins always pass without a round trip.
 */
export async function hasPermission(
  profile: Profile,
  key: PermissionKey,
): Promise<boolean> {
  if (profile.is_master_admin) return true;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("has_permission", {
    permission_key: key,
  });

  if (error) return false;
  return Boolean(data);
}
