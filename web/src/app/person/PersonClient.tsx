"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser, isAuthenticated } from "@/lib/session";

type PersonItem = {
  id: number | string;
  lot_id: number | string | null;
  username: string | null;
  picture_url: string | null;
  price: string | number | null;
  cancelled: boolean | null;
  created_at: string | null;
  lots?: { lot_name?: string | null; created_at?: string | null } | null;
};

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function PersonClient() {
  const router = useRouter();
  const params = useSearchParams();
  const username = (params.get("username") || "").trim();
  const [expandedLots, setExpandedLots] = useState<Record<string, boolean>>({});

  const [items, setItems] = useState<PersonItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/");
      return;
    }
    const u = getCurrentUser();
    const level = (u?.access_level || "").toLowerCase();
    // Viewer should not access other collectors' purchases.
    if (level === "viewer") {
      if (!username || username !== (u?.username || "")) {
        router.push("/home");
      }
    }
  }, [router]);

  useEffect(() => {
    async function run() {
      if (!username) {
        setLoading(false);
        setItems([]);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/profile/items?username=${encodeURIComponent(username)}`, {
          cache: "no-store"
        });
        const json = (await res.json()) as
          | { ok: true; items: PersonItem[] }
          | { ok: false; error: string };
        if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
        setItems(json.items);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load person items");
      } finally {
        setLoading(false);
      }
    }
    void run();
  }, [username]);

  const groupedByLot = useMemo(() => {
    const map = new Map<string, { lotId: string; lotName: string; items: PersonItem[] }>();
    for (const it of items) {
      const lotId = it.lot_id == null ? "unknown" : String(it.lot_id);
      const lotName = (it.lots?.lot_name ?? `Lot ${lotId}`).toString();
      const entry = map.get(lotId) ?? { lotId, lotName, items: [] };
      entry.items.push(it);
      map.set(lotId, entry);
    }
    return Array.from(map.values());
  }, [items]);

  const totals = useMemo(() => {
    const figs = items.filter((i) => !i.cancelled).length;
    const amount = items.reduce((sum, it) => {
      if (it.cancelled) return sum;
      return sum + toNumber(it.price);
    }, 0);
    return { figs, amount };
  }, [items]);

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">{username || "Person"}</h1>
        </div>
        <button
          className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
          onClick={() => router.back()}
        >
          Back
        </button>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-600">Total Figures</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            {totals.figs.toLocaleString("en-IN")}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-600">Total Amount</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            ₹{Math.round(totals.amount).toLocaleString("en-IN")}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs text-slate-600">Lots</div>
          <div className="mt-1 text-xl font-semibold text-slate-900">
            {groupedByLot.length.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
            Loading...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">{error}</div>
        ) : !username ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
            Missing `username` in URL.
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
            No items found.
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {groupedByLot.map((lot) => {
              const amount = lot.items.reduce((sum, it) => sum + toNumber(it.price), 0);
              const isExpanded = !!expandedLots[lot.lotId];
              const PREVIEW_COUNT = 8;
              const shown = isExpanded ? lot.items : lot.items.slice(0, PREVIEW_COUNT);
              const remaining = Math.max(0, lot.items.length - shown.length);
              return (
                <section
                  key={lot.lotId}
                  className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm"
                >
                  <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <button
                      className="truncate text-left text-sm font-semibold text-slate-900 hover:underline"
                      onClick={() =>
                        router.push(
                          `/lot?lot_id=${encodeURIComponent(
                            lot.lotId
                          )}&lot_name=${encodeURIComponent(lot.lotName)}`
                        )
                      }
                    >
                      {lot.lotName}
                    </button>
                    <div className="shrink-0 text-sm font-semibold text-slate-900">
                      ₹{Math.round(amount).toLocaleString("en-IN")}
                    </div>
                  </div>
                  <div className="h-px w-full bg-slate-100" />
                  <div className="p-3">
                    <div className="flex flex-wrap items-start gap-x-1 gap-y-1">
                      {shown.map((it) => (
                        <div key={String(it.id)} className="w-[72px]">
                          <div className="mb-1 text-center text-xs font-semibold text-slate-900">
                            {Math.round(toNumber(it.price)).toLocaleString("en-IN")}
                          </div>
                          <div className="group relative w-[72px] overflow-hidden rounded-md border border-slate-200 bg-slate-50">
                            <div className="h-[72px] w-[72px]">
                              {it.picture_url ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img
                                  src={it.picture_url}
                                  alt=""
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              ) : (
                                <div className="flex h-full items-center justify-center text-xs text-slate-400">
                                  No image
                                </div>
                              )}
                            </div>
                            {it.picture_url ? (
                              <button
                                type="button"
                                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white/90 opacity-0 shadow-sm transition-opacity hover:bg-white group-hover:opacity-100"
                                onClick={(e) => {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  setZoomImageUrl(it.picture_url || null);
                                }}
                                title="Zoom image"
                                aria-label="Zoom image"
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                  src="https://res.cloudinary.com/daye1yfzy/image/upload/v1762330881/magnifying-glass-solid-full_vujovk.svg"
                                  alt="Zoom"
                                  className="h-3.5 w-3.5"
                                />
                              </button>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex items-center justify-end gap-3">
                      {remaining > 0 || isExpanded ? (
                        <button
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-50"
                          onClick={() =>
                            setExpandedLots((prev) => ({
                              ...prev,
                              [lot.lotId]: !isExpanded
                            }))
                          }
                        >
                          {isExpanded ? "Show less" : `Show more (${remaining})`}
                        </button>
                      ) : null}
                    </div>
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>

      {zoomImageUrl ? (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoomImageUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomImageUrl}
            alt="Zoomed"
            className="max-h-[92vh] max-w-[95vw] rounded-md border border-white/20 bg-white object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </AppShell>
  );
}

