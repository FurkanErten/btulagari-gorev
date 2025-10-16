"use client";

import { useParams, useRouter } from "next/navigation";
import useSWR from "swr";
import { useState } from "react";

type Team = "yazilim" | "mekanik" | "elektronik" | "sosyal" | null;
type Task = {
  id: string;
  title: string;
  description?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  due_date?: string | null;
  assignee_team?: Team;
  status: "open" | "assigned" | "done";
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const r = await fetch(url, { cache: "no-store", credentials: "include" });
  const js = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(js?.error || `HTTP ${r.status}`);
  return js as T;
};

export default function EditTaskPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const { data, isLoading, error, mutate } = useSWR<{ data: Task }>(
    id ? `/api/tasks/${id}` : null,
    fetcher
  );

  const t = data?.data;
  const [form, setForm] = useState({
    title: "",
    description: "",
    start_date: "",
    end_date: "",
    due_date: "",
    assignee_team: "" as "" | Exclude<Team, null>,
    status: "open" as Task["status"],
  });
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  // İlk yüklemede formu doldur
  if (!isLoading && t && form.title === "" && form.status === "open") {
    setForm({
      title: t.title ?? "",
      description: t.description ?? "",
      start_date: t.start_date ?? "",
      end_date: t.end_date ?? "",
      due_date: t.due_date ?? "",
      assignee_team: (t.assignee_team ?? "") as any,
      status: t.status ?? "open",
    });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg(null);
    try {
      const payload = {
        title: form.title.trim(),
        description: form.description || null,
        start_date: form.start_date || null,
        end_date: form.end_date || null,
        due_date: form.due_date || null,
        assignee_team: form.assignee_team || null,
        status: form.status,
      };
      const r = await fetch(`/api/tasks/${id}`, {
        method: "PUT",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const js = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(js?.error || "Güncelleme başarısız");
      await mutate(); // güncel veriyi çek
      setMsg("Kaydedildi ✔");
      // istersen görev listesine dön:
      // router.push("/tasks");
    } catch (err: any) {
      setMsg(err?.message || "Hata oluştu");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading)
    return <section className="text-sm text-slate-400">Yükleniyor…</section>;
  if (error)
    return (
      <section className="text-sm text-red-300">
        Görev alınamadı: {String(error)}
      </section>
    );
  if (!t)
    return (
      <section className="text-sm text-red-300">Görev bulunamadı.</section>
    );

  return (
    <section className="grid gap-4 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Görevi Düzenle</h1>
        <button className="btn btn-ghost" onClick={() => router.back()}>
          Geri
        </button>
      </div>

      <form className="grid gap-3" onSubmit={onSubmit}>
        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Başlık</span>
          <input
            className="input"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            required
          />
        </label>

        <label className="grid gap-1">
          <span className="text-xs text-slate-400">Açıklama</span>
          <textarea
            className="textarea"
            rows={4}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-3 gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-slate-400">Başlangıç</span>
            <input
              type="date"
              className="input"
              value={form.start_date}
              onChange={(e) => setForm({ ...form, start_date: e.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-slate-400">Bitiş</span>
            <input
              type="date"
              className="input"
              value={form.end_date}
              onChange={(e) => setForm({ ...form, end_date: e.target.value })}
            />
          </label>
          <label className="grid gap-1">
            <span className="text-xs text-slate-400">Son Tarih</span>
            <input
              type="date"
              className="input"
              value={form.due_date}
              onChange={(e) => setForm({ ...form, due_date: e.target.value })}
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <label className="grid gap-1">
            <span className="text-xs text-slate-400">Takım</span>
            <select
              className="select"
              value={form.assignee_team}
              onChange={(e) =>
                setForm({
                  ...form,
                  assignee_team: (e.target.value as any) || "",
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
              value={form.status}
              onChange={(e) =>
                setForm({ ...form, status: e.target.value as Task["status"] })
              }
            >
              <option value="open">open</option>
              <option value="assigned">assigned</option>
              <option value="done">done</option>
            </select>
          </label>
        </div>

        {msg && (
          <div
            className={`text-sm ${
              msg.includes("✔") ? "text-emerald-300" : "text-red-300"
            }`}
          >
            {msg}
          </div>
        )}

        <div className="flex items-center gap-2">
          <button className="btn btn-primary" disabled={saving}>
            {saving ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => router.push("/tasks")}
          >
            Görevlere Dön
          </button>
        </div>
      </form>
    </section>
  );
}
