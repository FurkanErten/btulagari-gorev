import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

/* ---- Yardımcılar ---- */
function toNullableString(v: unknown): string | null {
  if (v === undefined || v === null) return null;
  const s = String(v).trim();
  return s.length ? s : null;
}

// "2025-10-16" ise aynen bırakır; aksi halde Date'e çevirip local günü korur
function yyyymmdd(v: unknown): string | null {
  if (v === undefined || v === null || v === "") return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v as any);
  if (isNaN(d.getTime())) return null;
  // Local günü koru (timezone kaymasını engeller)
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}
const hasOwn = (o: any, k: string) =>
  o != null && Object.prototype.hasOwnProperty.call(o, k);

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const sb = await supabaseServer();
    const { data, error } = await sb
      .from("tasks")
      .select("*")
      .eq("id", id)
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    const body = await req.json().catch(() => ({} as any));

    // --- PATCH hazırlanışı: sadece body'de gelen alanlar güncellensin ---
    const patch: Record<string, any> = {};

    if (hasOwn(body, "title")) {
      patch.title = toNullableString(body.title);
    }
    if (hasOwn(body, "description")) {
      // boş string -> null
      patch.description = toNullableString(body.description);
    }
    if (hasOwn(body, "assignee_team")) {
      // "" veya undefined -> null
      const t = toNullableString(body.assignee_team);
      patch.assignee_team = t;
    }
    if (hasOwn(body, "status")) {
      const ok = ["open", "assigned", "done"].includes(body.status);
      if (!ok) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      patch.status = body.status;
    }

    // Tarihler: hangi alan gelmişse onu güncelle.
    // Eğer due_date gelmemiş ama end_date gelmişse, due_date'i end_date ile senkron tutabiliriz (opsiyonel).
    let touchedDate = false;

    if (hasOwn(body, "start_date")) {
      patch.start_date = yyyymmdd(body.start_date);
      touchedDate = true;
    }
    if (hasOwn(body, "end_date")) {
      patch.end_date = yyyymmdd(body.end_date);
      touchedDate = true;
    }
    if (hasOwn(body, "due_date")) {
      patch.due_date = yyyymmdd(body.due_date);
      touchedDate = true;
    }

    // due_date verilmediyse ama end_date güncelleniyorsa, tutarlılık için due_date=end_date yap (ekip kararına göre):
    if (!hasOwn(body, "due_date") && hasOwn(body, "end_date")) {
      patch.due_date = yyyymmdd(body.end_date);
    }

    if (Object.keys(patch).length === 0 && !touchedDate) {
      return NextResponse.json(
        { error: "No updatable fields" },
        { status: 400 }
      );
    }

    const sb = await supabaseServer();
    const { data, error } = await sb
      .from("tasks")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error)
      return NextResponse.json({ error: error.message }, { status: 400 });
    if (!data)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return NextResponse.json({ data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server error" },
      { status: 500 }
    );
  }
}
