"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser, hasPermission, isAuthenticated } from "@/lib/session";
import type { Lot } from "@/lib/types";

type MonthOption = { value: string; label: string };

function monthYearKey(dateStr: string | null | undefined): string | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  if (!Number.isFinite(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthYearLabel(key: string): string {
  const [y, m] = key.split("-");
  const year = Number(y);
  const monthIdx = Number(m) - 1;
  const d = new Date(year, monthIdx);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function getNextLotName(lots: Lot[]): string {
  let maxNum = 0;
  for (const lot of lots) {
    const name = String((lot as any)?.lot_name ?? "");
    const n = parseInt(name.match(/(\d+)$/)?.[1] || "0", 10);
    if (Number.isFinite(n) && n > maxNum) maxNum = n;
  }
  if (maxNum > 0) return `Lot ${maxNum + 1}`;
  return "Lot 1";
}

export default function HomeLotsPage() {
  const router = useRouter();
  const [allLots, setAllLots] = useState<Lot[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const canManageLots = hasPermission("add");
  const canEditLots = hasPermission("edit");
  const canDeleteLots = hasPermission("delete");
  const canShowLotMenu = canEditLots || canDeleteLots;

  // Legacy month filter (admin/manager only)
  const [monthOptions, setMonthOptions] = useState<MonthOption[]>([]);
  const [selectedMonth, setSelectedMonth] = useState<string>("all");

  const [newLotName, setNewLotName] = useState("");
  const [creating, setCreating] = useState(false);
  const [openMenuLotId, setOpenMenuLotId] = useState<string>("");
  const openMenuContainerRef = useRef<HTMLDivElement | null>(null);

  const [editLotId, setEditLotId] = useState<string>("");
  const [editLotName, setEditLotName] = useState("");
  const [editLotDescription, setEditLotDescription] = useState("");
  const [editLotDate, setEditLotDate] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/");
      return;
    }
    void loadLots();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!openMenuLotId) return;

    const onPointerDownCapture = (e: MouseEvent | TouchEvent) => {
      const el = openMenuContainerRef.current;
      if (!el) return;
      const target = e.target;
      if (target && target instanceof Node && !el.contains(target)) {
        setOpenMenuLotId("");
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenuLotId("");
    };

    document.addEventListener("mousedown", onPointerDownCapture, true);
    document.addEventListener("touchstart", onPointerDownCapture, true);
    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("mousedown", onPointerDownCapture, true);
      document.removeEventListener("touchstart", onPointerDownCapture, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [openMenuLotId]);

  async function loadLots() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/lots", { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; lots?: Lot[]; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load lots");

      const lots = (json.lots ?? []) as Lot[];
      // Sort lots numerically by extracting number from lot_name (descending)
      lots.sort((a, b) => {
        const nameA = a?.lot_name ?? "";
        const nameB = b?.lot_name ?? "";
        const numA = parseInt(nameA.match(/(\d+)$/)?.[1] || "0", 10);
        const numB = parseInt(nameB.match(/(\d+)$/)?.[1] || "0", 10);
        return numB - numA;
      });
      setAllLots(lots);

      // Populate month filter options (legacy behavior)
      const months = new Set<string>();
      for (const lot of lots) {
        const key = monthYearKey((lot as any)?.created_at ?? null);
        if (key) months.add(key);
      }
      const sorted = Array.from(months).sort().reverse();
      const opts: MonthOption[] = [{ value: "all", label: "All Months" }].concat(
        sorted.map((k) => ({ value: k, label: monthYearLabel(k) }))
      );
      setMonthOptions(opts);

      // Default to current month if available, else "all"
      const now = new Date();
      const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
      setSelectedMonth((prev) => {
        if (prev && prev !== "all" && sorted.includes(prev)) return prev;
        if (sorted.includes(currentKey)) return currentKey;
        return "all";
      });

      const suggestedLotName = getNextLotName(lots);
      setNewLotName((prev) => (prev.trim().length > 0 ? prev : suggestedLotName));
    } catch (err: any) {
      setError(err?.message ?? "Failed to load lots");
    } finally {
      setLoading(false);
    }
  }

  const filteredLots = useMemo(() => {
    if (!selectedMonth || selectedMonth === "all") return allLots;
    return allLots.filter((lot) => {
      const key = monthYearKey((lot as any)?.created_at ?? null);
      return key === selectedMonth;
    });
  }, [allLots, selectedMonth]);

  async function createLot() {
    const name = newLotName.trim();
    if (!name) return;
    setCreating(true);
    try {
      const user = getCurrentUser();
      const res = await fetch("/api/lots", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lot_name: name,
          description: null,
          created_by_user_id: user?.id ?? null
        })
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to create lot");

      setNewLotName("");
      await loadLots();
    } catch (err: any) {
      alert(`Failed to create lot: ${err?.message ?? "Unknown error"}`);
    } finally {
      setCreating(false);
    }
  }

  function openEditModal(lot: Lot) {
    setEditLotId(String(lot.id));
    setEditLotName(String(lot.lot_name ?? ""));
    setEditLotDescription(String(lot.description ?? ""));
    // created_at is likely ISO string; for input[type="date"], we need YYYY-MM-DD
    if (lot.created_at) {
      const d = new Date(lot.created_at);
      if (!isNaN(d.getTime())) {
        const yyyy = d.getFullYear();
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        setEditLotDate(`${yyyy}-${mm}-${dd}`);
      } else {
        setEditLotDate("");
      }
    } else {
      setEditLotDate("");
    }
  }

  function closeEditModal() {
    setEditLotId("");
    setEditLotName("");
    setEditLotDescription("");
    setEditLotDate("");
    setSavingEdit(false);
  }

  async function saveLotEdit() {
    if (!editLotId) return;
    const lotName = editLotName.trim();
    if (!lotName) return alert("Lot name is required");
    setSavingEdit(true);
    try {
      const payload: any = {
        lot_name: lotName,
        description: editLotDescription.trim() || null
      };
      if (editLotDate) {
        // Append time to keep it ISO-like, or API might handle YYYY-MM-DD
        // Better to send a full ISO string to match DB expectation if possible,
        // but often YYYY-MM-DD is accepted by Supabase/Postgres as start of day.
        // Let's send it as is or append T00:00:00Z to be safe if the API expects timestamptz
        payload.created_at = new Date(editLotDate).toISOString();
      }

      const res = await fetch(`/api/lots/${encodeURIComponent(editLotId)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      closeEditModal();
      await loadLots();
    } catch (e: any) {
      alert(e?.message ?? "Failed to update lot");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteLot(lot: Lot) {
    if (!confirm(`Delete "${lot.lot_name}"?\n\nThis will also delete all items inside this lot.`))
      return;
    try {
      const res = await fetch(`/api/lots/${encodeURIComponent(String(lot.id))}`, {
        method: "DELETE"
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed");
      await loadLots();
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete lot");
    }
  }

  return (
    <AppShell>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-neutral-100">Home</h1>
        </div>
      </div>

      {canManageLots ? (
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm font-medium text-slate-900 dark:text-neutral-100">Create New Lot</div>
            <div className="flex items-center gap-2">
              <div className="text-sm font-medium text-slate-700 dark:text-neutral-300">Month</div>
              <select
                className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
              >
                {(monthOptions.length > 0
                  ? monthOptions
                  : [{ value: "all", label: "All Months" }]
                ).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              className="min-w-[220px] flex-1 rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
              placeholder="Lot name (e.g., Lot 12)"
              value={newLotName}
              onChange={(e) => setNewLotName(e.target.value)}
            />
            <button
              className="rounded-md bg-[#2c3e50] px-3 py-2 text-sm font-medium text-white hover:bg-[#1f2d3a] disabled:cursor-not-allowed disabled:opacity-60"
              onClick={createLot}
              disabled={creating || !newLotName.trim()}
            >
              {creating ? "Creating..." : "Create"}
            </button>
          </div>
        </div>
      ) : null}

      {!canManageLots ? (
        <div className="mt-6 rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="text-sm font-medium text-slate-700 dark:text-neutral-300">Month</div>
            <select
              className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
            >
              {(monthOptions.length > 0 ? monthOptions : [{ value: "all", label: "All Months" }]).map(
                (o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                )
              )}
            </select>
          </div>
        </div>
      ) : null}

      <div className="mt-6">
        {loading ? (
          <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 text-slate-600 dark:text-neutral-400 shadow-sm">
            Loading lots...
          </div>
        ) : error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
            <div className="font-medium">Failed to load lots</div>
            <div className="mt-1 text-sm">{error}</div>
          </div>
        ) : filteredLots.length === 0 ? (
          <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 text-slate-600 dark:text-neutral-400 shadow-sm">
            <div className="font-medium text-slate-900 dark:text-neutral-100">No lots found</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {filteredLots.map((lot) => {
              const createdDate = new Date(lot.created_at).toLocaleDateString("en-US", {
                year: "numeric",
                month: "short",
                day: "numeric"
              });
              const menuOpen = openMenuLotId === String(lot.id);
              return (
                <div
                  key={lot.id}
                  role="button"
                  tabIndex={0}
                  onClick={() =>
                    router.push(
                      `/lot?lot_id=${encodeURIComponent(lot.id)}&lot_name=${encodeURIComponent(
                        lot.lot_name
                      )}`
                    )
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      router.push(
                        `/lot?lot_id=${encodeURIComponent(lot.id)}&lot_name=${encodeURIComponent(
                          lot.lot_name
                        )}`
                      );
                    }
                  }}
                  className="cursor-pointer rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="truncate text-base font-semibold text-slate-900 dark:text-neutral-100">
                        {lot.lot_name}
                      </div>
                      <div className="mt-1 text-xs text-slate-500 dark:text-neutral-400">{createdDate}</div>
                    </div>

                    {canShowLotMenu ? (
                      <div
                        className="relative shrink-0"
                        ref={menuOpen ? openMenuContainerRef : undefined}
                      >
                        <button
                          type="button"
                          className="rounded-md bg-transparent p-2 text-slate-500 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900 hover:text-slate-700 dark:text-neutral-300"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setOpenMenuLotId((cur) =>
                              cur === String(lot.id) ? "" : String(lot.id)
                            );
                          }}
                          aria-label="Lot options"
                          title="Options"
                        >
                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                          >
                            <path
                              d="M12 6a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                              fill="currentColor"
                            />
                            <path
                              d="M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                              fill="currentColor"
                            />
                            <path
                              d="M12 20a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z"
                              fill="currentColor"
                            />
                          </svg>
                        </button>

                        {menuOpen ? (
                          <div
                            className="absolute right-0 top-10 z-10 w-40 overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-lg"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                            }}
                          >
                            {canEditLots ? (
                              <button
                                className="block w-full px-3 py-2 text-left text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                                onClick={() => {
                                  setOpenMenuLotId("");
                                  openEditModal(lot);
                                }}
                              >
                                Edit
                              </button>
                            ) : null}
                            {canDeleteLots ? (
                              <button
                                className="block w-full px-3 py-2 text-left text-sm text-rose-700 hover:bg-rose-50"
                                onClick={() => {
                                  setOpenMenuLotId("");
                                  void deleteLot(lot);
                                }}
                              >
                                Delete
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>

                  {lot.description ? (
                    <div className="mt-2 text-sm text-slate-600 dark:text-neutral-400">{lot.description}</div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {editLotId ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={closeEditModal}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Edit Lot</div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <label className="block">
                <span className="text-sm text-slate-700 dark:text-neutral-300">Lot name</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                  value={editLotName}
                  onChange={(e) => setEditLotName(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-700 dark:text-neutral-300">Date</span>
                <input
                  type="date"
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                  value={editLotDate}
                  onChange={(e) => setEditLotDate(e.target.value)}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-700 dark:text-neutral-300">Description</span>
                <textarea
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                  value={editLotDescription}
                  onChange={(e) => setEditLotDescription(e.target.value)}
                  rows={3}
                />
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                onClick={closeEditModal}
                disabled={savingEdit}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-[#2c3e50] px-3 py-2 text-sm font-medium text-white hover:bg-[#1f2d3a] disabled:opacity-60"
                onClick={saveLotEdit}
                disabled={savingEdit}
              >
                {savingEdit ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

