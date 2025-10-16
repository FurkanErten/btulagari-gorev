/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";
import { useEffect, useMemo, useState } from "react";

/* ==== Tipler ==== */
type Team = "yazilim" | "mekanik" | "elektronik" | "sosyal" | null;
type Role = "admin" | "captain" | "member" | null;

type Task = {
  id: string;
  title: string;
  start_date?: string | null; // YYYY-MM-DD
  end_date?: string | null; // YYYY-MM-DD
  // legacy:
  due_date?: string | null;
  status?: "open" | "assigned" | "done";
  assignee_team?: Team;
  assignee_user_id?: string | null; // legacy (tekil)
  // string veya {id,done} kabul
  assignees?: Array<string | { id: string; done: boolean }>;
  description?: string | null;
};

type Member = {
  id: string;
  email: string;
  role: Role;
  member_team: Exclude<Team, null> | null;
  first_name: string | null;
  last_name: string | null;
};

/* ==== Yardımcılar ==== */
// Yerel YYYY-MM-DD
const fmtYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
// "YYYY-MM-DD" -> yerel Date
const parseYMDLocal = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
const addDays = (d: Date, n: number) =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/* ==== Görsel etiketler ==== */
const teamLabel: Record<Exclude<Team, null>, string> = {
  yazilim: "Yazılım",
  mekanik: "Mekanik",
  elektronik: "Elektronik",
  sosyal: "Sosyal",
};
const teamChip: Record<Exclude<Team, null>, string> = {
  yazilim:
    "inline-flex items-center gap-1 rounded-full border border-sky-400/30 bg-sky-400/10 px-2 py-0.5 text-[11px] text-sky-200",
  mekanik:
    "inline-flex items-center gap-1 rounded-full border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[11px] text-amber-200",
  elektronik:
    "inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200",
  sosyal:
    "inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-400/10 px-2 py-0.5 text-[11px] text-fuchsia-200",
};
const teamRow: Record<Exclude<Team, null>, string> = {
  yazilim:
    "border-l-2 border-sky-400 bg-sky-400/10 text-sky-100 hover:bg-sky-400/15",
  mekanik:
    "border-l-2 border-amber-400 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15",
  elektronik:
    "border-l-2 border-emerald-400 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/15",
  sosyal:
    "border-l-2 border-fuchsia-400 bg-fuchsia-400/10 text-fuchsia-100 hover:bg-fuchsia-400/15",
};
const generalRow =
  "border-l-2 border-slate-400 bg-white/5 text-slate-200 hover:bg-white/10";

/* ==== Sayfa ==== */
export default function CalendarPage() {
  /* State */
  const [month, setMonth] = useState<Date>(startOfMonth(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [meRole, setMeRole] = useState<Role>(null);
  const [myId, setMyId] = useState<string | null>(null);

  const [modalDate, setModalDate] = useState<string | null>(null); // YYYY-MM-DD
  const [modalTab, setModalTab] = useState<"list" | "new" | "detail" | "edit">(
    "list"
  );
  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);

  const [form, setForm] = useState<{
    title: string;
    description: string;
    assignee_team: Exclude<Team, null> | "";
    assignee_user_ids: string[]; // çoklu seçim
    start_date: string;
    end_date: string;
    loading: boolean;
    error: string | null;
    ok: string | null;
  }>({
    title: "",
    description: "",
    assignee_team: "",
    assignee_user_ids: [],
    start_date: "",
    end_date: "",
    loading: false,
    error: null,
    ok: null,
  });

  const [editForm, setEditForm] = useState<{
    title: string;
    description: string;
    start_date: string;
    end_date: string;
    due_date: string;
    assignee_team: "" | Exclude<Team, null>;
    status: "open" | "assigned" | "done";
  }>({
    title: "",
    description: "",
    start_date: "",
    end_date: "",
    due_date: "",
    assignee_team: "",
    status: "open",
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  const membersById = useMemo(() => {
    const m: Record<string, Member> = {};
    for (const x of members) m[x.id] = x;
    return m;
  }, [members]);

  const todayStr = useMemo(() => fmtYMD(new Date()), []);

  /* ==== Rol & Kimlik ==== */
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        const js = await r.json().catch(() => ({}));
        setMeRole((js?.role as Role) ?? null);
        setMyId((js?.userId as string) ?? null);
      } catch {
        setMeRole(null);
        setMyId(null);
      }
    })();
  }, []);

  /* ==== Görevleri çek ==== */
  const canSeeTasks = meRole !== null && !!myId;

  useEffect(() => {
    if (!canSeeTasks) {
      setTasks([]);
      return;
    }
    (async () => {
      try {
        const r = await fetch("/api/tasks", { cache: "no-store" });
        if (!r.ok) throw new Error("tasks fetch fail");
        const js = await r.json();

        const norm: Task[] = (Array.isArray(js.data) ? js.data : []).map(
          (t: any) => {
            const sd = t.start_date ?? t.due_date ?? null;
            const ed = t.end_date ?? t.due_date ?? null;

            let assignees: Array<string | { id: string; done: boolean }> = [];
            if (Array.isArray(t.assignees)) assignees = t.assignees;
            else if (Array.isArray(t.assignee_user_ids))
              assignees = t.assignee_user_ids;
            else if (t.assignee_user_id) assignees = [t.assignee_user_id];

            return { ...t, start_date: sd, end_date: ed, assignees } as Task;
          }
        );
        setTasks(norm);
      } catch {
        setTasks([]);
      }
    })();
  }, [canSeeTasks]);

  /* ==== Üyeler ==== */
  useEffect(() => {
    if (!(meRole === "admin" || meRole === "captain" || meRole === "member"))
      return;
    (async () => {
      try {
        const r = await fetch("/api/admin/members", { cache: "no-store" });
        if (!r.ok) throw new Error("members fetch fail");
        const js = (await r.json()) as { items: any[] } | any;
        const raw: any[] = Array.isArray(js) ? js : js?.items ?? js?.data ?? [];

        const ms: Member[] = raw
          .map((p: any) => {
            const u = p?.user ?? p;
            const id = String(u.id ?? u.user_id ?? u.userId ?? u.uid ?? "");
            if (!id) return null;
            return {
              id,
              email: u.email ?? "",
              role: (u.role ?? "member") as Role,
              member_team: (u.member_team ?? u.team ?? null) as any,
              first_name: u.first_name ?? null,
              last_name: u.last_name ?? null,
            } as Member;
          })
          .filter(Boolean) as Member[];

        setMembers(ms);
      } catch {
        setMembers([]);
      }
    })();
  }, [meRole]);

  /* ==== Assignee normalizasyonu ==== */
  const getAssignees = (t: Task): { id: string; done: boolean }[] => {
    if (!t) return [];
    if (Array.isArray(t.assignees) && t.assignees.length > 0) {
      return t.assignees.map((a: any) =>
        typeof a === "string"
          ? { id: a, done: false }
          : { id: String(a.id), done: !!a.done }
      );
    }
    const anyT = t as any;
    if (
      Array.isArray(anyT.assignee_user_ids) &&
      anyT.assignee_user_ids.length
    ) {
      return anyT.assignee_user_ids.map((id: string) => ({ id, done: false }));
    }
    if (t.assignee_user_id) return [{ id: t.assignee_user_id, done: false }];
    return [];
  };

  /* ==== ROLE-BAZLI GÖRÜNÜR LİSTE ==== */
  const tasksForView = useMemo(() => {
    if (!canSeeTasks) return [];
    if (meRole === "admin" || meRole === "captain") return tasks;
    // member → sadece kendine atanmışlar
    return tasks.filter((t) => getAssignees(t).some((a) => a.id === myId));
  }, [canSeeTasks, meRole, tasks, myId]);

  /* ==== Görsel yardımcılar ==== */
  const displayName = (m?: Member | null) => {
    if (!m) return "";
    const fn = m.first_name?.trim() || "";
    const ln = m.last_name?.trim() || "";
    const full = `${fn} ${ln}`.trim();
    return full || m.email || m.id;
  };

  const renderAssignees = (
    list?: { id: string; done: boolean }[],
    task?: Task
  ) => {
    if (!list || list.length === 0) return null;

    const due = task?.end_date ?? task?.due_date ?? task?.start_date ?? null;
    const isTaskOverdue = (aDone: boolean) => !!due && due < todayStr && !aDone;

    return (
      <div className="mt-1 flex flex-wrap gap-1">
        {list.map((a) => {
          const m = membersById[a.id];
          const name = displayName(m) || a.id.slice(0, 6);

          const cls = a.done
            ? "inline-flex items-center gap-1 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-2 py-0.5 text-[11px] text-emerald-200"
            : isTaskOverdue(a.done)
            ? "inline-flex items-center gap-1 rounded-full border border-red-400/40 bg-red-500/10 px-2 py-0.5 text-[11px] text-red-200"
            : "badge";

          const title = a.done
            ? "Tamamladı"
            : isTaskOverdue(a.done)
            ? "Günü geçti"
            : "Devam ediyor";

          return (
            <span key={`${a.id}`} className={cls} title={title}>
              {name}
            </span>
          );
        })}
      </div>
    );
  };

  /* ==== Takvim 6x7 grid ==== */
  const days = useMemo(() => {
    const first = startOfMonth(month);
    const jsDow = (d: Date) => (d.getDay() === 0 ? 7 : d.getDay());
    const gridStart = addDays(first, -(jsDow(first) - 1));
    const grid: Date[] = [];
    for (let i = 0; i < 42; i++) grid.push(addDays(gridStart, i));
    return { grid };
  }, [month]);

  const isOnDay = (t: Task, dayStr: string) => {
    const sd = t.start_date ?? t.due_date ?? null;
    const ed = t.end_date ?? t.due_date ?? null;
    if (!sd && !ed) return false;
    return sd === dayStr || ed === dayStr;
  };

  function summarizeByTeam(list: Task[], dayStr: string) {
    const counts: Record<string, number> = {};
    for (const t of list) {
      if (!isOnDay(t, dayStr)) continue;
      const key = t.assignee_team ?? "genel";
      counts[key] = (counts[key] || 0) + 1;
    }
    const order = ["yazilim", "mekanik", "elektronik", "sosyal", "genel"];
    return order
      .filter((k) => counts[k])
      .map((k) =>
        k === "genel"
          ? { label: `Genel · ${counts[k]}`, cls: generalRow, count: counts[k] }
          : {
              label: `${teamLabel[k as Exclude<Team, null>]} · ${counts[k]}`,
              cls: teamRow[k as Exclude<Team, null>],
              count: counts[k],
            }
      );
  }

  const filteredMembers = useMemo(() => {
    const team = form.assignee_team || null;
    let list = members;
    if (team) list = list.filter((m) => m.member_team === team);
    return list
      .slice()
      .sort((a, b) => displayName(a).localeCompare(displayName(b), "tr"));
  }, [members, form.assignee_team]);

  /* ==== CRUD ==== */
  async function submitNewTask() {
    if (!modalDate) return;
    if (!form.start_date || !form.end_date) {
      setForm((f) => ({ ...f, error: "Başlangıç ve bitiş tarihi gerekli." }));
      return;
    }
    if (form.end_date < form.start_date) {
      setForm((f) => ({
        ...f,
        error: "Bitiş tarihi, başlangıçtan önce olamaz.",
      }));
      return;
    }

    setForm((f) => ({ ...f, loading: true, error: null, ok: null }));
    try {
      const assignee_user_ids = form.assignee_user_ids;
      const r = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          description: form.description || null,
          status: "open",
          start_date: form.start_date,
          end_date: form.end_date,
          assignee_team: form.assignee_team || null,
          assignee_user_ids, // çoklu
          assignee_user_id: assignee_user_ids[0] ?? null, // legacy fallback
          due_date: form.end_date,
        }),
      });
      const js = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(js?.error || "Görev eklenemedi");

      const serverTask = js.task as any;
      const newTask: Task = {
        ...serverTask,
        start_date: serverTask?.start_date ?? form.start_date,
        end_date: serverTask?.end_date ?? form.end_date,
        assignees: Array.isArray(serverTask?.assignees)
          ? serverTask.assignees
          : Array.isArray(serverTask?.assignee_user_ids)
          ? serverTask.assignee_user_ids
          : serverTask?.assignee_user_id
          ? [serverTask.assignee_user_id]
          : assignee_user_ids,
      };
      setTasks((prev) => [...prev, newTask]);

      setForm({
        title: "",
        description: "",
        assignee_team: "",
        assignee_user_ids: [],
        start_date: "",
        end_date: "",
        loading: false,
        error: null,
        ok: "Görev eklendi ✔",
      });
      setModalTab("list");
    } catch (e: any) {
      setForm((f) => ({
        ...f,
        loading: false,
        error: e?.message || "Hata oluştu",
      }));
    }
  }

  async function deleteTask(t: Task) {
    if (!t?.id) return;
    if (!(meRole === "admin" || meRole === "captain")) return;

    try {
      setDeleting(t.id);

      // 1) /api/tasks?id=...  (collection DELETE + query)
      let r = await fetch(`/api/tasks?id=${encodeURIComponent(t.id)}`, {
        method: "DELETE",
      });

      // 2) 404/405 ise body ile /api/tasks
      if (r.status === 404 || r.status === 405) {
        r = await fetch(`/api/tasks`, {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id: t.id }),
        });
      }

      // 3) Başarısızsa mesajı akıllıca çıkart
      if (!r.ok) {
        let msg = "Silinemedi";
        try {
          const txt = await r.text();
          if (txt) {
            const js = JSON.parse(txt);
            msg = js?.error || txt || msg;
          }
        } catch {
          /* no-op: 204 vs düz metin */
        }
        throw new Error(msg);
      }

      // 4) Başarılı: local state’ten düş
      setTasks((prev) => prev.filter((x) => x.id !== t.id));
      if (detailTask?.id === t.id) {
        setDetailTask(null);
        setModalTab("list");
      }
    } catch (e) {
      console.error(e);
      // İstersen küçük bir toast/alert:
      // alert((e as any)?.message || "Silme işlemi başarısız.");
    } finally {
      setDeleting(null);
    }
  }

  useEffect(() => {
    if (!detailTask) return;
    setEditForm({
      title: detailTask.title ?? "",
      description: detailTask.description ?? "",
      start_date: detailTask.start_date ?? "",
      end_date: detailTask.end_date ?? "",
      due_date: detailTask.due_date ?? detailTask.end_date ?? "",
      assignee_team: (detailTask.assignee_team ?? "") as any,
      status: (detailTask.status ?? "open") as "open" | "assigned" | "done",
    });
  }, [detailTask]);

  async function saveEdit() {
    if (!detailTask) return;
    setEditSaving(true);
    setEditMsg(null);
    try {
      const payload = {
        id: detailTask.id,
        title: editForm.title.trim(),
        description: editForm.description || null,
        start_date: editForm.start_date || null,
        end_date: editForm.end_date || null,
        due_date: editForm.due_date || null,
        assignee_team: editForm.assignee_team || null,
        status: editForm.status,
      };
      const r = await fetch("/api/tasks", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      const js = txt ? JSON.parse(txt) : {};
      if (!r.ok) throw new Error(js?.error || "Güncelleme başarısız");

      const updated = (js?.data ?? js?.task ?? null) as Task | null;
      if (updated?.id) {
        setTasks((prev) =>
          prev.map((t) =>
            t.id === updated.id
              ? {
                  ...t,
                  ...updated,
                  start_date:
                    updated.start_date ?? updated.due_date ?? t.start_date,
                  end_date: updated.end_date ?? updated.due_date ?? t.end_date,
                }
              : t
          )
        );
        setDetailTask((d) =>
          d && d.id === updated.id
            ? {
                ...d,
                ...updated,
                start_date:
                  updated.start_date ?? updated.due_date ?? d.start_date,
                end_date: updated.end_date ?? updated.due_date ?? d.end_date,
              }
            : d
        );
      } else {
        // garanti olsun
        const rr = await fetch("/api/tasks", { cache: "no-store" });
        const js2 = await rr.json().catch(() => ({}));
        const arr: Task[] = (Array.isArray(js2.data) ? js2.data : []).map(
          (t: any) => ({
            ...t,
            start_date: t.start_date ?? t.due_date ?? null,
            end_date: t.end_date ?? t.due_date ?? null,
          })
        );
        setTasks(arr);
      }

      setEditMsg("Kaydedildi ✔");
      setModalTab("detail");
    } catch (e: any) {
      setEditMsg(e?.message || "Hata oluştu");
    } finally {
      setEditSaving(false);
    }
  }

  const selectedTasks = useMemo(() => {
    if (!modalDate) return [];
    return tasksForView.filter((t) => isOnDay(t, modalDate));
  }, [tasksForView, modalDate]);

  /* ==== UI ==== */
  return (
    <section>
      {/* Başlık / kontroller */}
      <div className="mb-6 flex items-center justify-between">
        <h2 className="text-xl font-semibold">Takvim</h2>
        <div className="flex items-center gap-2">
          <button
            className="btn btn-ghost"
            onClick={() =>
              setMonth((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))
            }
          >
            ← Önceki
          </button>
          <div className="px-3 py-1.5 rounded-xl border border-white/10">
            {month.toLocaleString("tr-TR", { month: "long", year: "numeric" })}
          </div>
          <button
            className="btn btn-ghost"
            onClick={() =>
              setMonth((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))
            }
          >
            Sonraki →
          </button>
          <button
            className="btn btn-primary"
            onClick={() => setMonth(startOfMonth(new Date()))}
          >
            Bugün
          </button>
        </div>
      </div>

      {/* Haftanın günleri */}
      <div className="grid grid-cols-7 text-xs text-slate-400 mb-1 px-1">
        {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => (
          <div key={d} className="px-2 py-2">
            {d}
          </div>
        ))}
      </div>

      {/* 6x7 Grid */}
      <div className="grid grid-cols-7 gap-2">
        {days.grid.map((d, i) => {
          const key = fmtYMD(d);
          const inMonth = d.getMonth() === month.getMonth();
          const isToday = key === fmtYMD(new Date());
          const itemsToday = tasksForView.filter((t) => isOnDay(t, key));
          const groups = summarizeByTeam(itemsToday, key);
          const doneCount = itemsToday.filter(
            (t) => t.status === "done"
          ).length;
          const hasDone = doneCount > 0;

          return (
            <button
              key={i}
              type="button"
              onClick={() => {
                setModalDate(key);
                setModalTab("list");
                setDetailTask(null);
                setForm((f) => ({
                  ...f,
                  start_date: key,
                  end_date: key,
                  ok: null,
                  error: null,
                }));
              }}
              className={`card p-3 min-h-28 text-left w-full ${
                inMonth ? "" : "opacity-50"
              } ${isToday ? "today-cell ring-2 ring-sky-300/50" : ""} ${
                hasDone ? "ring-2 ring-emerald-400/40" : ""
              }`}
              aria-label={`${key} gün görevleri`}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="font-medium">{d.getDate()}</div>
                <div className="flex items-center gap-2">
                  {hasDone && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                      ✔ {doneCount}
                    </span>
                  )}
                  {isToday && <span className="text-blue-300">Bugün</span>}
                </div>
              </div>

              <div className="mt-2 space-y-1">
                {!canSeeTasks ? (
                  <div className="text-[11px] text-slate-400/80">
                    Giriş yapmadın
                  </div>
                ) : groups.length === 0 ? (
                  <div className="text-[11px] text-slate-400/80">Görev yok</div>
                ) : (
                  groups.slice(0, 4).map((g, idx) => (
                    <div
                      key={idx}
                      className={`rounded-lg px-2 py-1 text-[11px] ${g.cls}`}
                      title={g.label}
                    >
                      {g.label}
                    </div>
                  ))
                )}
                {canSeeTasks && groups.length > 4 && (
                  <div className="text-[11px] text-slate-400/80">
                    +{groups.length - 4} takım daha
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="mt-6 flex flex-wrap items-center gap-3 text-xs text-slate-400">
        <span className="ml-0">Takımlar:</span>
        <span className={teamChip["yazilim"]}>Yazılım</span>
        <span className={teamChip["mekanik"]}>Mekanik</span>
        <span className={teamChip["elektronik"]}>Elektronik</span>
        <span className={teamChip["sosyal"]}>Sosyal</span>
        <span className="badge">Genel</span>
      </div>

      {/* Modal */}
      {modalDate && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => {
              setModalDate(null);
              setDetailTask(null);
            }}
          />
          <div className="relative z-10 w-full sm:max-w-2xl mx-2 sm:mx-0 card p-4">
            {/* Başlık + sekmeler */}
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold">
                  {parseYMDLocal(modalDate).toLocaleDateString("tr-TR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                    year: "numeric",
                  })}
                </h3>

                <div className="mt-3 inline-flex rounded-lg border border-white/10 p-1 bg-white/5">
                  <button
                    className={`px-3 py-1.5 rounded-md text-sm ${
                      modalTab === "list" ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                    onClick={() => {
                      setModalTab("list");
                      setDetailTask(null);
                    }}
                  >
                    Görevler
                  </button>

                  <button
                    className={`px-3 py-1.5 rounded-md text-sm ${
                      modalTab === "new" ? "bg-white/10" : "hover:bg-white/5"
                    }`}
                    onClick={() => {
                      setModalTab("new");
                      setDetailTask(null);
                    }}
                  >
                    Yeni Görev
                  </button>

                  {detailTask && (
                    <button
                      className={`px-3 py-1.5 rounded-md text-sm ${
                        modalTab === "detail"
                          ? "bg-white/10"
                          : "hover:bg-white/5"
                      }`}
                      onClick={() => setModalTab("detail")}
                    >
                      Görev Detayı
                    </button>
                  )}

                  {detailTask &&
                    (meRole === "admin" || meRole === "captain") && (
                      <button
                        className={`px-3 py-1.5 rounded-md text-sm ${
                          modalTab === "edit"
                            ? "bg-white/10"
                            : "hover:bg-white/5"
                        }`}
                        onClick={() => setModalTab("edit")}
                      >
                        Düzenle
                      </button>
                    )}
                </div>
              </div>

              <button
                className="btn btn-ghost px-2 py-1"
                onClick={() => {
                  setModalDate(null);
                  setDetailTask(null);
                }}
                aria-label="Kapat"
                title="Kapat"
              >
                ✕
              </button>
            </div>

            {/* LIST */}
            {modalTab === "list" && (
              <div className="mt-3">
                {!canSeeTasks ? (
                  <div className="text-sm text-slate-300">
                    Görevleri görmek için lütfen giriş yap.
                  </div>
                ) : selectedTasks.length === 0 ? (
                  <div className="text-sm text-slate-400">Görev yok.</div>
                ) : (
                  <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                    {selectedTasks
                      .slice()
                      .sort((a, b) => {
                        const ta = (a.assignee_team ?? "zz").toString();
                        const tb = (b.assignee_team ?? "zz").toString();
                        return ta.localeCompare(tb);
                      })
                      .map((t) => {
                        const team = t.assignee_team ?? null;
                        const borderCls = team
                          ? `border-l-2 ${
                              team === "yazilim"
                                ? "border-sky-400"
                                : team === "mekanik"
                                ? "border-amber-400"
                                : team === "elektronik"
                                ? "border-emerald-400"
                                : "border-fuchsia-400"
                            }`
                          : "border-l-2 border-slate-400";

                        const as = getAssignees(t);

                        return (
                          <div
                            key={t.id}
                            className={`rounded-xl border p-3 ${borderCls} ${
                              t.status === "done"
                                ? "border-emerald-400/60 bg-emerald-500/10"
                                : "border-white/10 bg-white/5"
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="font-medium leading-tight text-slate-100 line-clamp-2">
                                {t.title}
                              </div>
                              <div className="flex flex-wrap items-center gap-2">
                                {renderAssignees(as, t)}
                                {team && (
                                  <span className={teamChip[team]}>
                                    {teamLabel[team]}
                                  </span>
                                )}
                              </div>
                            </div>

                            {(t.start_date || t.end_date || t.due_date) && (
                              <div className="mt-1 text-[11px] text-slate-400">
                                {(() => {
                                  const sd = (t.start_date ?? t.due_date)!;
                                  const ed = (t.end_date ?? t.due_date)!;
                                  const sdp = parseYMDLocal(
                                    sd
                                  ).toLocaleDateString("tr-TR", {
                                    day: "2-digit",
                                    month: "short",
                                  });
                                  const edp = parseYMDLocal(
                                    ed
                                  ).toLocaleDateString("tr-TR", {
                                    day: "2-digit",
                                    month: "short",
                                  });
                                  return sd === ed
                                    ? `Tarih: ${sdp}`
                                    : `Tarih: ${sdp} – ${edp}`;
                                })()}
                              </div>
                            )}

                            {t.description && (
                              <p className="mt-2 text-sm leading-relaxed text-slate-200/90 line-clamp-3">
                                {t.description}
                              </p>
                            )}

                            <div className="mt-3 flex justify-end gap-2">
                              <button
                                className="btn btn-primary"
                                onClick={() => {
                                  setDetailTask(t);
                                  setModalTab("detail");
                                }}
                              >
                                Görevi aç
                              </button>

                              {(meRole === "admin" || meRole === "captain") && (
                                <>
                                  <button
                                    className="btn btn-ghost"
                                    onClick={() => {
                                      setDetailTask(t);
                                      setModalTab("edit");
                                    }}
                                  >
                                    Düzenle
                                  </button>
                                  <button
                                    className="px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition"
                                    onClick={() => deleteTask(t)}
                                    disabled={deleting === t.id}
                                    title="Görevi sil"
                                  >
                                    {deleting === t.id ? "Siliniyor…" : "Sil"}
                                  </button>
                                </>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            )}

            {/* NEW */}
            {modalTab === "new" && (
              <div className="mt-4">
                {meRole === "admin" || meRole === "captain" ? (
                  <form
                    className="grid gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitNewTask();
                    }}
                  >
                    <input
                      className="input-dark"
                      placeholder="Başlık"
                      value={form.title}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, title: e.target.value }))
                      }
                      required
                    />

                    <textarea
                      className="input-dark"
                      placeholder="Açıklama (ops.)"
                      value={form.description}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, description: e.target.value }))
                      }
                      rows={4}
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <div className="grid gap-1">
                        <label className="text-xs text-slate-400">
                          Başlangıç
                        </label>
                        <input
                          type="date"
                          className="date-dark"
                          value={form.start_date}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              start_date: e.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                      <div className="grid gap-1">
                        <label className="text-xs text-slate-400">Bitiş</label>
                        <input
                          type="date"
                          className="date-dark"
                          value={form.end_date}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, end_date: e.target.value }))
                          }
                          required
                        />
                      </div>
                    </div>

                    {/* Takım seç */}
                    <div className="grid gap-1">
                      <label className="text-xs text-slate-400">Takım</label>
                      <div className="relative">
                        <select
                          className="select-dark appearance-none pr-9"
                          value={form.assignee_team}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              assignee_team:
                                (e.target.value as Exclude<Team, null>) || "",
                              assignee_user_ids: [],
                            }))
                          }
                        >
                          <option value="">(Takım yok / Genel)</option>
                          <option value="yazilim">Yazılım</option>
                          <option value="mekanik">Mekanik</option>
                          <option value="elektronik">Elektronik</option>
                          <option value="sosyal">Sosyal</option>
                        </select>
                        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                          ▾
                        </span>
                      </div>
                    </div>

                    {/* Üye seç (çoklu) */}
                    <div className="grid gap-1">
                      <label className="text-xs text-slate-400">
                        Üyeler (çoklu, opsiyonel)
                      </label>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-2 max-h-48 overflow-y-auto">
                        {(() => {
                          if (filteredMembers.length === 0) {
                            return (
                              <div className="text-xs text-slate-400 px-1 py-1.5">
                                Bu takımda üye bulunamadı.
                              </div>
                            );
                          }
                          return (
                            <div className="grid gap-1">
                              {filteredMembers.map((m) => {
                                const checked = form.assignee_user_ids.includes(
                                  m.id
                                );
                                const label = displayName(m);
                                return (
                                  <label
                                    key={m.id}
                                    className="flex items-center gap-2 text-sm"
                                  >
                                    <input
                                      type="checkbox"
                                      className="accent-emerald-400"
                                      checked={checked}
                                      onChange={(e) => {
                                        const next = new Set(
                                          form.assignee_user_ids
                                        );
                                        if (e.target.checked) next.add(m.id);
                                        else next.delete(m.id);
                                        setForm((f) => ({
                                          ...f,
                                          assignee_user_ids: Array.from(next),
                                        }));
                                      }}
                                    />
                                    <span className="text-slate-200">
                                      {label}
                                    </span>
                                    {m.member_team && (
                                      <span className="ml-1 text-[10px] text-slate-400">
                                        ({teamLabel[m.member_team]})
                                      </span>
                                    )}
                                  </label>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                      <div className="text-[11px] text-slate-400">
                        Not: Üye seçersen görev o kişilere atanır; seçmezsen
                        takım/genel görevi olur.
                      </div>
                    </div>

                    {form.error && (
                      <div className="text-sm text-red-300">{form.error}</div>
                    )}
                    {form.ok && (
                      <div className="text-sm text-emerald-300">{form.ok}</div>
                    )}

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => setModalTab("list")}
                      >
                        Vazgeç
                      </button>
                      <button
                        className="btn btn-primary"
                        disabled={form.loading}
                      >
                        {form.loading ? "Kaydediliyor…" : "Ekle"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="text-sm text-slate-300">
                    Yeni görev eklemek için yetkin yok. (Sadece{" "}
                    <span className="badge">admin</span> /
                    <span className="badge">captain</span>)
                  </div>
                )}
              </div>
            )}

            {/* DETAIL */}
            {modalTab === "detail" && detailTask && (
              <div className="mt-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-lg font-semibold leading-tight">
                      {detailTask.title}
                    </div>
                    <div className="flex items-center gap-2">
                      {renderAssignees(getAssignees(detailTask), detailTask)}
                      {detailTask.assignee_team && (
                        <span className={teamChip[detailTask.assignee_team]}>
                          {teamLabel[detailTask.assignee_team]}
                        </span>
                      )}
                    </div>
                  </div>

                  {(detailTask.start_date ||
                    detailTask.end_date ||
                    detailTask.due_date) && (
                    <div className="mt-2 text-sm text-slate-300">
                      {(() => {
                        const sdRaw =
                          detailTask.start_date ?? detailTask.due_date ?? null;
                        const edRaw =
                          detailTask.end_date ?? detailTask.due_date ?? null;
                        const sdp = sdRaw
                          ? parseYMDLocal(sdRaw).toLocaleDateString("tr-TR", {
                              day: "2-digit",
                              month: "long",
                              year: "numeric",
                            })
                          : "—";
                        const edp = edRaw
                          ? parseYMDLocal(edRaw).toLocaleDateString("tr-TR", {
                              day: "2-digit",
                              month: "long",
                              year: "numeric",
                            })
                          : "—";
                        return `Başlangıç: ${sdp} • Bitiş: ${edp}`;
                      })()}
                    </div>
                  )}

                  {detailTask.description && (
                    <p className="mt-3 text-sm leading-relaxed text-slate-200/90 whitespace-pre-wrap">
                      {detailTask.description}
                    </p>
                  )}

                  <div className="mt-4 flex justify-between">
                    <button
                      className="btn btn-ghost"
                      onClick={() => {
                        setDetailTask(null);
                        setModalTab("list");
                      }}
                    >
                      Listeye dön
                    </button>

                    {(meRole === "admin" || meRole === "captain") && (
                      <div className="flex gap-2">
                        <button
                          className="btn btn-ghost"
                          onClick={() => setModalTab("edit")}
                        >
                          Düzenle
                        </button>
                        <button
                          className="px-4 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition"
                          onClick={() => deleteTask(detailTask)}
                          disabled={deleting === detailTask.id}
                          title="Görevi sil"
                        >
                          {deleting === detailTask.id ? "Siliniyor…" : "Sil"}
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* EDIT */}
            {modalTab === "edit" &&
              detailTask &&
              (meRole === "admin" || meRole === "captain") && (
                <div className="mt-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 grid gap-3">
                    <div className="text-base font-semibold">
                      Görevi Düzenle
                    </div>

                    <label className="grid gap-1">
                      <span className="text-xs text-slate-400">Başlık</span>
                      <input
                        className="input-dark"
                        value={editForm.title}
                        onChange={(e) =>
                          setEditForm({ ...editForm, title: e.target.value })
                        }
                        required
                      />
                    </label>

                    <label className="grid gap-1">
                      <span className="text-xs text-slate-400">Açıklama</span>
                      <textarea
                        className="input-dark"
                        rows={4}
                        value={editForm.description}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            description: e.target.value,
                          })
                        }
                      />
                    </label>

                    <div className="grid grid-cols-3 gap-2">
                      <label className="grid gap-1">
                        <span className="text-xs text-slate-400">
                          Başlangıç
                        </span>
                        <input
                          type="date"
                          className="date-dark"
                          value={editForm.start_date}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              start_date: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs text-slate-400">Bitiş</span>
                        <input
                          type="date"
                          className="date-dark"
                          value={editForm.end_date}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              end_date: e.target.value,
                            })
                          }
                        />
                      </label>
                      <label className="grid gap-1">
                        <span className="text-xs text-slate-400">
                          Son Tarih
                        </span>
                        <input
                          type="date"
                          className="date-dark"
                          value={editForm.due_date}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              due_date: e.target.value,
                            })
                          }
                        />
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <label className="grid gap-1">
                        <span className="text-xs text-slate-400">Takım</span>
                        <select
                          className="select-dark"
                          value={editForm.assignee_team}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              assignee_team:
                                (e.target.value as any as Exclude<
                                  Team,
                                  null
                                >) || "",
                            })
                          }
                        >
                          <option value="">(Takım yok / Genel)</option>
                          <option value="yazilim">Yazılım</option>
                          <option value="mekanik">Mekanik</option>
                          <option value="elektronik">Elektronik</option>
                          <option value="sosyal">Sosyal</option>
                        </select>
                      </label>

                      <label className="grid gap-1">
                        <span className="text-xs text-slate-400">Durum</span>
                        <select
                          className="select-dark"
                          value={editForm.status}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              status: e.target.value as
                                | "open"
                                | "assigned"
                                | "done",
                            })
                          }
                        >
                          <option value="open">open</option>
                          <option value="assigned">assigned</option>
                          <option value="done">done</option>
                        </select>
                      </label>
                    </div>

                    {editMsg && (
                      <div
                        className={`text-sm ${
                          editMsg.includes("✔")
                            ? "text-emerald-300"
                            : "text-red-300"
                        }`}
                      >
                        {editMsg}
                      </div>
                    )}

                    <div className="flex justify-end gap-2">
                      <button
                        className="btn btn-ghost"
                        onClick={() => setModalTab("detail")}
                      >
                        Vazgeç
                      </button>
                      <button
                        className="btn btn-primary"
                        onClick={saveEdit}
                        disabled={editSaving}
                      >
                        {editSaving ? "Kaydediliyor…" : "Kaydet"}
                      </button>
                    </div>
                  </div>
                </div>
              )}

            <div className="mt-4 flex justify-end">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setModalDate(null);
                  setDetailTask(null);
                }}
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bugün hücresini belirginleştir */}
      <style jsx global>{`
        .card.today-cell {
          background: linear-gradient(
              180deg,
              rgba(56, 189, 248, 0.14),
              rgba(56, 189, 248, 0.08)
            ),
            rgba(255, 255, 255, 0.05);
          border-color: rgba(125, 211, 252, 0.55) !important; /* sky-300 */
          box-shadow: inset 0 0 0 2px rgba(125, 211, 252, 0.35);
        }
      `}</style>
    </section>
  );
}
