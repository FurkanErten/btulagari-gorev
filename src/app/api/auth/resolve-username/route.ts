import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(req: Request) {
  const { username } = await req.json().catch(() => ({}));
  if (!username)
    return NextResponse.json({ error: "username gerekli" }, { status: 400 });

  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("email")
    .eq("username", username)
    .single();

  if (error || !data)
    return NextResponse.json({ error: "bulunamadı" }, { status: 404 });
  return NextResponse.json({ email: data.email });
}
