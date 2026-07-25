"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { recordAudit } from "@/lib/audit";

export async function signOut() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("tenant_id")
      .eq("id", user.id)
      .single();

    if (profile) {
      await recordAudit({
        tenantId: profile.tenant_id,
        actorId: user.id,
        action: "logout",
        entityType: "session",
      });
    }
  }

  await supabase.auth.signOut();
  redirect("/login");
}
