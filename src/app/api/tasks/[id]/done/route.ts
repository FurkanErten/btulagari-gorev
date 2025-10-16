import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const taskId = params.id;
  const body = await req.json().catch(() => null);
  const userId = body?.user_id;

  if (!userId) {
    return NextResponse.json({ error: "user_id eksik" }, { status: 400 });
  }

  // task_assignees tablosundaki ilgili kaydı true yap
  const { error } = await supabaseServer
    .from("task_assignees")
    .update({ done: true })
    .eq("task_id", taskId)
    .eq("user_id", userId);

  if (error) {
    console.error("done update error", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
