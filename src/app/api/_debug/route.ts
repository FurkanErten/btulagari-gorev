// src/app/api/_debug/route.ts
import { NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function GET() {
  const sb = supabaseServer();
  const {
    data: { user },
  } = await sb.auth.getUser();

  let profile = null,
    profileErr = null;
  if (user) {
    const { data, error } = await sb
      .from("profiles")
      .select("id,email,role,member_team")
      .eq("id", user.id)
      .maybeSingle();
    profile = data ?? null;
    profileErr = error?.message ?? null;
  }

  return NextResponse.json({
    user_present: !!user,
    user_id: user?.id ?? null,
    user_email: user?.email ?? null,
    profile,
    profile_error: profileErr,
  });
}
