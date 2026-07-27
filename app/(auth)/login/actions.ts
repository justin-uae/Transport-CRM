"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function signInAction(_prevState: { error: string | null }, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const next = String(formData.get("next") ?? "/dashboard");

  if (!email || !password) {
    return { error: "Enter your email and password." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    return { error: "Incorrect email or password." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("tenant_id, status, requires_password_reset")
    .eq("id", data.user.id)
    .single();

  if (profile) {
    const headerList = await headers();
    await supabase.from("login_history").insert({
      tenant_id: profile.tenant_id,
      user_id: data.user.id,
      event: "login_success",
      ip_address: headerList.get("x-forwarded-for"),
      user_agent: headerList.get("user-agent"),
    });

    if (profile.status === "suspended" || profile.status === "disabled") {
      await supabase.auth.signOut();
      return { error: "This account has been suspended. Contact your administrator." };
    }

    redirect(next || "/dashboard");
  }

  // No staff profile — this login might belong to the separate supplier
  // identity space instead (0003_operations.sql), which shares this same
  // login page and /accept-invite flow.
  const { data: supplier } = await supabase.from("suppliers").select("status").eq("id", data.user.id).single();

  if (supplier) {
    if (supplier.status === "suspended" || supplier.status === "rejected") {
      await supabase.auth.signOut();
      return { error: "This account is no longer active. Contact your administrator." };
    }
    redirect(next && next.startsWith("/supplier") ? next : "/supplier/dashboard");
  }

  await supabase.auth.signOut();
  return { error: "No account found for this login." };
}
