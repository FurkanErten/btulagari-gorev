// src/app/auth/signup/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabaseBrowser } from "@/lib/supabaseBrowser";

type Team = "yazilim" | "mekanik" | "elektronik" | "sosyal";

export default function SignUpPage() {
  return (
    <div className="max-w-md mx-auto">
      <SignUpForm />
    </div>
  );
}

function SignUpForm() {
  const sb = supabaseBrowser();
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [team, setTeam] = useState<Team>("yazilim");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [okMsg, setOkMsg] = useState<string | null>(null);
  const [pendingVerify, setPendingVerify] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setOkMsg(null);
    setPendingVerify(false);
    setLoading(true);

    try {
      const { data: signUpData, error: signUpErr } = await sb.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: undefined },
      });
      if (signUpErr) {
        const msg = signUpErr.message?.toLowerCase() || "";
        if (
          msg.includes("already registered") ||
          msg.includes("user already exists")
        ) {
          throw new Error(
            "Bu e-posta zaten kayıtlı. Lütfen giriş yapın veya şifre sıfırlayın."
          );
        }
        throw new Error(signUpErr.message);
      }

      // e-posta doğrulaması gerekiyorsa burada oturum olmaz:
      if (!signUpData.session) {
        setPendingVerify(true);
        setOkMsg(
          "Kayıt oluşturuldu. E-postadaki doğrulama linkine tıkla, sonra giriş yap."
        );
        return;
      }

      // profil satırı
      const userId = signUpData.user?.id;
      if (!userId) throw new Error("Kullanıcı oluşturulamadı.");

      const { error: profErr } = await sb
        .from("profiles")
        .insert({ id: userId, email, member_team: team });
      if (profErr && !/duplicate key value/i.test(profErr.message)) {
        throw new Error("Profil yazılamadı: " + profErr.message);
      }

      setOkMsg("Kayıt başarılı! Yönlendiriliyorsunuz…");
      router.push("/");
      setTimeout(() => (window.location.href = "/"), 500);
    } catch (e: any) {
      setErr(e?.message || "Kayıt başarısız.");
    } finally {
      setLoading(false);
    }
  }

  async function resendVerification() {
    setErr(null);
    setOkMsg(null);
    try {
      if (!email) throw new Error("Önce e-posta gir.");
      const { error } = await sb.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: undefined },
      });
      if (error) throw new Error(error.message);
      setOkMsg("Doğrulama e-postası tekrar gönderildi.");
      setPendingVerify(true);
    } catch (e: any) {
      setErr(e?.message || "Tekrar gönderilemedi.");
    }
  }

  return (
    <div className="card">
      <h1 className="text-lg font-semibold mb-3">Kayıt Ol</h1>
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
          minLength={6}
          required
          autoComplete="new-password"
        />
        <select
          className="select"
          value={team}
          onChange={(e) => setTeam(e.target.value as Team)}
        >
          <option value="yazilim">Yazılım</option>
          <option value="mekanik">Mekanik</option>
          <option value="elektronik">Elektronik</option>
          <option value="sosyal">Sosyal Medya</option>
        </select>

        {err && !pendingVerify && (
          <div className="text-sm text-red-300">{err}</div>
        )}
        {okMsg && (
          <div className="text-sm text-emerald-300">
            {okMsg}{" "}
            {pendingVerify && (
              <button
                type="button"
                onClick={resendVerification}
                className="underline ml-1"
              >
                Tekrar gönder
              </button>
            )}
          </div>
        )}

        <button className="btn btn-primary w-full" disabled={loading}>
          {loading ? "Kaydediliyor…" : "Kayıt Ol"}
        </button>

        <div className="text-sm text-slate-400 mt-2">
          Zaten hesabın var mı?{" "}
          <Link href="/auth" className="underline">
            Giriş yap
          </Link>
        </div>
      </form>
    </div>
  );
}
