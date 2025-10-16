"use client";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

/** Veri tipi */
type Task = {
  id: string;
  title: string;
  status: "open" | "assigned" | "done";
  due_date?: string; // YYYY-MM-DD
};
type Anim = "left" | "right" | null;

/** Yardımcılar */
const fmtYMD = (d: Date) => d.toISOString().slice(0, 10);

function startOfWeek(date: Date) {
  const d = new Date(date);
  const dow = d.getDay() === 0 ? 7 : d.getDay(); // Pzt=1 ... Paz=7
  d.setDate(d.getDate() - (dow - 1));
  d.setHours(0, 0, 0, 0);
  return d;
}
function addDays(d: Date, n: number) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

function Dot({ s }: { s: Task["status"] }) {
  const cls =
    s === "done"
      ? "bg-emerald-400"
      : s === "assigned"
      ? "bg-amber-400"
      : "bg-blue-400";
  return <span className={`inline-block size-2 rounded-full ${cls}`} />;
}

export default function WeekStrip() {
  const pathname = usePathname();
  const hide = pathname?.startsWith("/calendar"); // sadece render'da kullanacağız

  const [weekStart, setWeekStart] = useState<Date>(startOfWeek(new Date()));
  const [tasks, setTasks] = useState<Task[]>([]);
  const [anim, setAnim] = useState<Anim>(null);

  // Görevleri çek
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/tasks", { cache: "no-store" });
        if (!r.ok) return;
        const js = (await r.json()) as { data?: Task[] };
        setTasks(Array.isArray(js.data) ? js.data : []);
      } catch {
        /* ignore */
      }
    })();
  }, []);

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const byDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of tasks) {
      const k = t.due_date?.slice(0, 10);
      if (!k) continue;
      (map[k] ||= []).push(t);
    }
    return map;
  }, [tasks]);

  const title = `${weekStart.toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
  })} – ${addDays(weekStart, 6).toLocaleDateString("tr-TR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  })}`;

  const goPrev = () => {
    setAnim("right");
    setWeekStart((s) => addDays(s, -7));
  };
  const goNext = () => {
    setAnim("left");
    setWeekStart((s) => addDays(s, 7));
  };
  const goToday = () => {
    setAnim("right");
    setWeekStart(startOfWeek(new Date()));
  };

  // hooks çağrıldıktan sonra koşullu render:
  if (hide) return null;

  return (
    <section aria-label="Haftalık görev takvimi" className="mb-8">
      {/* Başlık / kontrol çubuğu */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 backdrop-blur">
        <div className="text-sm text-slate-300">
          <span className="font-medium">Görevler Takvimi</span>{" "}
          <span className="opacity-75">• {title}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5"
            onClick={goPrev}
          >
            ← Önceki
          </button>
          <button
            className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5"
            onClick={goToday}
          >
            Bugün
          </button>
          <button
            className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5"
            onClick={goNext}
          >
            Sonraki →
          </button>
        </div>
      </div>

      {/* Gün başlıkları */}
      <div className="grid grid-cols-7 text-[11px] uppercase tracking-wide text-slate-400 mb-1 px-1">
        {["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"].map((d) => (
          <div key={d} className="px-2 py-1">
            {d}
          </div>
        ))}
      </div>

      {/* 7 sütun grid + animasyon */}
      <div
        className={`grid grid-cols-7 gap-2 ${
          anim ? (anim === "left" ? "week-anim-left" : "week-anim-right") : ""
        }`}
        onAnimationEnd={() => setAnim(null)}
      >
        {days.map((d, i) => {
          const key = fmtYMD(d);
          const items = byDate[key] || [];
          const isToday = key === fmtYMD(new Date());

          return (
            <div
              key={i}
              className={`rounded-xl border border-white/10 bg-white/5 p-3 min-h-28 transition ${
                isToday ? "ring-2 ring-blue-400/50" : "hover:bg-white/10"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <div className="font-medium">
                  {String(d.getDate()).padStart(2, "0")}
                </div>
                {isToday && <span className="text-blue-300">Bugün</span>}
              </div>

              <div className="mt-2 space-y-1">
                {items.length === 0 ? (
                  <div className="text-[11px] text-slate-400/80">Görev yok</div>
                ) : (
                  items.slice(0, 2).map((t) => (
                    <a
                      key={t.id}
                      href={`/tasks/${t.id}`}
                      className="block rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-xs hover:bg-white/10"
                      title={t.title}
                    >
                      <div className="truncate flex items-center gap-2">
                        <Dot s={t.status} />
                        <span className="truncate">{t.title}</span>
                      </div>
                    </a>
                  ))
                )}
                {items.length > 2 && (
                  <div className="text-[11px] text-slate-400/80">
                    +{items.length - 2} daha
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
