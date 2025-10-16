/* eslint-disable @typescript-eslint/no-explicit-any */
// src/app/api/tasks/route.ts
import { NextRequest, NextResponse } from "next/server";
import { supabaseServer } from "@/lib/supabaseServer";

const TASKS_TABLE = "task"; // <-- tablo adın "tasks" ise burayı "tasks" yap
const TASK_ASSIGNEES_TABLE = "task_assignees";

// YYYY-MM-DD normalize
function yyyymmdd(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
  const d = new Date(v as any);
  if (Number.isNaN(d.getTime())) return null;
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

const VALID_STATUS = new Set(["open", "assigned", "done"]);
const VALID_TEAM = new Set(["yazilim", "mekanik", "elektronik", "sosyal"]);

/* =========================
 * GET /api/tasks
 * ========================= */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get("status");
    const team = url.searchParams.get("team");
    const from = yyyymmdd(url.searchParams.get("from"));
    const to = yyyymmdd(url.searchParams.get("to"));

    if (url.searchParams.get("from") && !from)
      return NextResponse.json(
        { error: "Geçersiz 'from' tarihi" },
        { status: 400 }
      );
    if (url.searchParams.get("to") && !to)
      return NextResponse.json(
        { error: "Geçersiz 'to' tarihi" },
        { status: 400 }
      );
    if (status && !VALID_STATUS.has(status))
      return NextResponse.json(
        { error: "Geçersiz 'status' değeri" },
        { status: 400 }
      );
    if (team && !VALID_TEAM.has(team))
      return NextResponse.json(
        { error: "Geçersiz 'team' değeri" },
        { status: 400 }
      );

    const supabase = supabaseServer();
    let q = supabase
      .from(TASKS_TABLE)
      .select("*")
      .order("created_at", { ascending: false });

    if (status) q = q.eq("status", status);
    if (team) q = q.eq("assignee_team", team);
    if (from) q = q.gte("start_date", from);
    if (to) q = q.lte("end_date", to);

    const { data: baseTasks, error } = await q;
    if (error)
      return NextResponse.json({ error: error.message }, { status: 500 });

    const tasks = baseTasks ?? [];
    if (tasks.length === 0)
      return NextResponse.json({ data: [] }, { status: 200 });

    // join: user + done
    const taskIds = tasks.map((t: any) => t.id);
    const { data: joins, error: joinErr } = await supabase
      .from(TASK_ASSIGNEES_TABLE)
      .select("task_id, user_id, is_done")
      .in("task_id", taskIds);

    if (joinErr)
      return NextResponse.json({ error: joinErr.message }, { status: 500 });

    const mapAssignees = new Map<string, { id: string; done: boolean }[]>();
    for (const row of joins ?? []) {
      if (!mapAssignees.has(row.task_id)) mapAssignees.set(row.task_id, []);
      mapAssignees
        .get(row.task_id)!
        .push({ id: row.user_id, done: !!row.is_done });
    }

    const result = tasks.map((t: any) => {
      const many = mapAssignees.get(t.id) ?? [];
      if (many.length === 0 && t.assignee_user_id) {
        return { ...t, assignees: [{ id: t.assignee_user_id, done: false }] };
      }
      return { ...t, assignees: many };
    });

    return NextResponse.json({ data: result }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

/* =========================
 * POST /api/tasks
 * ========================= */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const title = (body?.title ?? "").toString().trim();

    const start_date = yyyymmdd(body?.start_date);
    const end_date = yyyymmdd(body?.end_date);
    const due_date = yyyymmdd(body?.due_date);

    const status = (body?.status ?? "open").toString();
    const assignee_team = body?.assignee_team ?? null;
    const description = body?.description ?? null;

    const assignee_user_ids: string[] = Array.isArray(body?.assignee_user_ids)
      ? body.assignee_user_ids.filter(Boolean)
      : [];
    const assignee_user_id: string | null =
      body?.assignee_user_id ?? assignee_user_ids[0] ?? null;

    if (!title)
      return NextResponse.json({ error: "Başlık gerekli." }, { status: 400 });
    if (!start_date || !end_date)
      return NextResponse.json(
        { error: "Başlangıç ve bitiş tarihi gerekli." },
        { status: 400 }
      );
    if (end_date < start_date)
      return NextResponse.json(
        { error: "Bitiş tarihi başlangıçtan önce olamaz." },
        { status: 400 }
      );
    if (status && !VALID_STATUS.has(status))
      return NextResponse.json({ error: "Geçersiz status." }, { status: 400 });
    if (assignee_team && !VALID_TEAM.has(assignee_team))
      return NextResponse.json(
        { error: "Geçersiz assignee_team." },
        { status: 400 }
      );

    const supabase = supabaseServer();

    const taskPayload: Record<string, any> = {
      title,
      description,
      status,
      start_date,
      end_date,
      due_date: due_date ?? end_date,
      assignee_team: assignee_team ?? null,
      assignee_user_id, // legacy tekli; istersen kaldır
    };

    // 1) task insert
    const { data: task, error: insErr } = await supabase
      .from(TASKS_TABLE)
      .insert(taskPayload)
      .select("*")
      .single();

    if (insErr || !task)
      return NextResponse.json(
        { error: insErr?.message || "insert failed" },
        { status: 500 }
      );

    // 2) çoklu atama → join tablo (is_done=false)
    if (assignee_user_ids.length > 0) {
      const rows = assignee_user_ids.map((uid) => ({
        task_id: task.id,
        user_id: uid,
        is_done: false,
      }));
      const { error: joinErr } = await supabase
        .from(TASK_ASSIGNEES_TABLE)
        .insert(rows);
      if (joinErr)
        return NextResponse.json({ error: joinErr.message }, { status: 500 });
    }

    // 3) normalize cevap
    const assignees =
      assignee_user_ids.length > 0
        ? assignee_user_ids.map((id) => ({ id, done: false }))
        : assignee_user_id
        ? [{ id: assignee_user_id, done: false }]
        : [];

    return NextResponse.json({ task: { ...task, assignees } }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

/* =========================
 * PUT /api/tasks  (body.id ile güncelle)
 * ========================= */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({} as any));
    const id = body?.id;
    if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });

    const patch: Record<string, any> = {};
    const hasOwn = (k: string) => Object.prototype.hasOwnProperty.call(body, k);

    if (hasOwn("title"))
      patch.title = (body.title ?? "").toString().trim() || null;
    if (hasOwn("description"))
      patch.description =
        body.description === "" || body.description == null
          ? null
          : body.description;
    if (hasOwn("status")) {
      if (!VALID_STATUS.has(body.status)) {
        return NextResponse.json(
          { error: "Geçersiz status." },
          { status: 400 }
        );
      }
      patch.status = body.status;
    }
    if (hasOwn("assignee_team")) {
      if (body.assignee_team && !VALID_TEAM.has(body.assignee_team)) {
        return NextResponse.json(
          { error: "Geçersiz assignee_team." },
          { status: 400 }
        );
      }
      patch.assignee_team = body.assignee_team ?? null;
    }

    let touchedDate = false;
    if (hasOwn("start_date")) {
      patch.start_date = yyyymmdd(body.start_date);
      touchedDate = true;
    }
    if (hasOwn("end_date")) {
      patch.end_date = yyyymmdd(body.end_date);
      touchedDate = true;
    }
    if (hasOwn("due_date")) {
      patch.due_date = yyyymmdd(body.due_date);
      touchedDate = true;
    }
    if (!hasOwn("due_date") && hasOwn("end_date")) {
      patch.due_date = yyyymmdd(body.end_date);
    }

    // Legacy tekli
    if (hasOwn("assignee_user_id")) {
      patch.assignee_user_id = body.assignee_user_id ?? null;
    } else if (
      Array.isArray(body.assignee_user_ids) &&
      body.assignee_user_ids.length > 0
    ) {
      patch.assignee_user_id = body.assignee_user_ids[0] ?? null;
    }

    const willReplaceAssignees = Array.isArray(body.assignee_user_ids);
    if (
      Object.keys(patch).length === 0 &&
      touchedDate === false &&
      !willReplaceAssignees
    ) {
      return NextResponse.json(
        { error: "No updatable fields" },
        { status: 400 }
      );
    }

    const supabase = supabaseServer();

    // 1) task update
    if (Object.keys(patch).length > 0 || touchedDate) {
      const { data, error } = await supabase
        .from(TASKS_TABLE)
        .update(patch)
        .eq("id", id)
        .select("*")
        .single();

      if (error)
        return NextResponse.json({ error: error.message }, { status: 500 });
      if (!data)
        return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    // 2) assignees replace (opsiyonel)
    if (willReplaceAssignees) {
      const userIds: string[] = (body.assignee_user_ids ?? []).filter(Boolean);

      const { error: delErr } = await supabase
        .from(TASK_ASSIGNEES_TABLE)
        .delete()
        .eq("task_id", id);
      if (delErr)
        return NextResponse.json({ error: delErr.message }, { status: 500 });

      if (userIds.length > 0) {
        const rows = userIds.map((uid) => ({
          task_id: id,
          user_id: uid,
          is_done: false,
        }));
        const { error: insErr } = await supabase
          .from(TASK_ASSIGNEES_TABLE)
          .insert(rows);
        if (insErr)
          return NextResponse.json({ error: insErr.message }, { status: 500 });
      }
    }

    // 3) normalize cevap
    const { data: task, error: fetchErr } = await supabase
      .from(TASKS_TABLE)
      .select("*")
      .eq("id", id)
      .single();
    if (fetchErr || !task)
      return NextResponse.json(
        { error: fetchErr?.message || "Not found" },
        { status: 404 }
      );

    const { data: joins, error: joinErr } = await supabase
      .from(TASK_ASSIGNEES_TABLE)
      .select("task_id, user_id, is_done")
      .eq("task_id", id);
    if (joinErr)
      return NextResponse.json({ error: joinErr.message }, { status: 500 });

    const assignees =
      (joins ?? []).map((r) => ({ id: r.user_id, done: !!r.is_done })) ||
      (task.assignee_user_id
        ? [{ id: task.assignee_user_id, done: false }]
        : []);

    return NextResponse.json({ task: { ...task, assignees } }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

/* =========================
 * DELETE /api/tasks
 *  - id, query (?id=) VEYA body({id})'den alınır
 *  - önce assignees temizlenir, sonra task silinir
 * ========================= */
export async function DELETE(req: NextRequest) {
  try {
    const url = new URL(req.url);
    let id = url.searchParams.get("id");
    if (!id) {
      try {
        const body = await req.json();
        id = body?.id ?? null;
      } catch {
        // body yok/boş olabilir
      }
    }
    if (!id) return NextResponse.json({ error: "id gerekli" }, { status: 400 });

    const supabase = supabaseServer();

    // önce joinleri sil
    const { error: delJoinErr } = await supabase
      .from(TASK_ASSIGNEES_TABLE)
      .delete()
      .eq("task_id", id);
    if (delJoinErr)
      return NextResponse.json({ error: delJoinErr.message }, { status: 500 });

    // sonra task
    const { error: delTaskErr, count } = await supabase
      .from(TASKS_TABLE)
      .delete({ count: "exact" })
      .eq("id", id);
    if (delTaskErr)
      return NextResponse.json({ error: delTaskErr.message }, { status: 500 });
    if ((count ?? 0) === 0)
      return NextResponse.json({ error: "Not found" }, { status: 404 });

    return new NextResponse(null, { status: 204 }); // No Content
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
