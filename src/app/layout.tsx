"use client";

import "./globals.css";
import Link from "next/link";
import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Role = "admin" | "captain" | "member" | null;
type Team = "yazilim" | "mekanik" | "elektronik" | "sosyal" | null;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  const [role, setRole] = useState<Role>(null);
  const [authed, setAuthed] = useState(false);
  const [name, setName] = useState<string>("");
  const [team, setTeam] = useState<Team>(null);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch("/api/me", { cache: "no-store" });
        const js = await r.json().catch(() => ({}));

        setRole((js?.role as Role) ?? null);
        setAuthed(Boolean(js?.userId));

        const n =
          js?.name ??
          js?.full_name ??
          js?.display_name ??
          js?.profile?.full_name ??
          "";
        setName(typeof n === "string" ? n : "");

        const t: Team = js?.team ?? js?.profile?.team ?? null;
        setTeam(
          t && ["yazilim", "mekanik", "elektronik", "sosyal"].includes(t)
            ? t
            : null
        );
      } catch {
        setRole(null);
        setAuthed(false);
        setName("");
        setTeam(null);
      }
    })();
  }, []);

  async function handleSignOut() {
    try {
      const sb = supabaseBrowser();
      await sb.auth.signOut();
    } finally {
      window.location.href = "/";
    }
  }

  const roleColor =
    role === "admin"
      ? "text-red-400"
      : role === "captain"
      ? "text-blue-400"
      : "text-slate-300";

  const roleLabel =
    role === "admin"
      ? "Admin"
      : role === "captain"
      ? "Kaptan"
      : role
      ? "Üye"
      : "";

  const teamLabel = (t: Team) =>
    t === "yazilim"
      ? "Yazılım"
      : t === "mekanik"
      ? "Mekanik"
      : t === "elektronik"
      ? "Elektronik"
      : t === "sosyal"
      ? "Sosyal"
      : "";

  const linkCls = (href: string) =>
    `px-3 py-1.5 rounded-lg hover:bg-white/5 ${
      pathname === href ? "bg-white/5" : ""
    }`;

  return (
    <html lang="tr">
      <head>
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, viewport-fit=cover"
        />
      </head>
      <body className="antialiased">
        <header className="sticky top-0 z-50 border-b border-white/10 bg-[#0f1420]/60 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,.25)]">
          <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
            {/* 🔹 Logo + Lagari + kullanıcı bilgisi */}
            <Link href="/" className="flex items-center gap-2 min-w-0">
              <Image
                src="/lagari-logo.svg" // /public içine koy
                alt="Lagari Logo"
                width={120}
                height={120}
                className="rounded-md"
                priority
              />
              <span className="font-semibold tracking-wide truncate">
                Lagari
              </span>

              {(roleLabel || name || team) && (
                <span
                  className={`ml-3 text-sm font-medium ${roleColor} truncate flex items-center gap-1`}
                  title={[roleLabel, name, team ? `(${teamLabel(team)})` : ""]
                    .filter(Boolean)
                    .join(" — ")}
                >
                  {roleLabel && <span>{roleLabel}</span>}
                  {(name || team) && <span className="text-slate-400">—</span>}
                  {name && <span className="text-slate-200">{name}</span>}
                  {team && (
                    <span className="text-slate-300">{`(${teamLabel(
                      team
                    )})`}</span>
                  )}
                </span>
              )}
            </Link>

            {/* 🔹 Menü */}
            <nav className="flex items-center gap-1 overflow-x-auto">
              <Link className={linkCls("/tasks")} href="/tasks">
                Görevler
              </Link>
              <Link className={linkCls("/calendar")} href="/calendar">
                Takvim
              </Link>

              {!authed ? (
                <Link className={linkCls("/auth")} href="/auth">
                  Hesap
                </Link>
              ) : (
                <button
                  onClick={handleSignOut}
                  className="px-3 py-1.5 rounded-lg border border-white/10 hover:bg-white/5"
                >
                  Çıkış Yap
                </button>
              )}
            </nav>
          </div>
        </header>

        <div className="h-[2px] w-full bg-gradient-to-r from-blue-500 via-blue-300 to-blue-500 opacity-70" />

        <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>

        <footer className="border-t border-white/10 mt-10 py-6 text-sm text-slate-400/90">
          <div className="mx-auto max-w-6xl px-4 flex items-center justify-between">
            <span>© {new Date().getFullYear()} Lagari</span>
            <a
              className="hover:text-slate-200"
              href="https://btulagari.com"
              target="_blank"
              rel="noreferrer"
            >
              btulagari.com
            </a>
          </div>
        </footer>
      </body>
    </html>
  );
}
