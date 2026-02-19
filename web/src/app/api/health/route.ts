import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    ok: true,
    service: "bh-smry-web",
    ts: new Date().toISOString()
  });
}

