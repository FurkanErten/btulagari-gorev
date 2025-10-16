import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, role, member_team, first_name, last_name")
    .order("first_name", { ascending: true });

  if (error) {
    return NextResponse.json(
      { error: error.message, items: [] },
      { status: 500 }
    );
  }

  return NextResponse.json({ items: data ?? [] }, { status: 200 });
}
