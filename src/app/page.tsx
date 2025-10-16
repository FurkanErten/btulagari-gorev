export default function Page() {
  return (
    <section className="grid place-items-center min-h-[40vh]">
      <div className="text-center card max-w-2xl">
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight">
          Lagari <span className="text-blue-400">Görev Sistemi</span>
        </h1>
        <p className="mt-3 text-slate-500">
          Takım içi görev atama ve takip platformu.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <a href="/calendar" className="btn btn-primary shadow">
            Takvim
          </a>
          <a href="/tasks" className="btn btn-ghost">
            Görevleri Gör
          </a>
        </div>
      </div>
    </section>
  );
}
