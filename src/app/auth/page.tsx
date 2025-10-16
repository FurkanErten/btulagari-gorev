// src/app/auth/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export default function AuthPage() {
  return (
    <div className="max-w-md mx-auto">
      <SignInForm />
    </div>
  );
}

/* ------------ GİRİŞ ------------ */
function SignInForm() {
  const sb = supabaseBrowser();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setInfo(null);
    setLoading(true);
    try {
      if (!email || !password) throw new Error("E-posta ve şifre gerekli.");

      const { data, error } = await sb.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        const m = error.message?.toLowerCase() || "";
        if (m.includes("invalid") && m.includes("credentials")) {
          throw new Error("E-posta veya şifre yanlış.");
        }
        throw error;
      }

      const userId = data?.user?.id ?? data?.session?.user?.id;
      if (!userId) throw new Error("Oturum açılamadı.");

      router.push("/");
      setTimeout(() => (window.location.href = "/"), 500);
    } catch (e: any) {
      setErr(e?.message || "Giriş başarısız.");
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword() {
    setErr(null);
    setInfo(null);
    try {
      if (!email) throw new Error("Önce e-posta gir.");
      const { error } = await sb.auth.resetPasswordForEmail(email, {
        redirectTo: `${location.origin}/auth`,
      });
      if (error) throw error;
      setInfo("Şifre sıfırlama e-postası gönderildi.");
    } catch (e: any) {
      setErr(e?.message || "Sıfırlama gönderilemedi.");
    }
  }

  return (
    <div className="card">
      <h1 className="text-lg font-semibold mb-3">Giriş</h1>
      <form onSubmit={onSubmit} className="space-y-3">
        <input
          className="input"
          type="email"
          placeholder="e-posta"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
        />
        <input
          className="input"
          type="password"
          placeholder="şifre"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          minLength={6}
          autoComplete="current-password"
        />
        {err && <div className="text-sm text-red-300">{err}</div>}
        {info && <div className="text-sm text-emerald-300">{info}</div>}
        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Giriş yapılıyor…" : "Giriş Yap"}
        </button>

        <div className="mt-2 flex items-center justify-between text-sm">
          <button type="button" className="underline" onClick={resetPassword}>
            Şifremi unuttum
          </button>
        </div>
      </form>
    </div>
  );
}
