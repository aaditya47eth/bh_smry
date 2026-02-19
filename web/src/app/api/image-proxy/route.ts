import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const src = (url.searchParams.get("url") || "").trim();
    if (!src) {
      return NextResponse.json({ ok: false, error: "url query param is required" }, { status: 400 });
    }

    let parsed: URL;
    try {
      parsed = new URL(src);
    } catch {
      return NextResponse.json({ ok: false, error: "Invalid image URL" }, { status: 400 });
    }
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return NextResponse.json({ ok: false, error: "Only http/https URLs are allowed" }, { status: 400 });
    }

    const upstream = await fetch(parsed.toString(), {
      cache: "no-store",
      redirect: "follow"
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { ok: false, error: `Upstream fetch failed (${upstream.status})` },
        { status: 502 }
      );
    }

    const contentType = upstream.headers.get("content-type") || "application/octet-stream";
    const buf = await upstream.arrayBuffer();
    return new NextResponse(buf, {
      status: 200,
      headers: {
        "content-type": contentType,
        "cache-control": "public, max-age=300",
        "access-control-allow-origin": "*"
      }
    });
  } catch (err: any) {
    return NextResponse.json(
      { ok: false, error: err?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}

