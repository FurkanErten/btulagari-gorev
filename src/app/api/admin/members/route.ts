// src/app/api/admin/members/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSbAdmin } from "@supabase/supabase-js";

type Role = "admin" | "captain" | "member" | null;

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const cookieStore = cookies();

  // 1) Oturum açan kullanıcıyı al
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => cookieStore.get(name)?.value,
        set: (name: string, value: string, options: any) =>
          cookieStore.set({ name, value, ...options }),
        remove: (name: string, options: any) =>
          cookieStore.set({ name, value: "", ...options }),
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ items: [] }, { status: 200 });
  }

  // 2) Yetki: sadece admin/captain tüm üyeleri görebilsin
  // RLS'e takılmamak için service role ile kontrol ve listeleme yapacağız
  const admin = createSbAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // <-- env'de mevcut olmalı
  );

  // Kullanıcının rolünü kontrol et
  const { data: me } = await admin
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  const myRole = (me?.role as Role) ?? null;
  if (!(myRole === "admin" || myRole === "captain" || myRole === "member")) {
    // Admin/kaptan değilse sadece kendisini dön (isteğe bağlı)
    const { data: self } = await admin
      .from("profiles")
      .select("id, email, role, member_team, first_name, last_name")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json({ items: self ? [self] : [] }, { status: 200 });
  }

  // 3) (Opsiyonel) takım filtresi query param ile gelebilir ?team=yazilim
  const url = new URL(req.url);
  const team = url.searchParams.get("team"); // yazilim|mekanik|elektronik|sosyal

  let query = admin
    .from("profiles")
    .select("id, email, role, member_team, first_name, last_name")
    .order("first_name", { ascending: true });

  if (team) query = query.eq("member_team", team);

  const { data: items, error } = await query;

  if (error) {
    return NextResponse.json(
      { items: [], error: error.message },
      { status: 200 }
    );
  }
  return NextResponse.json({ items: items ?? [] }, { status: 200 });
}
