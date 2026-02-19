import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabaseServerClient";
import { requireAuth } from "@/lib/serverAuth";

type PatchBody = {
  checklist_status: "unchecked" | "checked" | "rejected";
};

export async function PATCH(
  request: Request,
  context: { params: { id: string } }
) {
  try {
    const auth = await requireAuth(request, ["admin", "manager"]);
    if (!auth.ok) return auth.response;

    const id = context.params.id;
    const body = (await request.json()) as PatchBody;

    const status = body.checklist_status;
    if (!status || !["unchecked", "checked", "rejected"].includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Invalid checklist_status" },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();
    const { error } = await supabase
      .from("items")
      .update({
        checklist_status: status,
        checked: status === "checked"
      })
      .eq("id", id);

    if (error) throw error;
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

