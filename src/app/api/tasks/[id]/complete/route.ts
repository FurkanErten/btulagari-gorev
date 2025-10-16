// src/app/api/tasks/[id]/complete/route.ts
import { NextResponse, NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

export const dynamic = "force-dynamic";

/** Next.js 15: cookies() async; params Promise */
async function getSupabaseFromRoute() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: any) {
          try {
            cookieStore.set({ name, value, ...options });
          } catch {
            /* ignore readonly */
          }
        },
        remove(name: string, options: any) {
          try {
            cookieStore.set({
              name,
              value: "",
              ...options,
              expires: new Date(0),
            });
          } catch {
            /* ignore readonly */
          }
        },
      },
    }
  );
}

type Ctx = { params: Promise<{ id: string }> };

/** Ortak: kullanıcıyı al (401 döndürme helper’ı yok; handler’da kontrol ediliyor) */
async function getAuthUser() {
  const supabase = await getSupabaseFromRoute();
  const { data, error } = await supabase.auth.getUser();
  return { supabase, user: data?.user ?? null, authError: error ?? null };
}

/** YAPTIM / GERİ AL — PATCH
 *  Body:
 *    - done: boolean (default true)
 *    - assignee_id | user_id | uid | profile_id (opsiyonel; verilmezse current user)
 */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  const { id: taskId } = await ctx.params; // ⬅️ async params
  const { supabase, user, authError } = await getAuthUser();

  if (authError)
    return NextResponse.json({ error: authError.message }, { status: 401 });
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => ({} as any));
  const assigneeId =
    body.assignee_id || body.user_id || body.uid || body.profile_id || user.id;

  const wantDone: boolean = Boolean(
    body.done ?? body.is_done ?? true // default: done
  );

  if (wantDone) {
    // DONE: işaretle + zaman damgası
    const { error } = await supabase
      .from("task_assignees")
      .update({ is_done: true, done_at: new Date().toISOString() })
      .eq("task_id", taskId)
      .eq("user_id", assigneeId);

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
  } else {
    // UNDO: is_done=false + done_at=null (RLS izinlerine daha yumuşak)
    const { error: upErr } = await supabase
      .from("task_assignees")
      .update({ is_done: false, done_at: null })
      .eq("task_id", taskId)
      .eq("user_id", assigneeId);

    if (upErr) {
      // Bazı politikalarda update kısıtlıysa delete fallback
      const { error: delErr } = await supabase
        .from("task_assignees")
        .delete()
        .eq("task_id", taskId)
        .eq("user_id", assigneeId);

      if (delErr)
        return NextResponse.json({ error: delErr.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

/** Alternatif UNDO — DELETE /complete?assignee_id=... */
export async function DELETE(req: NextRequest, ctx: Ctx) {
  const { id: taskId } = await ctx.params; // ⬅️ async params
  const { supabase, user, authError } = await getAuthUser();

  if (authError)
    return NextResponse.json({ error: authError.message }, { status: 401 });
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const assigneeId =
    searchParams.get("assignee_id") ||
    searchParams.get("user_id") ||
    searchParams.get("uid") ||
    searchParams.get("profile_id") ||
    user.id;

  // Önce update ile geri almayı dene, sonra delete fallback
  const { error: upErr } = await supabase
    .from("task_assignees")
    .update({ is_done: false, done_at: null })
    .eq("task_id", taskId)
    .eq("user_id", assigneeId);

  if (upErr) {
    const { error: delErr } = await supabase
      .from("task_assignees")
      .delete()
      .eq("task_id", taskId)
      .eq("user_id", assigneeId);

    if (delErr)
      return NextResponse.json({ error: delErr.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
