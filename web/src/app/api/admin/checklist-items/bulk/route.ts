import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

type PatchBody = {
  lot_id: number;
  checklist_status: "unchecked" | "checked";
};

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const body = (await request.json().catch(() => null)) as PatchBody | null;
    const lotId = body?.lot_id;
    const status = body?.checklist_status;

    if (!Number.isFinite(lotId)) {
      return NextResponse.json({ ok: false, error: "Invalid lot_id" }, { status: 400 });
    }
    if (!status || !["unchecked", "checked"].includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Invalid checklist_status" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    // Update only active (non-cancelled) rows, consistent with checklist views.
    const { error } = await supabase
      .from("items")
      .update({
        checklist_status: status,
        checked: status === "checked"
      })
      .eq("lot_id", lotId)
      .or("cancelled.is.null,cancelled.eq.false");

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

