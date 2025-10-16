import { supabaseServer } from "@/lib/supabaseServer";

export async function getSessionAndRole() {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { user: null as any, role: null as any };

  const { data: profile } = await sb
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return {
    user,
    role: (profile?.role ?? null) as "admin" | "captain" | "member" | null,
  };
}
