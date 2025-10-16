// src/app/api/me/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSbAdmin } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

type Role = "admin" | "captain" | "member" | null;
type Team = "yazilim" | "mekanik" | "elektronik" | "sosyal" | null;

function normalizeTeam(raw: any): Team {
  if (!raw || typeof raw !== "string") return null;
  // Küçük harfe çek + Türkçe 'ı' düzelt
  const s = raw.toLowerCase().replace(/ı/g, "i").trim();
  const map: Record<string, Team> = {
    yazilim: "yazilim",
    yazılım: "yazilim",
    mekanik: "mekanik",
    elektronik: "elektronik",
    sosyal: "sosyal",
  };
  return map[s] ?? null;
}

function makeFullName(
  row: any,
  userFallback?: { email?: string | null; user_metadata?: any }
) {
  const fn = (row?.first_name ?? "").toString().trim();
  const ln = (row?.last_name ?? "").toString().trim();
  const full = [fn, ln].filter(Boolean).join(" ").trim();
  if (full) return full;

  // Supabase user_metadata (opsiyonel)
  const metaFull =
    userFallback?.user_metadata?.full_name ??
    userFallback?.user_metadata?.name ??
    "";
  if (metaFull && typeof metaFull === "string") return metaFull;

  // Son çare: email'in @ öncesi
  const email = userFallback?.email ?? "";
  if (typeof email === "string" && email.includes("@")) {
    return email.split("@")[0];
  }
  return "";
}

export async function GET() {
  const cookieStore = cookies();

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
    return NextResponse.json(
      { userId: null, role: null as Role, name: "", team: null as Team },
      { status: 200 }
    );
  }

  const uid = user.id;
  const email = user.email ?? null;

  // 1) Anon (RLS) ile profili oku
  const { data: existing, error: selErr } = await supabase
    .from("profiles")
    .select("id, role, member_team, first_name, last_name")
    .eq("id", uid)
    .maybeSingle();

  if (!selErr && existing) {
    return NextResponse.json(
      {
        userId: uid,
        role: (existing.role as Role) ?? null,
        name: makeFullName(existing, user),
        team: normalizeTeam(existing.member_team),
      },
      { status: 200 }
    );
  }

  // 2) Admin client (RLS bypass)
  const admin = createSbAdmin(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Yoksa minimal profil oluştur (role yazma)
  const { data: adminRow } = await admin
    .from("profiles")
    .select("id, role, member_team, first_name, last_name")
    .eq("id", uid)
    .maybeSingle();

  if (!adminRow) {
    await admin.from("profiles").insert({ id: uid, email }).select().single();
  }

  // 3) Son profili admin ile oku ve döndür
  const { data: finalRow } = await admin
    .from("profiles")
    .select("id, role, member_team, first_name, last_name")
    .eq("id", uid)
    .maybeSingle();

  return NextResponse.json(
    {
      userId: uid,
      role: (finalRow?.role as Role) ?? null,
      name: makeFullName(finalRow, user),
      team: normalizeTeam(finalRow?.member_team),
    },
    { status: 200 }
  );
}
