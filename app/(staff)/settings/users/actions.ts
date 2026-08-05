"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { ImapFlow } from "imapflow";
import nodemailer from "nodemailer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";
import { hasPermission, permissionsUserTag, PERMISSIONS } from "@/lib/permissions";
import { brandsUserTag } from "@/lib/brand";
import { recordAudit } from "@/lib/audit";
import { encryptSecret } from "@/lib/crypto";
import type { ProfileStatus, EmailSecurity } from "@/lib/supabase/database.types";

async function requireUserManager() {
  const profile = await requireProfile();
  const allowed = await hasPermission(profile, PERMISSIONS.ADMIN_MANAGE_USERS);
  if (!allowed) throw new Error("You do not have permission to manage users.");
  return profile;
}

export async function inviteUserAction(
  _prevState: { error: string | null; link: string | null },
  formData: FormData,
) {
  const actor = await requireUserManager();

  const fullName = String(formData.get("fullName") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const roleId = String(formData.get("roleId") ?? "");
  const jobTitle = String(formData.get("jobTitle") ?? "").trim() || null;
  const brandId = String(formData.get("brandId") ?? "").trim() || null;
  const regions = formData
    .getAll("regions")
    .map((r) => String(r).trim())
    .filter(Boolean);

  if (!fullName || !email || !roleId) {
    return { error: "Full name, email and role are required.", link: null };
  }
  if (!brandId) {
    return { error: "Every user belongs to a brand/branch — select one.", link: null };
  }

  const admin = createAdminClient();

  const { data: brand } = await admin.from("brands").select("company_id").eq("id", brandId).single();
  if (!brand) {
    return { error: "Selected brand not found.", link: null };
  }
  const companyId = brand.company_id;

  // generateLink (rather than inviteUserByEmail) creates the auth user
  // without sending a Supabase-hosted email — Supabase only lets you
  // customise that email's template with custom SMTP configured, and real
  // email delivery is a later phase (Part 41, Phase 7) anyway. We build the
  // same /auth/confirm link ourselves from the raw token and hand it back
  // to the admin to share directly, sidestepping both problems.
  const { data: invited, error: inviteError } = await admin.auth.admin.generateLink({
    type: "invite",
    email,
    options: { redirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/accept-invite` },
  });
  if (inviteError || !invited.user) {
    return { error: inviteError?.message ?? "Could not create the invite.", link: null };
  }

  const { error: profileError } = await admin.from("profiles").insert({
    id: invited.user.id,
    tenant_id: actor.tenant_id,
    full_name: fullName,
    email,
    job_title: jobTitle,
    role_id: roleId,
    default_company_id: companyId,
    default_brand_id: brandId,
    status: "invited",
    requires_password_reset: true,
  });

  if (profileError) {
    return { error: profileError.message, link: null };
  }

  await admin.from("user_brands").insert({ user_id: invited.user.id, brand_id: brandId });
  revalidateTag(brandsUserTag(invited.user.id), { expire: 0 });

  if (regions.length > 0) {
    await admin.from("user_regions").insert(regions.map((region) => ({ user_id: invited.user.id, region })));
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_invited",
    entityType: "profile",
    entityId: invited.user.id,
    newValue: { email, fullName, roleId, brandId, regions },
  });

  revalidatePath("/settings/users");

  const inviteLink = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/confirm?token_hash=${invited.properties.hashed_token}&type=invite&next=/accept-invite`;
  return { error: null, link: inviteLink };
}

export async function updateUserStatusAction(userId: string, status: ProfileStatus) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("profiles")
    .select("status, tenant_id, is_master_admin")
    .eq("id", userId)
    .single();

  if (!target || target.tenant_id !== actor.tenant_id) {
    throw new Error("User not found.");
  }
  if (target.is_master_admin && !actor.is_master_admin) {
    throw new Error("Only a Master Admin can change another Master Admin's status.");
  }

  const { error } = await supabase.from("profiles").update({ status }).eq("id", userId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_status_changed",
    entityType: "profile",
    entityId: userId,
    previousValue: { status: target.status },
    newValue: { status },
  });

  revalidatePath("/settings/users");
}

export async function addUserRegionAction(userId: string, region: string) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const trimmed = region.trim();
  if (!trimmed) return { error: "Enter a region name." };

  const { data: target } = await supabase.from("profiles").select("tenant_id").eq("id", userId).single();
  if (!target || target.tenant_id !== actor.tenant_id) {
    return { error: "User not found." };
  }

  const { error } = await supabase.from("user_regions").insert({ user_id: userId, region: trimmed });
  if (error) {
    return { error: error.message.includes("duplicate") ? "That region is already assigned." : error.message };
  }

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_region_added",
    entityType: "profile",
    entityId: userId,
    newValue: { region: trimmed },
  });

  revalidatePath("/settings/users");
  return { error: null };
}

export async function removeUserRegionAction(userId: string, regionId: string) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const { data: target } = await supabase.from("profiles").select("tenant_id").eq("id", userId).single();
  if (!target || target.tenant_id !== actor.tenant_id) {
    throw new Error("User not found.");
  }

  const { error } = await supabase.from("user_regions").delete().eq("id", regionId).eq("user_id", userId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_region_removed",
    entityType: "profile",
    entityId: userId,
    previousValue: { regionId },
  });

  revalidatePath("/settings/users");
}

export async function updateUserRoleAction(userId: string, roleId: string) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const { data: target } = await supabase
    .from("profiles")
    .select("role_id, tenant_id")
    .eq("id", userId)
    .single();

  if (!target || target.tenant_id !== actor.tenant_id) {
    throw new Error("User not found.");
  }

  const { error } = await supabase.from("profiles").update({ role_id: roleId }).eq("id", userId);
  if (error) throw new Error(error.message);

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: "user_role_changed",
    entityType: "profile",
    entityId: userId,
    previousValue: { role_id: target.role_id },
    newValue: { role_id: roleId },
  });

  revalidateTag(permissionsUserTag(userId), { expire: 0 });
  revalidatePath("/settings/users");
}

interface EmailAccountInput {
  displayName: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapSecurity: EmailSecurity;
  imapUsername: string;
  imapPassword: string; // empty string = keep the existing stored password
  smtpHost: string;
  smtpPort: number;
  smtpSecurity: EmailSecurity;
  smtpUsername: string;
  smtpPassword: string; // empty string = keep the existing stored password
  isActive: boolean;
}

/**
 * Master Admin sets up (or edits) a staff member's mailbox connection on
 * their behalf (requirement: Settings -> Users -> IMAP/SMTP). Password
 * fields are write-only from the client — an empty string here means "keep
 * whatever is already stored", never "clear it", so the form never needs to
 * round-trip a decrypted secret back to the browser.
 */
export async function upsertEmailAccountAction(userId: string, data: EmailAccountInput) {
  const actor = await requireUserManager();
  const supabase = await createClient();

  const { data: target } = await supabase.from("profiles").select("tenant_id").eq("id", userId).single();
  if (!target || target.tenant_id !== actor.tenant_id) {
    return { error: "User not found." };
  }

  const { data: existing } = await supabase
    .from("email_accounts")
    .select("id, imap_password_enc, smtp_password_enc")
    .eq("user_id", userId)
    .maybeSingle();

  const imapPasswordEnc = data.imapPassword ? encryptSecret(data.imapPassword) : existing?.imap_password_enc;
  const smtpPasswordEnc = data.smtpPassword ? encryptSecret(data.smtpPassword) : existing?.smtp_password_enc;
  if (!imapPasswordEnc || !smtpPasswordEnc) {
    return { error: "IMAP and SMTP passwords are required." };
  }

  const { error } = await supabase.from("email_accounts").upsert(
    {
      tenant_id: actor.tenant_id,
      user_id: userId,
      display_name: data.displayName,
      email_address: data.emailAddress,
      imap_host: data.imapHost,
      imap_port: data.imapPort,
      imap_security: data.imapSecurity,
      imap_username: data.imapUsername,
      imap_password_enc: imapPasswordEnc,
      smtp_host: data.smtpHost,
      smtp_port: data.smtpPort,
      smtp_security: data.smtpSecurity,
      smtp_username: data.smtpUsername,
      smtp_password_enc: smtpPasswordEnc,
      is_active: data.isActive,
      created_by: actor.id,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) return { error: error.message };

  await recordAudit({
    tenantId: actor.tenant_id,
    actorId: actor.id,
    action: existing ? "email_account_updated" : "email_account_created",
    entityType: "email_account",
    entityId: existing?.id ?? userId,
    newValue: { emailAddress: data.emailAddress, imapHost: data.imapHost, smtpHost: data.smtpHost },
  });

  revalidatePath("/settings/users");
  return { error: null };
}

/**
 * Tries connecting with the values currently in the form, before they're
 * saved — surfaces a typo'd host/port/password immediately instead of at
 * the next cron sync. Never persists anything.
 */
export async function testEmailConnectionAction(data: EmailAccountInput) {
  await requireUserManager();

  const result: { imapError: string | null; smtpError: string | null } = { imapError: null, smtpError: null };

  try {
    const client = new ImapFlow({
      host: data.imapHost,
      port: data.imapPort,
      secure: data.imapSecurity === "ssl",
      auth: { user: data.imapUsername, pass: data.imapPassword },
      logger: false,
    });
    await client.connect();
    await client.logout();
  } catch (err) {
    result.imapError = err instanceof Error ? err.message : "Could not connect to the IMAP server.";
  }

  try {
    const transporter = nodemailer.createTransport({
      host: data.smtpHost,
      port: data.smtpPort,
      secure: data.smtpSecurity === "ssl",
      auth: { user: data.smtpUsername, pass: data.smtpPassword },
    });
    await transporter.verify();
  } catch (err) {
    result.smtpError = err instanceof Error ? err.message : "Could not connect to the SMTP server.";
  }

  return result;
}
