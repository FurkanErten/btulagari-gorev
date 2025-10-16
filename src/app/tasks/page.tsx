/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import useSWR from "swr";
import Link from "next/link";
import { useState, useMemo, useCallback, useEffect } from "react";

/* ==== Tipler ==== */
type Role = "admin" | "captain" | "member" | null;
type Team = "yazilim" | "mekanik" | "elektronik" | "sosyal" | null;

type Task = {
  id: string;
  title: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  due_date?: string | null;
  status: "open" | "assigned" | "done";

  assignee_user_id?: string | null;
  assignees?: Array<
    | string
    | {
        id?: string;
        user_id?: string;
        userId?: string;
        uid?: string;
        member_id?: string;
        profile_id?: string;
        done?: boolean;
        is_done?: boolean;
      }
  >;
  assignee_team?: Team | null;
};

type MeRes = { userId: string | null; role: Role };
type TasksRes = { data: Task[] };

type Member = {
  id: string;
  email: string;
  role: Exclude<Role, null>;
  member_team: Exclude<Team, null> | null;
  first_name: string | null;
  last_name: string | null;
};

/* ==== Sabitler ==== */
const TASKS_API = "/api/tasks";

/* ==== SWR fetcher ==== */
const fetcher = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url, { cache: "no-store", credentials: "include" });
  const txt = await r.text();
  const js = txt ? JSON.parse(txt) : {};
  if (!r.ok) throw new Error((js as any)?.error || `HTTP ${r.status}`);
  return js as T;
};

/* ==== Yardımcılar ==== */
const fmtYMD = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};
const parseYMDLocal = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
};
const startOfWeekMon = (d: Date) => {
  const day = d.getDay(); // 0: Paz, 1: Pzt
  const diff = day === 0 ? -6 : 1 - day;
  const base = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  base.setDate(base.getDate() + diff);
  return base;
};
const addDays = (d: Date, n: number) => {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
};
// Istanbul odaklı "bugün"
const todayYMD = (tz = "Europe/Istanbul") => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const y = parts.find((p) => p.type === "year")!.value;
  const m = parts.find((p) => p.type === "month")!.value;
  const d = parts.find((p) => p.type === "day")!.value;
  return `${y}-${m}-${d}`;
};

const teamLabel: Record<Exclude<Team, null>, string> = {
  yazilim: "Yazılım",
  mekanik: "Mekanik",
  elektronik: "Elektronik",
  sosyal: "Sosyal",
};
const teamRow: Record<Exclude<Team, null>, string> = {
  yazilim:
    "border-l-2 border-sky-400 bg-sky-400/10 text-sky-100 hover:bg-sky-400/15",
  mekanik:
    "border-l-2 border-amber-400 bg-amber-400/10 text-amber-100 hover:bg-amber-400/15",
  elektronik:
    "border-l-2 border-emerald-400 bg-emerald-400/10 text-emerald-100 hover:bg-emerald-400/15",
  sosyal:
    "border-l-2 border-fuchsia-400 bg-fuchsia-400/10 text-fuchsia-100 hover:bg-fuchsia-400/15",
};
const generalRow =
  "border-l-2 border-slate-400 bg-white/5 text-slate-200 hover:bg-white/10";

/* Takım sırası ve anahtar yardımcıları */
const teamOrder: Array<Exclude<Team, null> | "genel"> = [
  "yazilim",
  "mekanik",
  "elektronik",
  "sosyal",
  "genel",
];
const getTeamKey = (t: Task) =>
  ((t.assignee_team as Exclude<Team, null>) ?? "genel") as
    | Exclude<Team, null>
    | "genel";

/* ==== Assignee ipucu tipleri & yardımcılar ==== */
type AssigneeHint = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  email?: string | null;
};
type TaskWithHints = Task & {
  _assigneeHints?: Record<string, AssigneeHint>;
  _assigneeIds: string[];
};

const extractIdAndName = (v: any): AssigneeHint | null => {
  if (v == null) return null;
  if (typeof v === "string" || typeof v === "number") {
    return { id: String(v) };
  }
  const u = v.user ?? v;
  const id =
    u?.id ??
    u?.user_id ??
    u?.userId ??
    u?.uid ??
    u?.member_id ??
    u?.profile_id ??
    null;
  if (!id) return null;
  return {
    id: String(id),
    first_name: u?.first_name ?? u?.firstName ?? null,
    last_name: u?.last_name ?? u?.lastName ?? null,
    email: u?.email ?? u?.mail ?? null,
  };
};

const toIdArray = (val: any): string[] => {
  if (!val) return [];
  const arr = Array.isArray(val) ? val : [val];
  const ids = arr
    .map((v) => extractIdAndName(v)?.id ?? null)
    .filter((x): x is string => !!x && x.trim().length > 0);
  return Array.from(new Set(ids));
};

type AssigneeObj = { id: string; done: boolean };
const toAssigneeObj = (val: any): AssigneeObj[] => {
  if (!val) return [];
  const arr = Array.isArray(val) ? val : [val];
  return arr
    .map((x: any) => {
      if (typeof x === "string" || typeof x === "number") {
        return { id: String(x), done: false };
      }
      const rawId =
        x?.id ??
        x?.user_id ??
        x?.userId ??
        x?.uid ??
        x?.member_id ??
        x?.profile_id;
      const doneBool = Boolean(
        (typeof x?.done === "boolean" ? x.done : undefined) ??
          (typeof x?.is_done === "boolean" ? x.is_done : undefined) ??
          false
      );
      return rawId ? { id: String(rawId), done: doneBool } : null;
    })
    .filter((a): a is AssigneeObj => !!a && a.id.trim().length > 0);
};

const isDoneByMe = (t: Task, myId?: string | null) => {
  if (!myId) return false;
  const arr = toAssigneeObj(t.assignees ?? t.assignee_user_id);
  return arr.some((a) => a.id === myId && a.done);
};

export default function TasksPage() {
  /* ==== /api/me ==== */
  const { data: me, isLoading: meLoading } = useSWR<MeRes>("/api/me", fetcher);
  const role = me?.role ?? null;
  const userId = me?.userId ?? null;

  /* ==== /api/tasks ==== */
  const {
    data: tasksRes,
    isLoading: tasksLoading,
    error: tasksError,
    mutate: mutateTasks,
  } = useSWR<TasksRes>(userId ? TASKS_API : null, fetcher);

  // --- NORMALİZASYON + assignee hint + ID listesi ---
  const tasks: TaskWithHints[] = useMemo(() => {
    const raw = tasksRes?.data ?? [];
    return raw.map((t: any) => {
      const sourceArr = [
        ...(Array.isArray(t.assignees)
          ? t.assignees
          : t.assignees
          ? [t.assignees]
          : []),
        ...(t.assignee_user_id ? [t.assignee_user_id] : []),
      ];
      const hints: Record<string, AssigneeHint> = {};
      for (const s of sourceArr) {
        const h = extractIdAndName(s);
        if (h?.id) hints[h.id] = { ...(hints[h.id] ?? {}), ...h };
      }
      const _assigneeIds = toIdArray(t.assignees ?? t.assignee_user_id);
      return {
        ...(t as Task),
        _assigneeIds,
        _assigneeHints: hints,
      } as TaskWithHints;
    });
  }, [tasksRes]);

  /* ==== Üyeler ==== */
  const [members, setMembers] = useState<Member[]>([]);
  useEffect(() => {
    (async () => {
      if (!(role === "admin" || role === "captain" || role === "member"))
        return;
      try {
        const r = await fetch("/api/admin/members", {
          cache: "no-store",
          credentials: "include",
        });
        if (!r.ok) throw new Error(`members fetch fail: ${r.status}`);
        const txt = await r.text();
        const js = txt ? JSON.parse(txt) : {};
        const raw: any[] = Array.isArray(js) ? js : js?.items ?? js?.data ?? [];
        const ms: Member[] = raw
          .map((p: any) => {
            const u = p?.user ?? p;
            const id = u?.id ?? u?.user_id ?? u?.userId ?? u?.uid ?? null;
            if (!id) return null;
            return {
              id: String(id),
              email: u?.email ?? u?.mail ?? "",
              role: (u?.role ?? "member") as Member["role"],
              member_team: u?.member_team ?? u?.team ?? null,
              first_name: u?.first_name ?? u?.firstName ?? null,
              last_name: u?.last_name ?? u?.lastName ?? null,
            } as Member;
          })
          .filter(Boolean) as Member[];
        setMembers(ms);
      } catch {
        setMembers([]);
      }
    })();
  }, [role]);

  const membersById = useMemo(() => {
    const m: Record<string, Member> = {};
    for (const x of members) m[x.id] = x;
    return m;
  }, [members]);

  const displayName = (m?: Member | null) => {
    if (!m) return "";
    const full = `${m.first_name?.trim() || ""} ${
      m.last_name?.trim() || ""
    }`.trim();
    return full || m.email || m.id;
  };

  const renderAssignees = (
    ids?: string[] | any,
    hints?: Record<string, AssigneeHint>
  ) => {
    const safeIds = toIdArray(ids ?? []);
    if (safeIds.length === 0) return "—";
    return safeIds
      .map((uid) => {
        const m = membersById?.[uid];
        if (m) {
          const full = displayName(m);
          const base = full || uid.slice(0, 6);
          return uid === userId ? `${base} (sen)` : base;
        }
        const h = hints?.[uid];
        if (h) {
          const full = `${(h.first_name ?? "").toString().trim()} ${(
            h.last_name ?? ""
          )
            .toString()
            .trim()}`.trim();
          const base = full || h.email || uid.slice(0, 6);
          return uid === userId ? `${base} (sen)` : base;
        }
        return uid.slice(0, 6);
      })
      .join(", ");
  };

  /* ==== Görünür görevler: role & takım bazlı ==== */
  /* ==== Görünür görevler: role bazlı (member yalnızca kendi görevleri) ==== */
  const visibleTasks = useMemo(() => {
    if (!tasks || !userId) return [];

    // Kendi tamamladıklarımı "aktif" listeden düşelim
    const base = tasks.filter((t) => !isDoneByMe(t, userId));

    // Admin ve kaptan her şeyi görür
    if (role === "admin" || role === "captain") return base;

    // Member sadece kendine açıkça atanmış görevleri görür
    return base.filter((t) =>
      toIdArray(t.assignees ?? t.assignee_user_id).includes(userId)
    );
  }, [tasks, role, userId]);

  const myTasks = useMemo(
    () => visibleTasks.filter((t) => t._assigneeIds.includes(userId!)),
    [visibleTasks, userId]
  );

  const completedByMe = useMemo(
    () => (tasks ?? []).filter((t) => isDoneByMe(t, userId)),
    [tasks, userId]
  );

  const otherTasks = useMemo(
    () => visibleTasks.filter((t) => !t._assigneeIds.includes(userId!)),
    [visibleTasks, userId]
  );

  /* ==== Admin/Captain görünümü için takım bazlı gruplama ==== */
  const groupedForAdmins = useMemo(() => {
    if (!(role === "admin" || role === "captain")) return null;
    const map: Record<string, TaskWithHints[]> = {};
    for (const t of visibleTasks) {
      const k = getTeamKey(t);
      (map[k] ||= []).push(t);
    }
    for (const k of Object.keys(map)) {
      map[k].sort((a, b) => (a.status > b.status ? 1 : -1));
    }
    return map;
  }, [visibleTasks, role]);

  /* ==== Haftalık takvim state ==== */
  const [weekStart, setWeekStart] = useState<Date>(startOfWeekMon(new Date()));
  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );
  const todayKey = useMemo(() => todayYMD(), []);

  const [modalDate, setModalDate] = useState<string | null>(null);
  const [modalTab, setModalTab] = useState<"list" | "new" | "detail" | "edit">(
    "list"
  );
  const [detailTask, setDetailTask] = useState<TaskWithHints | null>(null);

  /* ==== Kart modal ==== */
  const [selected, setSelected] = useState<TaskWithHints | null>(null);

  /* ==== Yeni görev formu ==== */
  const [form, setForm] = useState<{
    title: string;
    description: string;
    assignee_team: Exclude<Team, null> | "";
    assignee_user_ids: string[];
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

  /* ==== Düzenleme formu (modal içi) ==== */
  const [editForm, setEditForm] = useState({
    title: "",
    description: "",
    start_date: "",
    end_date: "",
    due_date: "",
    assignee_team: "" as "" | Exclude<Team, null>,
    status: "open" as Task["status"],
  });
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!detailTask) return;
    setEditForm({
      title: detailTask.title ?? "",
      description: detailTask.description ?? "",
      start_date: detailTask.start_date ?? "",
      end_date: detailTask.end_date ?? "",
      due_date: detailTask.due_date ?? "",
      assignee_team: (detailTask.assignee_team ?? "") as any,
      status: detailTask.status ?? "open",
    });
  }, [detailTask]);

  /* ====== EDIT: /api/tasks üzerinden PUT + body'de id ====== */
  async function saveEdit() {
    if (!detailTask) return;
    setEditSaving(true);
    setEditMsg(null);
    try {
      const payload = {
        id: detailTask.id, // <<< aynı endpoint, body'de id
        title: editForm.title.trim(),
        description: editForm.description || null,
        start_date: editForm.start_date || null,
        end_date: editForm.end_date || null,
        due_date: editForm.due_date || null,
        assignee_team: editForm.assignee_team || null,
        status: editForm.status,
      };
      const r = await fetch(TASKS_API, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      const js = txt ? JSON.parse(txt) : {};
      if (!r.ok) throw new Error(js?.error || "Güncelleme başarısız");
      await mutateTasks();
      setEditMsg("Kaydedildi ✔");
      setModalTab("detail");
    } catch (e: any) {
      setEditMsg(e?.message || "Hata oluştu");
    } finally {
      setEditSaving(false);
    }
  }

  /* ==== Takıma göre filtrelenmiş üyeler ==== */
  const filteredMembers = useMemo(() => {
    const team = form.assignee_team || null;
    let list = members;
    if (team) list = list.filter((m) => m.member_team === team);
    return list
      .slice()
      .sort((a, b) => displayName(a).localeCompare(displayName(b), "tr"));
  }, [members, form.assignee_team]);

  /* ==== Yardımcılar (takvim) ==== */
  const isOnDay = (t: Task, dayStr: string) => {
    const sd = t.start_date ?? t.due_date ?? null;
    const ed = t.end_date ?? t.due_date ?? null;
    if (!sd && !ed) return false;
    return sd === dayStr || ed === dayStr;
  };

  const summarizeByTeam = (list: Task[], dayStr: string) => {
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
          ? { label: `Genel · ${counts[k]}`, cls: generalRow }
          : {
              label: `${teamLabel[k as Exclude<Team, null>]} · ${counts[k]}`,
              cls: teamRow[k as Exclude<Team, null>],
            }
      );
  };

  const weekLabel = useMemo(() => {
    const a = weekDays[0];
    const b = weekDays[6];
    return `${a.toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
    })} – ${b.toLocaleDateString("tr-TR", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    })}`;
  }, [weekDays]);

  /* ==== Toggle: Yaptım ⇄ Geri Al ==== */
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());

  const toggleDone = useCallback(
    async (task: Task) => {
      if (!userId) return;
      if (busyIds.has(task.id)) return;

      const iAmDone = isDoneByMe(task, userId);
      const next = !iAmDone;

      const optimistic: TasksRes = {
        data: (tasksRes?.data ?? []).map((t) => {
          if (t.id !== task.id) return t;

          const arr = (
            Array.isArray(t.assignees)
              ? t.assignees
              : t.assignees
              ? [t.assignees]
              : []
          ).map((x: any) => {
            if (typeof x === "string" || typeof x === "number") {
              return { id: String(x), done: false };
            }
            const rawId =
              x?.id ??
              x?.user_id ??
              x?.userId ??
              x?.uid ??
              x?.member_id ??
              x?.profile_id;
            const doneBool =
              (typeof x?.done === "boolean" ? x.done : undefined) ??
              (typeof x?.is_done === "boolean" ? x.is_done : undefined) ??
              false;
            return rawId
              ? { id: String(rawId), done: Boolean(doneBool) }
              : null;
          });
          const clean = arr.filter(
            (a: any): a is { id: string; done: boolean } =>
              !!a && a.id && a.id.trim().length > 0
          );

          let found = false;
          const updated = clean.map((a) => {
            if (a.id === String(userId)) {
              found = true;
              return { ...a, done: next };
            }
            return a;
          });
          if (!found) updated.push({ id: String(userId), done: next });

          return { ...t, assignees: updated } as Task;
        }),
      };

      setBusyIds((s) => new Set(s).add(task.id));
      try {
        await mutateTasks(
          async () => {
            const r = await fetch(`${TASKS_API}/${task.id}/complete`, {
              method: "PATCH",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                done: next,
                is_done: next,
                assignee_user_id: userId,
                user_id: userId,
                assigneeId: userId,
              }),
            });
            const txt = await r.text();
            if (!r.ok)
              throw new Error(txt || `HTTP ${r.status} ${r.statusText}`);
            return await fetcher<TasksRes>(TASKS_API);
          },
          {
            optimisticData: optimistic,
            rollbackOnError: true,
            populateCache: true,
            revalidate: false,
          }
        );
      } catch (e: any) {
        alert(`Güncelleme başarısız: ${e?.message || e}`);
      } finally {
        setBusyIds((s) => {
          const n = new Set(s);
          n.delete(task.id);
          return n;
        });
      }
    },
    [mutateTasks, userId, busyIds, tasksRes]
  );

  const removeTask = useCallback(
    async (id: string) => {
      const ok = confirm("Bu görevi silmek istiyor musun?");
      if (!ok) return;

      const optimisticData: TasksRes = {
        data: (tasksRes?.data ?? []).filter((t) => t.id !== id),
      };

      try {
        await mutateTasks(
          async () => {
            // 1) Önce /api/tasks/:id DELETE dene
            let r = await fetch(`${TASKS_API}/${encodeURIComponent(id)}`, {
              method: "DELETE",
              credentials: "include",
            });

            // 2) 404/405 ise fallback: /api/tasks DELETE + body {id}
            if (r.status === 404 || r.status === 405) {
              r = await fetch(TASKS_API, {
                method: "DELETE",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ id }),
              });
            }

            // 3) Başarısızsa kontrollü olarak reject et (rollback tetiklenir)
            if (!r.ok) {
              const txt = await r.text();
              let msg: string = "Görev silinemedi";
              try {
                const js = txt ? JSON.parse(txt) : {};
                msg = (js?.error as string) || msg;
              } catch {
                if (txt) msg = txt;
              }
              return Promise.reject(new Error(msg));
            }

            // 4) Başarılıysa listeyi tazele
            return await fetcher<TasksRes>(TASKS_API);
          },
          {
            optimisticData,
            rollbackOnError: true,
            populateCache: true,
            revalidate: false,
          }
        );
      } catch (e: any) {
        // Hata burada yakalanıyor; overlay yerine kullanıcıya mesaj göster
        alert(e?.message || "Silme işlemi başarısız.");
        // İstersen cache’i yeniden doğrula:
        await mutateTasks();
      }
    },
    [mutateTasks, tasksRes]
  );

  /* ==== Haftalık modal: seçilen güne ait GÖRÜNÜR görevler ==== */
  const selectedDayTasks = useMemo(() => {
    if (!modalDate) return [];
    return visibleTasks.filter((t) => isOnDay(t, modalDate));
  }, [visibleTasks, modalDate]);

  /* ==== Yeni görev ekle ==== */
  async function submitNewTask() {
    if (!form.start_date || !form.end_date) {
      setForm((f) => ({
        ...f,
        error: "Başlangıç ve bitiş tarihlerini seçin.",
      }));
      return;
    }
    if (form.end_date < form.start_date) {
      setForm((f) => ({ ...f, error: "Bitiş, başlangıçtan önce olamaz." }));
      return;
    }

    setForm((f) => ({ ...f, loading: true, error: null, ok: null }));
    try {
      const payload: any = {
        title: form.title.trim(),
        description: form.description || null,
        status: "open",
        start_date: form.start_date,
        end_date: form.end_date,
        due_date: form.end_date,
        assignee_team: form.assignee_team || null,
      };
      if (form.assignee_user_ids.length > 0) {
        payload.assignee_user_ids = form.assignee_user_ids;
        payload.assignee_user_id = form.assignee_user_ids[0];
      }

      const r = await fetch(TASKS_API, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(payload),
      });
      const txt = await r.text();
      const js = txt ? JSON.parse(txt) : {};
      if (!r.ok) throw new Error(js?.error || "Görev eklenemedi");

      await mutateTasks();
      setForm({
        title: "",
        description: "",
        assignee_team: "",
        assignee_user_ids: [],
        start_date: modalDate || "",
        end_date: modalDate || "",
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

  /* ==== Yüklenme / yetki durumları ==== */
  if (meLoading) {
    return (
      <section className="text-sm text-slate-400">/api/me yükleniyor…</section>
    );
  }
  if (!userId) {
    return (
      <section className="grid gap-3">
        <div className="text-sm text-amber-300">
          Oturum yok. Lütfen giriş yap.
        </div>
        <Link href="/auth" className="btn btn-primary w-fit">
          Giriş Sayfasına Git
        </Link>
      </section>
    );
  }
  if (tasksLoading)
    return (
      <section className="text-sm text-slate-400">Görevler yükleniyor…</section>
    );
  if (tasksError) {
    return (
      <section className="text-sm text-red-300">
        Görevler alınamadı.
        <button
          type="button"
          className="btn btn-ghost ml-2"
          onClick={() => mutateTasks()}
        >
          Yenile
        </button>
      </section>
    );
  }

  /* === Aktif görev bayrağı === */
  const hasActive = !!(visibleTasks && visibleTasks.length > 0);

  return (
    <section className="grid gap-6">
      {/* Küçük durum etiketi */}
      <div className="text-xs text-emerald-300">
        Rol: {role ?? "—"} • Kullanıcı: {userId.slice(0, 8)}…
      </div>

      {/* ===== Haftalık Takvim Şeridi ===== */}
      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Haftalık</h2>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost"
              onClick={() => setWeekStart((d) => addDays(d, -7))}
              aria-label="Önceki hafta"
            >
              ←
            </button>
            <div className="px-3 py-1.5 rounded-xl border border-white/10">
              {weekLabel}
            </div>
            <button
              className="btn btn-ghost"
              onClick={() => setWeekStart((d) => addDays(d, +7))}
              aria-label="Sonraki hafta"
            >
              →
            </button>
            <button
              className="btn btn-primary"
              onClick={() => setWeekStart(startOfWeekMon(new Date()))}
            >
              Bugün
            </button>
          </div>
        </div>

        <div className="grid grid-cols-7 gap-2">
          {weekDays.map((d) => {
            const key = fmtYMD(d);
            const isToday = key === todayKey;

            const items = visibleTasks.filter((t) => isOnDay(t, key));
            const groups = summarizeByTeam(items, key);

            const myDoneCount = (tasks ?? []).filter(
              (t) => isOnDay(t, key) && isDoneByMe(t, userId)
            ).length;
            const hasDone = myDoneCount > 0;

            return (
              <button
                key={key}
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
                className={`card p-3 text-left min-h-28 ${
                  isToday ? "today-cell ring-2 ring-sky-300/50" : ""
                } ${hasDone ? "ring-2 ring-emerald-400/40" : ""}`}
                aria-label={`${d.toLocaleDateString("tr-TR")} gün görevleri`}
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="font-medium">
                    {d.toLocaleDateString("tr-TR", { weekday: "short" })}
                  </div>
                  <div className="flex items-center gap-2">
                    {hasDone && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-200">
                        ✔ {myDoneCount}
                      </span>
                    )}
                    <span className="text-slate-400">{d.getDate()}</span>
                  </div>
                </div>

                <div className="mt-2 space-y-1">
                  {groups.length === 0 ? (
                    <div className="text-[11px] text-slate-400/80">
                      Görev yok
                    </div>
                  ) : (
                    groups.slice(0, 3).map((g, idx) => (
                      <div
                        key={idx}
                        className={`rounded-lg px-2 py-1 text-[11px] ${g.cls}`}
                      >
                        {g.label}
                      </div>
                    ))
                  )}
                  {groups.length > 3 && (
                    <div className="text-[11px] text-slate-400/80">
                      +{groups.length - 3} takım
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ===== Kart Görünümü — Bana Atananlar Üstte ===== */}
      {!hasActive && (
        <div className="text-sm text-slate-400">
          Aktif görev yok.
          <button
            type="button"
            className="btn btn-ghost ml-2"
            onClick={() => mutateTasks()}
          >
            Yenile
          </button>
        </div>
      )}

      {hasActive && (
        <div className="grid gap-6">
          {/* --- Bana atananlar --- */}
          {myTasks.length > 0 && (
            <div className="grid gap-2">
              <div className="text-sm text-emerald-300 font-medium">
                Bana Atanan Görevler ({myTasks.length})
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                {myTasks.map((t) => {
                  const iAmDone = isDoneByMe(t, userId);
                  const loading = busyIds.has(t.id);
                  return (
                    <div
                      key={t.id}
                      className={`card h-48 flex flex-col justify-between text-left transition hover:translate-y-[-2px] hover:bg-white/10
                        ${
                          t.status === "done"
                            ? "border border-emerald-400/60 bg-emerald-500/10"
                            : "border border-emerald-400/20"
                        }`}
                    >
                      <div
                        onClick={() => setSelected(t as TaskWithHints)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <h3 className="font-semibold line-clamp-2">
                            {t.title}
                          </h3>
                          <span className="badge badge-assigned">bana</span>
                        </div>
                        {t.description && (
                          <p className="mt-2 text-sm text-slate-400 line-clamp-3 leading-snug">
                            {t.description}
                          </p>
                        )}
                        <div className="mt-2 text-[11px] text-slate-400">
                          Atananlar:{" "}
                          {renderAssignees(
                            (t as any)._assigneeIds ?? t.assignees,
                            (t as any)._assigneeHints
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-2">
                        {(role === "admin" || role === "captain") && (
                          <button
                            type="button"
                            className="btn btn-ghost"
                            onClick={() => {
                              const key =
                                t.start_date ||
                                t.end_date ||
                                t.due_date ||
                                todayYMD();
                              setModalDate(key);
                              setDetailTask(t as TaskWithHints);
                              setModalTab("edit");
                            }}
                          >
                            Düzenle
                          </button>
                        )}
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => toggleDone(t)}
                            className={
                              iAmDone
                                ? "btn btn-ghost border border-emerald-400/40"
                                : "btn btn-primary"
                            }
                            disabled={loading}
                            title={iAmDone ? "Geri al" : "Yaptım"}
                          >
                            {loading ? "..." : iAmDone ? "Geri Al" : "Yaptım"}
                          </button>
                          {role === "admin" && (
                            <button
                              type="button"
                              onClick={() => removeTask(t.id)}
                              className="btn btn-ghost text-red-400"
                            >
                              Sil
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* --- Diğer Görevler / Admin-Captain için takım takım görünüm --- */}
          {role === "admin" || role === "captain" ? (
            <div className="grid gap-6">
              {groupedForAdmins &&
                teamOrder
                  .filter((k) => groupedForAdmins[k]?.length)
                  .map((k) => {
                    const list = groupedForAdmins[k]!;
                    const label =
                      k === "genel"
                        ? "Genel"
                        : teamLabel[k as Exclude<Team, null>];
                    return (
                      <div key={k} className="grid gap-2">
                        <div className="text-sm text-slate-300 font-medium">
                          {label} ({list.length})
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                          {list.map((t) => {
                            const assignedToMe = t._assigneeIds.includes(
                              userId!
                            );
                            const iAmDone = isDoneByMe(t, userId);
                            const loading = busyIds.has(t.id);
                            return (
                              <div
                                key={t.id}
                                className={`card h-48 flex flex-col justify-between text-left transition hover:translate-y-[-2px] hover:bg-white/10 ${
                                  t.status === "done"
                                    ? "border border-emerald-400/40 bg-emerald-500/10"
                                    : ""
                                }`}
                              >
                                <div
                                  onClick={() =>
                                    setSelected(t as TaskWithHints)
                                  }
                                  className="cursor-pointer"
                                >
                                  <div className="flex items-start justify-between gap-2">
                                    <h3 className="font-semibold line-clamp-2">
                                      {t.title}
                                    </h3>
                                    <span className="badge">{t.status}</span>
                                  </div>
                                  {t.description && (
                                    <p className="mt-2 text-sm text-slate-400 line-clamp-3 leading-snug">
                                      {t.description}
                                    </p>
                                  )}
                                  <div className="mt-2 text-[11px] text-slate-400">
                                    Atananlar:{" "}
                                    {renderAssignees(
                                      (t as any)._assigneeIds ?? t.assignees,
                                      (t as any)._assigneeHints
                                    ) || "—"}
                                  </div>
                                </div>

                                <div className="flex items-center justify-between pt-2">
                                  {(role === "admin" || role === "captain") && (
                                    <button
                                      type="button"
                                      className="btn btn-ghost"
                                      onClick={() => {
                                        const key =
                                          t.start_date ||
                                          t.end_date ||
                                          t.due_date ||
                                          todayYMD();
                                        setModalDate(key);
                                        setDetailTask(t as TaskWithHints);
                                        setModalTab("edit");
                                      }}
                                    >
                                      Düzenle
                                    </button>
                                  )}
                                  <div className="flex gap-2">
                                    {assignedToMe && (
                                      <button
                                        type="button"
                                        onClick={() => toggleDone(t)}
                                        className={
                                          iAmDone
                                            ? "btn btn-ghost border border-emerald-400/40"
                                            : "btn btn-primary"
                                        }
                                        disabled={loading}
                                        title={iAmDone ? "Geri al" : "Yaptım"}
                                      >
                                        {loading
                                          ? "..."
                                          : iAmDone
                                          ? "Geri Al"
                                          : "Yaptım"}
                                      </button>
                                    )}
                                    {(role === "admin" ||
                                      role === "captain") && (
                                      <button
                                        type="button"
                                        onClick={() => removeTask(t.id)}
                                        className="btn btn-ghost text-red-400"
                                      >
                                        Sil
                                      </button>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
              {(!groupedForAdmins ||
                !teamOrder.some((k) => groupedForAdmins[k]?.length)) && (
                <div className="text-sm text-slate-400">
                  Gösterilecek görev yok.
                </div>
              )}
            </div>
          ) : (
            // Member görünümü: klasik "Diğer Görevler"
            <div className="grid gap-2">
              <div className="text-sm text-slate-300 font-medium">
                Diğer Görevler ({otherTasks.length})
              </div>
              {otherTasks.length === 0 ? (
                <div className="text-sm text-slate-400">Diğer görev yok.</div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
                  {otherTasks.map((t) => {
                    const assignedToMe = t._assigneeIds.includes(userId!);
                    const iAmDone = isDoneByMe(t, userId);
                    const loading = busyIds.has(t.id);

                    return (
                      <div
                        key={t.id}
                        className={`card h-48 flex flex-col justify-between text-left transition hover:translate-y-[-2px] hover:bg-white/10 ${
                          t.status === "done"
                            ? "border border-emerald-400/40 bg-emerald-500/10"
                            : ""
                        }`}
                      >
                        <div
                          onClick={() => setSelected(t as TaskWithHints)}
                          className="cursor-pointer"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold line-clamp-2">
                              {t.title}
                            </h3>
                            <span className="badge">{t.status}</span>
                          </div>
                          {t.description && (
                            <p className="mt-2 text-sm text-slate-400 line-clamp-3 leading-snug">
                              {t.description}
                            </p>
                          )}
                          <div className="mt-2 text-[11px] text-slate-400">
                            Atananlar:{" "}
                            {renderAssignees(
                              (t as any)._assigneeIds ?? t.assignees,
                              (t as any)._assigneeHints
                            ) || "—"}
                          </div>
                        </div>

                        <div className="flex items-center justify-between pt-2">
                          {(role === "admin" || role === "captain") && (
                            <button
                              type="button"
                              className="btn btn-ghost"
                              onClick={() => {
                                const key =
                                  t.start_date ||
                                  t.end_date ||
                                  t.due_date ||
                                  todayYMD();
                                setModalDate(key);
                                setDetailTask(t as TaskWithHints);
                                setModalTab("edit");
                              }}
                            >
                              Düzenle
                            </button>
                          )}
                          <div className="flex gap-2">
                            {assignedToMe && (
                              <button
                                type="button"
                                onClick={() => toggleDone(t)}
                                className={
                                  iAmDone
                                    ? "btn btn-ghost border border-emerald-400/40"
                                    : "btn btn-primary"
                                }
                                disabled={loading}
                                title={iAmDone ? "Geri al" : "Yaptım"}
                              >
                                {loading
                                  ? "..."
                                  : iAmDone
                                  ? "Geri Al"
                                  : "Yaptım"}
                              </button>
                            )}
                            {role === "admin" && (
                              <button
                                type="button"
                                onClick={() => removeTask(t.id)}
                                className="btn btn-ghost text-red-400"
                              >
                                Sil
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ===== Tamamlanan Görevler (benim tamamladıklarım) ===== */}
      {completedByMe.length > 0 ? (
        <div className="grid gap-2">
          <div className="text-sm text-slate-400 font-medium">
            Tamamlanan Görevler ({completedByMe.length})
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">
            {completedByMe.map((t) => {
              const iAmDone = isDoneByMe(t, userId);
              const loading = busyIds.has(t.id);
              return (
                <div
                  key={t.id}
                  className="card h-44 flex flex-col justify-between text-left border border-emerald-400/50 bg-emerald-500/10"
                  title="Bu görevi tamamladın"
                >
                  <div
                    onClick={() => setSelected(t as TaskWithHints)}
                    className="cursor-pointer"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold line-clamp-2">{t.title}</h3>
                      <span className="badge border border-emerald-400/40 bg-emerald-500/10 text-emerald-200">
                        tamamlandı
                      </span>
                    </div>
                    {t.description && (
                      <p className="mt-2 text-sm text-slate-400 line-clamp-2 leading-snug">
                        {t.description}
                      </p>
                    )}
                    <div className="mt-2 text-[11px] text-slate-400">
                      Atananlar:{" "}
                      {renderAssignees(
                        (t as any)._assigneeIds ?? t.assignees,
                        (t as any)._assigneeHints
                      ) || "—"}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    {(role === "admin" || role === "captain") && (
                      <button
                        type="button"
                        className="btn btn-ghost"
                        onClick={() => {
                          const key =
                            t.start_date ||
                            t.end_date ||
                            t.due_date ||
                            todayYMD();
                          setModalDate(key);
                          setDetailTask(t as TaskWithHints);
                          setModalTab("edit");
                        }}
                      >
                        Düzenle
                      </button>
                    )}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => toggleDone(t)}
                        className="btn btn-ghost border border-emerald-400/40"
                        disabled={loading}
                        title="Geri al"
                      >
                        {loading ? "..." : iAmDone ? "Geri Al" : "Yaptım"}
                      </button>
                      {(role === "admin" || role === "captain") && (
                        <button
                          type="button"
                          onClick={() => removeTask(t.id)}
                          className="btn btn-ghost text-red-400"
                        >
                          Sil
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="text-xs text-slate-500">
          Henüz tamamladığın görev yok.
        </div>
      )}

      {/* ===== Kart Detay Modal ===== */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          <div
            className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            onClick={() => setSelected(null)}
          />
          <div className="relative z-10 w-full sm:max-w-md mx-2 sm:mx-0 card p-5">
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-semibold">{selected.title}</h3>
              <button
                className="btn btn-ghost px-2 py-1"
                onClick={() => setSelected(null)}
                title="Kapat"
              >
                ✕
              </button>
            </div>
            <div className="mt-3">
              <div className="text-sm mb-2">
                <span className="text-slate-400 mr-1">Durum:</span>
                <span className="badge">{selected.status}</span>
              </div>
              <div className="text-sm text-slate-300 mb-2">
                <span className="text-slate-400 mr-1">Atananlar:</span>
                {renderAssignees(
                  selected._assigneeIds,
                  selected._assigneeHints
                ) ||
                  (selected.assignee_team
                    ? `${
                        teamLabel[selected.assignee_team as Exclude<Team, null>]
                      } (takım)`
                    : "—")}
              </div>
              {selected.description ? (
                <p className="text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {selected.description}
                </p>
              ) : (
                <p className="text-slate-400 italic text-sm">Açıklama yok.</p>
              )}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                className="btn btn-primary"
                onClick={() => setSelected(null)}
              >
                Tamam
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== Gün Modal ===== */}
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
                  {detailTask && (role === "admin" || role === "captain") && (
                    <button
                      className={`px-3 py-1.5 rounded-md text-sm ${
                        modalTab === "edit" ? "bg-white/10" : "hover:bg-white/5"
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
                {selectedDayTasks.length === 0 ? (
                  <div className="text-sm text-slate-400">Görev yok.</div>
                ) : (
                  (() => {
                    const mine = selectedDayTasks.filter((t) =>
                      t._assigneeIds.includes(userId!)
                    );
                    const others = selectedDayTasks.filter(
                      (t) => !t._assigneeIds.includes(userId!)
                    );

                    const renderBlock = (
                      list: TaskWithHints[],
                      title: string
                    ) => (
                      <div className="space-y-3">
                        <div className="text-xs text-emerald-300">{title}</div>
                        {list
                          .slice()
                          .sort((a, b) =>
                            (a.assignee_team ?? "zz").localeCompare(
                              b.assignee_team ?? "zz"
                            )
                          )
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

                            const sdRaw = t.start_date ?? t.due_date ?? null;
                            const edRaw = t.end_date ?? t.due_date ?? null;
                            const sdp = sdRaw
                              ? parseYMDLocal(sdRaw).toLocaleDateString(
                                  "tr-TR",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                  }
                                )
                              : "—";
                            const edp = edRaw
                              ? parseYMDLocal(edRaw).toLocaleDateString(
                                  "tr-TR",
                                  {
                                    day: "2-digit",
                                    month: "short",
                                  }
                                )
                              : "—";

                            const iAmDone = isDoneByMe(t, userId);
                            const loading = busyIds.has(t.id);
                            const assignedToMe = t._assigneeIds.includes(
                              userId!
                            );

                            return (
                              <div
                                key={t.id}
                                className={`rounded-xl border p-3 ${borderCls}
                                  ${
                                    t.status === "done"
                                      ? "border-emerald-400/60 bg-emerald-500/10"
                                      : "border-white/10 bg-white/5"
                                  }`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <div className="font-medium leading-tight text-slate-100 line-clamp-2">
                                    {t.title}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {assignedToMe && (
                                      <span className="badge">bana</span>
                                    )}
                                    {team && (
                                      <span className="badge">
                                        {teamLabel[team as Exclude<Team, null>]}
                                      </span>
                                    )}
                                  </div>
                                </div>

                                {(sdRaw || edRaw) && (
                                  <div className="mt-1 text-[11px] text-slate-400">{`Başlangıç: ${sdp} • Bitiş: ${edp}`}</div>
                                )}

                                <div className="mt-1 text-[11px] text-slate-400">
                                  Atananlar:{" "}
                                  {renderAssignees(
                                    t._assigneeIds,
                                    t._assigneeHints
                                  ) ||
                                    (team
                                      ? `${
                                          teamLabel[team as Exclude<Team, null>]
                                        } (takım)`
                                      : "—")}
                                </div>

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

                                  {assignedToMe && (
                                    <button
                                      className={
                                        iAmDone
                                          ? "btn btn-ghost border border-emerald-400/40"
                                          : "btn btn-primary"
                                      }
                                      disabled={loading}
                                      onClick={() => toggleDone(t)}
                                      title={iAmDone ? "Geri al" : "Yaptım"}
                                    >
                                      {loading
                                        ? "..."
                                        : iAmDone
                                        ? "Geri Al"
                                        : "Yaptım"}
                                    </button>
                                  )}

                                  {(role === "admin" || role === "captain") && (
                                    <button
                                      className="px-3 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition"
                                      onClick={() => removeTask(t.id)}
                                      title="Görevi sil"
                                    >
                                      Sil
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    );

                    return (
                      <div className="max-h-[60vh] overflow-y-auto pr-1 space-y-5">
                        {mine.length > 0 && renderBlock(mine, "Bana Atananlar")}
                        {others.length > 0 && renderBlock(others, "Diğerleri")}
                      </div>
                    );
                  })()
                )}
              </div>
            )}

            {/* NEW — çoklu atama UI */}
            {modalTab === "new" && (
              <div className="mt-4">
                {role === "admin" || role === "captain" ? (
                  <form
                    className="grid gap-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      submitNewTask();
                    }}
                  >
                    <input
                      className="input"
                      placeholder="Başlık"
                      value={form.title}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, title: e.target.value }))
                      }
                      required
                    />

                    <textarea
                      className="textarea"
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
                          className="input"
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
                          className="input"
                          value={form.end_date}
                          onChange={(e) =>
                            setForm((f) => ({ ...f, end_date: e.target.value }))
                          }
                          required
                        />
                      </div>
                    </div>

                    {/* Takım seçimi */}
                    <div className="grid gap-1">
                      <label className="text-xs text-slate-400">Takım</label>
                      <select
                        className="select"
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
                    </div>

                    {/* Çoklu üye seçimi */}
                    <div className="grid gap-1">
                      <label className="text-xs text-slate-400">
                        Üyeler (çoklu, opsiyonel)
                      </label>
                      <div className="rounded-lg border border-white/10 bg-white/5 p-2 max-h-48 overflow-y-auto">
                        {filteredMembers.length === 0 ? (
                          <div className="text-xs text-slate-400 px-1 py-1.5">
                            Bu takımda üye bulunamadı.
                          </div>
                        ) : (
                          <div className="grid gap-1">
                            {filteredMembers.map((m) => {
                              const checked = form.assignee_user_ids.includes(
                                m.id
                              );
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
                                    {displayName(m)}
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
                        )}
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
                    {detailTask.assignee_team && (
                      <span className="badge">
                        {
                          teamLabel[
                            detailTask.assignee_team as Exclude<Team, null>
                          ]
                        }
                      </span>
                    )}
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

                  <div className="mt-2 text-sm text-slate-300">
                    <span className="text-slate-400 mr-1">Atananlar:</span>
                    {renderAssignees(
                      detailTask._assigneeIds,
                      detailTask._assigneeHints
                    ) ||
                      (detailTask.assignee_team
                        ? `${
                            teamLabel[
                              detailTask.assignee_team as Exclude<Team, null>
                            ]
                          } (takım)`
                        : "—")}
                  </div>

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

                    {(role === "admin" || role === "captain") && (
                      <button
                        className="px-4 py-1.5 rounded-md bg-red-600 text-white hover:bg-red-700 transition"
                        onClick={() => {
                          if (detailTask?.id) removeTask(detailTask.id);
                        }}
                        title="Görevi sil"
                      >
                        Sil
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* EDIT */}
            {modalTab === "edit" &&
              detailTask &&
              (role === "admin" || role === "captain") && (
                <div className="mt-4">
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4 grid gap-3">
                    <div className="text-base font-semibold">
                      Görevi Düzenle
                    </div>

                    <label className="grid gap-1">
                      <span className="text-xs text-slate-400">Başlık</span>
                      <input
                        className="input"
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
                        className="textarea"
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
                          className="input"
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
                          className="input"
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
                          className="input"
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
                          className="select"
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
                          className="select"
                          value={editForm.status}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              status: e.target.value as Task["status"],
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

      {/* Haftalık şeritte BUGÜN kutucuğunu belirginleştir */}
      <style jsx global>{`
        .card.today-cell {
          background: linear-gradient(
              180deg,
              rgba(56, 189, 248, 0.14),
              rgba(56, 189, 248, 0.08)
            ),
            rgba(255, 255, 255, 0.05);
          border-color: rgba(125, 211, 252, 0.55) !important;
          box-shadow: inset 0 0 0 2px rgba(125, 211, 252, 0.35);
        }
      `}</style>
    </section>
  );
}
