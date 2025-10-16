// Sunucu tarafı Supabase client (Service Role ile RLS'i aşar; istersen anon da kullanabilirsin)
import { createClient } from "@supabase/supabase-js";

export function supabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  // Güvenli: yalnızca server tarafında kullan (route.ts dosyaları)
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
