import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { getChannelList } from "@/lib/chat";
import { ChatSidebar } from "@/components/layout/ChatSidebar";

export default async function TeamChatLayout({ children }: { children: React.ReactNode }) {
  const profile = await requireProfile();
  const supabase = await createClient();

  const [channels, { data: profiles }] = await Promise.all([
    getChannelList(supabase, profile.id),
    supabase.from("profiles").select("id, full_name").neq("id", profile.id).order("full_name"),
  ]);

  return (
    <div className="flex h-[calc(100vh-9rem)] min-h-[520px] flex-col gap-4 lg:flex-row">
      <ChatSidebar channels={channels} profiles={(profiles ?? []).map((p) => ({ id: p.id, name: p.full_name }))} />
      <div className="min-h-0 min-w-0 flex-1">{children}</div>
    </div>
  );
}
