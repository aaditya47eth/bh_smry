"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser, isAuthenticated } from "@/lib/session";

type ProfileItem = {
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

async function waitForImagesInElement(root: HTMLElement): Promise<void> {
  const imgs = Array.from(root.querySelectorAll("img"));
  if (imgs.length === 0) return;
  await Promise.all(
    imgs.map(
      (img) =>
        new Promise<void>((resolve) => {
          if (img.complete) return resolve();
          const done = () => resolve();
          img.addEventListener("load", done, { once: true });
          img.addEventListener("error", done, { once: true });
        })
    )
  );
}

type ProfileMode = "all" | "collections";

type CollectionRow = {
  id: string;
  name: string;
  itemCount: number;
};

type CollectionWithItems = {
  id: string;
  name: string;
  items: ProfileItem[];
};

const ALL_COLLECTIONS_ID = "__all__";

export default function ProfilePage() {
  const router = useRouter();
  const [items, setItems] = useState<ProfileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedLots, setExpandedLots] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<ProfileMode>("all");

  // Collections state
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [collectionsError, setCollectionsError] = useState<string | null>(null);
  const [newCollectionName, setNewCollectionName] = useState("");
  const [creatingCollection, setCreatingCollection] = useState(false);

  const [selectedCollectionId, setSelectedCollectionId] = useState<string>(ALL_COLLECTIONS_ID);
  const [selectedCollectionName, setSelectedCollectionName] = useState<string>("All Collections");
  const [collectionItemIds, setCollectionItemIds] = useState<Set<string>>(new Set());
  const [collectionItems, setCollectionItems] = useState<ProfileItem[]>([]);
  const [collectionLoading, setCollectionLoading] = useState(false);
  const [allCollectionsLoading, setAllCollectionsLoading] = useState(false);
  const [allCollectionsItems, setAllCollectionsItems] = useState<CollectionWithItems[]>([]);
  const [collectionMenuOpen, setCollectionMenuOpen] = useState(false);

  const [editCollectionOpen, setEditCollectionOpen] = useState(false);
  const [editCollectionSelection, setEditCollectionSelection] = useState<Record<string, boolean>>(
    {}
  );
  const [savingCollectionItems, setSavingCollectionItems] = useState(false);
  const collectionCaptureId = "profile-collection-capture";
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  const user = getCurrentUser();
  const username = user?.username || "";

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/");
      return;
    }
  }, [router]);

  useEffect(() => {
    async function run() {
      if (!username) return;
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(
          `/api/profile/items?username=${encodeURIComponent(username)}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as
          | { ok: true; items: ProfileItem[] }
          | { ok: false; error: string };
        if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
        setItems(json.items);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load profile items");
      } finally {
        setLoading(false);
      }
    }
    void run();
  }, [username]);

  async function loadCollections() {
    if (!username) return;
    setCollectionsLoading(true);
    setCollectionsError(null);
    try {
      const res = await fetch(`/api/profile/collections?username=${encodeURIComponent(username)}`, {
        cache: "no-store"
      });
      const json = (await res.json()) as
        | { ok: true; collections: CollectionRow[] }
        | { ok: false; error: string };
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setCollections(json.collections);
      if (json.collections.length === 0) {
        setSelectedCollectionId("");
        setSelectedCollectionName("");
        setAllCollectionsItems([]);
        return;
      }

      // Keep default selection as "All" unless user picked a valid collection id.
      const selectedValid =
        selectedCollectionId === ALL_COLLECTIONS_ID ||
        json.collections.some((c) => c.id === selectedCollectionId);
      if (!selectedValid) {
        setSelectedCollectionId(ALL_COLLECTIONS_ID);
        setSelectedCollectionName("All Collections");
      }
    } catch (e: any) {
      setCollectionsError(e?.message ?? "Failed to load collections");
      setCollections([]);
    } finally {
      setCollectionsLoading(false);
    }
  }

  async function loadCollectionItems(collectionId: string, collectionName: string) {
    setSelectedCollectionId(collectionId);
    setSelectedCollectionName(collectionName);
    setCollectionLoading(true);
    try {
      const res = await fetch(`/api/profile/collections/${encodeURIComponent(collectionId)}/items`, {
        cache: "no-store"
      });
      const json = (await res.json()) as
        | { ok: true; itemIds: string[]; items: ProfileItem[] }
        | { ok: false; error: string };
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setCollectionItems(json.items);
      setCollectionItemIds(new Set(json.itemIds));
    } catch (e: any) {
      alert(e?.message ?? "Failed to load collection");
      setCollectionItems([]);
      setCollectionItemIds(new Set());
    } finally {
      setCollectionLoading(false);
    }
  }

  async function loadAllCollectionsItems() {
    setSelectedCollectionId(ALL_COLLECTIONS_ID);
    setSelectedCollectionName("All Collections");
    setCollectionItems([]);
    setCollectionItemIds(new Set());
    setAllCollectionsLoading(true);
    try {
      const rows = await Promise.all(
        collections.map(async (c) => {
          const res = await fetch(`/api/profile/collections/${encodeURIComponent(c.id)}/items`, {
            cache: "no-store"
          });
          const json = (await res.json()) as
            | { ok: true; itemIds: string[]; items: ProfileItem[] }
            | { ok: false; error: string };
          if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
          return { id: c.id, name: c.name, items: json.items } as CollectionWithItems;
        })
      );
      setAllCollectionsItems(rows);
    } catch (e: any) {
      alert(e?.message ?? "Failed to load collections");
      setAllCollectionsItems([]);
    } finally {
      setAllCollectionsLoading(false);
    }
  }

  useEffect(() => {
    if (mode !== "collections") return;
    void loadCollections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  useEffect(() => {
    if (mode !== "collections") return;
    if (selectedCollectionId !== ALL_COLLECTIONS_ID) return;
    if (collections.length === 0) return;
    void loadAllCollectionsItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, selectedCollectionId, collections]);

  async function createCollection() {
    const name = newCollectionName.trim();
    if (!name) return;
    if (!username) return;
    setCreatingCollection(true);
    try {
      const res = await fetch("/api/profile/collections", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, name })
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      setNewCollectionName("");
      await loadCollections();
    } catch (e: any) {
      alert(e?.message ?? "Failed to create collection");
    } finally {
      setCreatingCollection(false);
    }
  }

  async function deleteCollection(id: string) {
    if (!confirm("Delete this collection?")) return;
    try {
      const res = await fetch(`/api/profile/collections/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      if (selectedCollectionId === id) {
        setSelectedCollectionId("");
        setSelectedCollectionName("");
        setCollectionItems([]);
        setCollectionItemIds(new Set());
      }
      await loadCollections();
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete collection");
    }
  }

  function openEditCollectionItems() {
    const next: Record<string, boolean> = {};
    for (const it of items) {
      next[String(it.id)] = collectionItemIds.has(String(it.id));
    }
    setEditCollectionSelection(next);
    setEditCollectionOpen(true);
  }

  function closeEditCollectionItems() {
    setEditCollectionOpen(false);
    setEditCollectionSelection({});
    setSavingCollectionItems(false);
  }

  async function saveEditCollectionItems() {
    if (!selectedCollectionId) return;
    setSavingCollectionItems(true);
    try {
      const desired = new Set<string>(
        Object.entries(editCollectionSelection)
          .filter(([, v]) => v)
          .map(([k]) => k)
      );
      const current = new Set<string>(Array.from(collectionItemIds));

      const adds: string[] = [];
      const removes: string[] = [];

      for (const id of desired) if (!current.has(id)) adds.push(id);
      for (const id of current) if (!desired.has(id)) removes.push(id);

      // Apply changes (simple & reliable; can be optimized later).
      await Promise.all(
        adds.map((itemId) =>
          fetch(`/api/profile/collections/${encodeURIComponent(selectedCollectionId)}/items`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ item_id: Number(itemId) })
          })
        )
      );
      await Promise.all(
        removes.map((itemId) =>
          fetch(
            `/api/profile/collections/${encodeURIComponent(
              selectedCollectionId
            )}/items?item_id=${encodeURIComponent(itemId)}`,
            { method: "DELETE" }
          )
        )
      );

      closeEditCollectionItems();
      await loadCollectionItems(selectedCollectionId, selectedCollectionName);
      await loadCollections();
    } catch (e: any) {
      alert(e?.message ?? "Failed to save collection");
    } finally {
      setSavingCollectionItems(false);
    }
  }

  async function renameCollection(id: string, currentName: string) {
    const next = prompt("Edit collection name", currentName)?.trim();
    if (!next || next === currentName) return;
    try {
      const res = await fetch(`/api/profile/collections/${encodeURIComponent(id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: next })
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      setSelectedCollectionName(next);
      await loadCollections();
    } catch (e: any) {
      alert(e?.message ?? "Failed to rename collection");
    }
  }

  async function takeCollectionPicture() {
    try {
      const el = document.getElementById(collectionCaptureId);
      if (!el) return;
      await waitForImagesInElement(el);
      const mod = await import("html2canvas");
      const html2canvas = (mod as any).default ?? mod;
      const canvas = await html2canvas(el, { backgroundColor: "#ffffff", scale: 2, useCORS: true });
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      const safeName = (selectedCollectionName || "collection")
        .replace(/[^\w\- ]+/g, "")
        .trim()
        .replace(/\s+/g, "_");
      a.download = `${safeName || "collection"}_snapshot.png`;
      a.href = dataUrl;
      a.click();
    } catch (e: any) {
      alert(e?.message ?? "Failed to take picture");
    }
  }

  useEffect(() => {
    if (!collectionMenuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".collection-menu")) return;
      setCollectionMenuOpen(false);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [collectionMenuOpen]);

  const groupedByLot = useMemo(() => {
    const map = new Map<string, { lotId: string; lotName: string; items: ProfileItem[] }>();
    for (const it of items) {
      const lotId = it.lot_id == null ? "unknown" : String(it.lot_id);
      const lotName = (it.lots?.lot_name ?? `Lot ${lotId}`).toString();
      const key = lotId;
      const entry = map.get(key) ?? { lotId, lotName, items: [] };
      entry.items.push(it);
      map.set(key, entry);
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
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900 dark:text-neutral-100">My Profile</h1>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
          <div className="text-xs text-slate-600 dark:text-neutral-400">Total Figures</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-neutral-100">
            {totals.figs.toLocaleString("en-IN")}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
          <div className="text-xs text-slate-600 dark:text-neutral-400">Total Amount</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-neutral-100">
            ₹{Math.round(totals.amount).toLocaleString("en-IN")}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
          <div className="text-xs text-slate-600 dark:text-neutral-400">Lots</div>
          <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-neutral-100">
            {groupedByLot.length.toLocaleString("en-IN")}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-3 shadow-sm">
          <div className="flex h-full flex-col justify-center gap-2">
            <button
              className={`w-full rounded-md px-3 py-2 text-left text-xs font-semibold transition ${
                mode === "all" ? "bg-slate-900 text-white" : "bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
              }`}
              onClick={() => setMode("all")}
            >
              All Items
            </button>
            <button
              className={`w-full rounded-md px-3 py-2 text-left text-xs font-semibold transition ${
                mode === "collections"
                  ? "bg-slate-900 text-white"
                  : "bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
              }`}
              onClick={() => setMode("collections")}
            >
              Collection
            </button>
          </div>
        </div>
      </div>

      <div className="mt-5">
        {loading ? (
          <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 text-slate-600 dark:text-neutral-400 shadow-sm">
            Loading your items...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            {error}
          </div>
        ) : items.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 text-slate-600 dark:text-neutral-400 shadow-sm">
            No items booked under your name.
          </div>
        ) : (
          mode === "all" ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {groupedByLot.map((lot) => {
                const amount = lot.items.reduce((sum, it) => sum + toNumber(it.price), 0);
                const isExpanded = !!expandedLots[lot.lotId];
                const PREVIEW_COUNT = 6;
                const shown = isExpanded ? lot.items : lot.items.slice(0, PREVIEW_COUNT);
                const remaining = Math.max(0, lot.items.length - shown.length);

                return (
                  <section
                    key={lot.lotId}
                    className="overflow-hidden rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm"
                  >
                    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
                      <button
                        className="truncate text-left text-sm font-semibold text-slate-900 dark:text-neutral-100 hover:underline"
                        onClick={() =>
                          router.push(
                            `/lot?lot_id=${encodeURIComponent(
                              lot.lotId
                            )}&lot_name=${encodeURIComponent(lot.lotName)}`
                          )
                        }
                        title={lot.lotName}
                      >
                        {lot.lotName}
                      </button>

                      <div className="shrink-0 text-sm font-semibold text-slate-900 dark:text-neutral-100">
                        ₹{Math.round(amount).toLocaleString("en-IN")}
                      </div>
                    </div>

                    <div className="h-px w-full bg-slate-100" />

                    <div className="p-3">
                      <div className="flex flex-wrap items-start gap-x-1 gap-y-1">
                        {shown.map((it) => (
                          <div key={String(it.id)} className="w-[72px]">
                            <div className="mb-1 text-center text-xs font-semibold text-slate-900 dark:text-neutral-100">
                              {Math.round(toNumber(it.price)).toLocaleString("en-IN")}
                            </div>
                            <div className="group relative w-[72px] overflow-hidden rounded-md border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900">
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
                                  className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-neutral-800/90 opacity-0 shadow-sm transition-opacity hover:bg-white dark:bg-neutral-800 group-hover:opacity-100"
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
                            className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2.5 py-1 text-[11px] font-medium text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
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
          ) : (
            <div className="space-y-3">
              <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">Collections</div>
                    <div className="mt-0.5 text-xs text-slate-500 dark:text-neutral-400">
                      Create collections and add items (an item can be in multiple collections).
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      className="w-[210px] rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-xs text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      placeholder="New collection name"
                      value={newCollectionName}
                      onChange={(e) => setNewCollectionName(e.target.value)}
                    />
                    <button
                      className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={createCollection}
                      disabled={creatingCollection || !newCollectionName.trim()}
                    >
                      {creatingCollection ? "Creating..." : "Create"}
                    </button>
                  </div>
                </div>

                {collectionsLoading ? (
                  <div className="mt-3 text-xs text-slate-500 dark:text-neutral-400">Loading collections...</div>
                ) : collectionsError ? (
                  <div className="mt-3 rounded-md border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
                    {collectionsError}
                  </div>
                ) : collections.length === 0 ? (
                  <div className="mt-3 text-xs text-slate-500 dark:text-neutral-400">No collections yet.</div>
                ) : (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      className="min-w-[240px] rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-xs text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                      value={selectedCollectionId}
                      onChange={(e) => {
                        const id = e.target.value;
                        if (id === ALL_COLLECTIONS_ID) {
                          void loadAllCollectionsItems();
                          return;
                        }
                        const found = collections.find((c) => c.id === id);
                        if (!found) return;
                        void loadCollectionItems(found.id, found.name);
                      }}
                    >
                      <option value={ALL_COLLECTIONS_ID}>All</option>
                      {collections.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.itemCount.toLocaleString("en-IN")})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {selectedCollectionId ? (
                <div className="rounded-lg border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
                      {selectedCollectionName}
                    </div>
                    {selectedCollectionId !== ALL_COLLECTIONS_ID ? (
                      <div className="relative collection-menu">
                        <button
                          className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-2.5 py-1.5 text-sm font-semibold text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                          onClick={() => setCollectionMenuOpen((v) => !v)}
                          title="Collection actions"
                        >
                          ⋮
                        </button>
                        {collectionMenuOpen ? (
                          <div className="absolute right-0 top-9 z-20 min-w-[180px] overflow-hidden rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg">
                            <button
                              className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                              onClick={() => {
                                setCollectionMenuOpen(false);
                                openEditCollectionItems();
                              }}
                            >
                              Edit Items
                            </button>
                            <button
                              className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                              onClick={() => {
                                setCollectionMenuOpen(false);
                                void renameCollection(selectedCollectionId, selectedCollectionName);
                              }}
                            >
                              Edit Collection Name
                            </button>
                            <button
                              className="block w-full px-3 py-2 text-left text-xs font-medium text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                              onClick={() => {
                                setCollectionMenuOpen(false);
                                void takeCollectionPicture();
                              }}
                            >
                              Take Picture
                            </button>
                            <button
                              className="block w-full px-3 py-2 text-left text-xs font-medium text-rose-700 hover:bg-rose-50"
                              onClick={() => {
                                setCollectionMenuOpen(false);
                                void deleteCollection(selectedCollectionId);
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : (
                      <button
                        className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                        onClick={() => {
                          setSelectedCollectionId("");
                          setSelectedCollectionName("");
                          setCollectionItems([]);
                          setCollectionItemIds(new Set());
                          setAllCollectionsItems([]);
                        }}
                      >
                        Close
                      </button>
                    )}
                  </div>

                  <div id={collectionCaptureId}>
                  {selectedCollectionId === ALL_COLLECTIONS_ID ? (
                    allCollectionsLoading ? (
                      <div className="mt-3 text-xs text-slate-500 dark:text-neutral-400">Loading all collections...</div>
                    ) : allCollectionsItems.length === 0 ? (
                      <div className="mt-3 text-xs text-slate-500 dark:text-neutral-400">No collections found.</div>
                    ) : (
                      <div className="mt-3 space-y-4">
                        {allCollectionsItems.map((c) => (
                          <section key={c.id}>
                            <div className="mb-2 text-xs font-semibold text-slate-700 dark:text-neutral-300">{c.name}</div>
                            {c.items.length === 0 ? (
                              <div className="text-[11px] text-slate-500 dark:text-neutral-400">No items in this collection.</div>
                            ) : (
                              <div className="grid grid-cols-4 gap-x-1 gap-y-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
                                {c.items.map((it) => (
                                  <div key={`${c.id}-${String(it.id)}`} className="min-w-0">
                                    <div className="mb-1 text-center text-[11px] font-semibold text-slate-900 dark:text-neutral-100">
                                      {Math.round(toNumber(it.price)).toLocaleString("en-IN")}
                                    </div>
                                    <div className="group relative">
                                      <button
                                        className="w-full overflow-hidden rounded-sm border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900 hover:bg-slate-100"
                                        onClick={() =>
                                          router.push(
                                            `/lot?lot_id=${encodeURIComponent(
                                              String(it.lot_id ?? "")
                                            )}&lot_name=${encodeURIComponent(
                                              String(it.lots?.lot_name ?? "")
                                            )}`
                                          )
                                        }
                                        title="Open lot"
                                      >
                                        <div className="aspect-square w-full">
                                          {it.picture_url ? (
                                            // eslint-disable-next-line @next/next/no-img-element
                                            <img
                                              src={it.picture_url || ""}
                                              alt=""
                                              className="h-full w-full object-cover"
                                              loading="lazy"
                                              crossOrigin="anonymous"
                                            />
                                          ) : (
                                            <div className="flex h-full items-center justify-center text-xs text-slate-400">
                                              No image
                                            </div>
                                          )}
                                        </div>
                                      </button>
                                      {it.picture_url ? (
                                        <button
                                          type="button"
                                          className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-neutral-800/90 opacity-0 shadow-sm transition-opacity hover:bg-white dark:bg-neutral-800 group-hover:opacity-100"
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
                            )}
                          </section>
                        ))}
                      </div>
                    )
                  ) : collectionLoading ? (
                    <div className="mt-3 text-xs text-slate-500 dark:text-neutral-400">Loading collection...</div>
                  ) : collectionItems.length === 0 ? (
                    <div className="mt-3 text-xs text-slate-500 dark:text-neutral-400">
                      No items in this collection yet.
                    </div>
                  ) : (
                    <div className="mt-3 grid grid-cols-4 gap-x-1 gap-y-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
                      {collectionItems.map((it) => (
                        <div key={String(it.id)} className="min-w-0">
                          <div className="mb-1 text-center text-[11px] font-semibold text-slate-900 dark:text-neutral-100">
                            {Math.round(toNumber(it.price)).toLocaleString("en-IN")}
                          </div>
                          <div className="group relative">
                            <button
                              className="w-full overflow-hidden rounded-sm border border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900 hover:bg-slate-100"
                              onClick={() =>
                                router.push(
                                  `/lot?lot_id=${encodeURIComponent(
                                    String(it.lot_id ?? "")
                                  )}&lot_name=${encodeURIComponent(
                                    String(it.lots?.lot_name ?? "")
                                  )}`
                                )
                              }
                              title="Open lot"
                            >
                              <div className="aspect-square w-full">
                                {it.picture_url ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={it.picture_url || ""}
                                    alt=""
                                    className="h-full w-full object-cover"
                                    loading="lazy"
                                    crossOrigin="anonymous"
                                  />
                                ) : (
                                  <div className="flex h-full items-center justify-center text-xs text-slate-400">
                                    No image
                                  </div>
                                )}
                              </div>
                            </button>
                            {it.picture_url ? (
                              <button
                                type="button"
                                className="absolute right-1 top-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-white dark:bg-neutral-800/90 opacity-0 shadow-sm transition-opacity hover:bg-white dark:bg-neutral-800 group-hover:opacity-100"
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
                  )}
                  </div>
                </div>
              ) : null}
            </div>
          )
        )}
      </div>

      {/* Add/Remove items modal */}
      {editCollectionOpen ? (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-3xl rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-xl">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 dark:border-neutral-700 px-4 py-3">
              <div className="text-sm font-semibold text-slate-900 dark:text-neutral-100">
                Edit Collection: {selectedCollectionName}
              </div>
              <button
                className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                onClick={closeEditCollectionItems}
              >
                Close
              </button>
            </div>

            <div className="max-h-[60vh] overflow-auto p-4">
              <div className="grid grid-cols-4 gap-x-1 gap-y-2 sm:grid-cols-8 md:grid-cols-10 lg:grid-cols-12">
                {items.map((it) => {
                  const id = String(it.id);
                  const checked = !!editCollectionSelection[id];
                  return (
                    <label
                      key={id}
                      className={`cursor-pointer overflow-hidden rounded-sm border ${
                        checked ? "border-slate-900 bg-slate-50 dark:bg-neutral-900" : "border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="hidden"
                        checked={checked}
                        onChange={(e) =>
                          setEditCollectionSelection((prev) => ({
                            ...prev,
                            [id]: e.target.checked
                          }))
                        }
                      />
                      <div className="aspect-square w-full bg-slate-50 dark:bg-neutral-900">
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
                      <div className="px-1.5 py-1 text-center text-[11px] font-semibold text-slate-900 dark:text-neutral-100">
                        {Math.round(toNumber(it.price)).toLocaleString("en-IN")}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 dark:border-neutral-700 px-4 py-3">
              <button
                className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                onClick={closeEditCollectionItems}
                disabled={savingCollectionItems}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
                onClick={() => void saveEditCollectionItems()}
                disabled={savingCollectionItems}
              >
                {savingCollectionItems ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {zoomImageUrl ? (
        <div
          className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/70 p-4"
          onClick={() => setZoomImageUrl(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomImageUrl}
            alt="Zoomed"
            className="max-h-[92vh] max-w-[95vw] rounded-md border border-white/20 bg-white dark:bg-neutral-800 object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </AppShell>
  );
}

