import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin"]);
    if (!auth.ok) return auth.response;

    const body = await request.json();
    const { cookies } = body;

    if (!cookies) {
      return NextResponse.json({ ok: false, error: "No cookies provided" }, { status: 400 });
    }

    // Validate JSON
    let cookiesJson;
    try {
      cookiesJson = typeof cookies === 'string' ? JSON.parse(cookies) : cookies;
      if (!Array.isArray(cookiesJson)) throw new Error("Cookies must be an array");
    } catch (e) {
      return NextResponse.json({ ok: false, error: "Invalid JSON format" }, { status: 400 });
    }

    const supabase = getSupabaseServerClient();
    
    // Insert new cookies record
    const { error } = await supabase
      .from("bidding_cookies")
      .insert([{ cookies_json: cookiesJson }]);

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

export async function GET(request: Request) {
    try {
      const auth = await requireAuth(request, ["admin"]);
      if (!auth.ok) return auth.response;
  
      const supabase = getSupabaseServerClient();
      
      const { data, error } = await supabase
        .from("bidding_cookies")
        .select("updated_at")
        .order("updated_at", { ascending: false })
        .limit(1)
        .maybeSingle();
  
      if (error) throw error;
  
      return NextResponse.json({ ok: true, lastUpdated: data?.updated_at || null });
    } catch (err: any) {
      return NextResponse.json(
        { ok: false, error: err?.message ?? "Unknown error" },
        { status: 500 }
      );
    }
  }
