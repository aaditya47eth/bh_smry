"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser, isAuthenticated } from "@/lib/session";

type AdminSection = "users" | "stats" | "checklist";

type UserRow = {
  id: number | string;
  username: string | null;
  number: string | null;
  password: string | null;
  access_level: string | null;
};

type ApiOk<T> = { ok: true } & T;
type ApiErr = { ok: false; error: string };

type StatsTab = "lot" | "person";

type StatisticsResponse = ApiOk<{
  lotWise: {
    summary: {
      totalLots: number;
      totalParticipants: number;
      totalItems: number;
      totalAmount: number;
    };
    rows: Array<{
      lotId: string;
      lotName: string;
      participants: number;
      totalItems: number;
      amount: number;
    }>;
  };
  personWise: {
    summary: {
      totalCollectors: number;
      totalAmount: number;
      totalFigs: number;
    };
    rows: Array<{
      username: string;
      lotsParticipated: number;
      amount: number;
      figsCollected: number;
    }>;
  };
}>;

type LotRow = {
  id: number | string;
  lot_name: string;
  created_at: string;
};

type ChecklistItemRow = {
  id: number | string;
  picture_url: string | null;
  checked: boolean | null;
  checklist_status: string | null;
  created_at: string | null;
};

type ChecklistLotSummary = {
  lotId: string;
  lotName: string;
  totalItems: number;
  checkedItems: number;
  pendingItems: number;
};

const ADMIN_SECTION_KEY = "adminPanelSelectedSection";

function formatInr(amount: number): string {
  return amount.toLocaleString("en-IN", {
    maximumFractionDigits: 0
  });
}

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

export default function AdminPage() {
  const router = useRouter();
  const [section, setSection] = useState<AdminSection>("users");

  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");

  const [statsLoading, setStatsLoading] = useState(false);
  const [statsError, setStatsError] = useState<string | null>(null);
  const [statsTab, setStatsTab] = useState<StatsTab>("lot");
  const [stats, setStats] = useState<StatisticsResponse | null>(null);
  const [statsMonth, setStatsMonth] = useState<string>("all"); // all | YYYY-MM
  const [statsMonthOptions, setStatsMonthOptions] = useState<MonthOption[]>([
    { value: "all", label: "Overall" }
  ]);
  const [lotSort, setLotSort] = useState<
    | null
    | { key: "lotName" | "participants" | "totalItems" | "amount"; dir: "asc" | "desc" }
  >(null);
  const [personSort, setPersonSort] = useState<
    | null
    | { key: "username" | "lotsParticipated" | "figsCollected" | "amount"; dir: "asc" | "desc" }
  >(null);

  const [lots, setLots] = useState<LotRow[]>([]);
  const [selectedLotId, setSelectedLotId] = useState<string>("");
  const [selectedLotName, setSelectedLotName] = useState<string>("");
  const [checklistItems, setChecklistItems] = useState<ChecklistItemRow[]>([]);
  const [checklistLoading, setChecklistLoading] = useState(false);
  const [checklistError, setChecklistError] = useState<string | null>(null);
  const [checklistPartialOpen, setChecklistPartialOpen] = useState(true);
  const [checklistIncompleteOpen, setChecklistIncompleteOpen] = useState(true);
  const [checklistCompletedOpen, setChecklistCompletedOpen] = useState(false);
  const [checklistPartialLots, setChecklistPartialLots] = useState<ChecklistLotSummary[]>([]);
  const [checklistIncompleteLots, setChecklistIncompleteLots] = useState<
    ChecklistLotSummary[]
  >([]);
  const [checklistCompletedLots, setChecklistCompletedLots] = useState<ChecklistLotSummary[]>([]);

  const [showAdd, setShowAdd] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeUser, setActiveUser] = useState<UserRow | null>(null);

  const [form, setForm] = useState({
    username: "",
    number: "",
    password: "",
    access_level: "viewer"
  });

  useEffect(() => {
    if (!isAuthenticated()) {
      router.push("/");
      return;
    }
    const u = getCurrentUser();
    if (!u || u.access_level.toLowerCase() !== "admin") {
      router.push("/dashboard");
      return;
    }

    // Restore section from URL (?section=...) or localStorage (legacy behavior).
    const params = new URLSearchParams(window.location.search);
    const paramSection = params.get("section") as AdminSection | null;
    const paramLotId = params.get("lot_id");
    const savedSection = (window.localStorage.getItem(ADMIN_SECTION_KEY) ||
      "") as AdminSection;
    const initial: AdminSection =
      paramSection && ["users", "stats", "checklist"].includes(paramSection)
        ? paramSection
        : savedSection && ["users", "stats", "checklist"].includes(savedSection)
          ? savedSection
          : "users";
    setSection(initial);
    if (paramLotId) setSelectedLotId(paramLotId);

    void loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(ADMIN_SECTION_KEY, section);
  }, [section]);

  async function loadUsers() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/users", { cache: "no-store" });
      const json = (await res.json()) as ApiOk<{ users: UserRow[] }> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setUsers(json.users);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load users");
    } finally {
      setLoading(false);
    }
  }

  async function loadStats(month: string = statsMonth) {
    setStatsLoading(true);
    setStatsError(null);
    try {
      const qs = month && month !== "all" ? `?month=${encodeURIComponent(month)}` : "";
      const res = await fetch(`/api/admin/statistics${qs}`, { cache: "no-store" });
      const json = (await res.json()) as StatisticsResponse | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setStats(json as StatisticsResponse);
    } catch (e: any) {
      setStatsError(e?.message ?? "Failed to load stats");
    } finally {
      setStatsLoading(false);
    }
  }

  async function loadStatsMonths() {
    try {
      const res = await fetch("/api/lots", { cache: "no-store" });
      const json = (await res.json()) as ApiOk<{ lots: any[] }> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      const list = (json.lots ?? []) as LotRow[];
      const months = new Set<string>();
      for (const lot of list) {
        const key = monthYearKey((lot as any)?.created_at ?? null);
        if (key) months.add(key);
      }
      const sorted = Array.from(months).sort().reverse();
      const opts: MonthOption[] = [{ value: "all", label: "Overall" }].concat(
        sorted.map((k) => ({ value: k, label: monthYearLabel(k) }))
      );
      setStatsMonthOptions(opts);

      // Requested default: always Overall.
      setStatsMonth("all");
    } catch (e: any) {
      // Non-fatal: stats can still work without month options.
      console.error("Failed to load stats months", e);
    }
  }

  async function loadLotsForChecklist() {
    try {
      const res = await fetch("/api/lots", { cache: "no-store" });
      const json = (await res.json()) as ApiOk<{ lots: any[] }> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      const list = (json.lots ?? []) as LotRow[];
      // Sort by created_at desc for picker
      list.sort((a, b) => (b.created_at || "").localeCompare(a.created_at || ""));
      setLots(list);
    } catch (e: any) {
      setChecklistError(e?.message ?? "Failed to load lots");
    }
  }

  async function loadChecklistSummary() {
    setChecklistLoading(true);
    setChecklistError(null);
    try {
      const res = await fetch("/api/admin/checklist-summary", { cache: "no-store" });
      const json = (await res.json()) as
        | ApiOk<{
            partial: ChecklistLotSummary[];
            incomplete: ChecklistLotSummary[];
            completed: ChecklistLotSummary[];
            empty: ChecklistLotSummary[];
          }>
        | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setChecklistPartialLots(json.partial);
      setChecklistIncompleteLots(json.incomplete);
      setChecklistCompletedLots(json.completed);
    } catch (e: any) {
      setChecklistError(e?.message ?? "Failed to load checklist summary");
    } finally {
      setChecklistLoading(false);
    }
  }

  async function loadChecklistItemsForLot(lotId: string) {
    if (!lotId) return;
    setChecklistLoading(true);
    setChecklistError(null);
    try {
      const res = await fetch(`/api/admin/checklist-items?lot_id=${encodeURIComponent(lotId)}`, {
        cache: "no-store"
      });
      const json = (await res.json()) as ApiOk<{ items: ChecklistItemRow[] }> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setChecklistItems(json.items);
    } catch (e: any) {
      setChecklistError(e?.message ?? "Failed to load checklist");
    } finally {
      setChecklistLoading(false);
    }
  }

  useEffect(() => {
    if (section === "stats") {
      if (statsMonthOptions.length <= 1) void loadStatsMonths();
      if (!stats && !statsLoading) void loadStats();
    }
    if (section === "checklist") {
      // Always start checklist on the list view when switching to this section.
      setSelectedLotId("");
      setChecklistItems([]);
      void loadChecklistSummary();
      if (lots.length === 0) void loadLotsForChecklist();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    if (section !== "stats") return;
    void loadStats(statsMonth);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsMonth]);

  const checklistMode = useMemo(() => {
    return section === "checklist" && selectedLotId ? "lot" : "summary";
  }, [section, selectedLotId]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return users;
    return users.filter((u) => {
      const username = (u.username ?? "").toLowerCase();
      const number = (u.number ?? "").toLowerCase();
      return username.includes(term) || number.includes(term);
    });
  }, [q, users]);

  const title = section === "users" ? "Collector Management" : section === "stats" ? "Statistics" : "Checklist";

  const sortedLotRows = useMemo(() => {
    const rows = stats?.lotWise.rows ?? [];
    if (!lotSort) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const dir = lotSort.dir === "asc" ? 1 : -1;
      switch (lotSort.key) {
        case "lotName":
          return dir * a.lotName.localeCompare(b.lotName);
        case "participants":
          return dir * (a.participants - b.participants);
        case "totalItems":
          return dir * (a.totalItems - b.totalItems);
        case "amount":
          return dir * (a.amount - b.amount);
        default:
          return 0;
      }
    });
    return sorted;
  }, [lotSort, stats]);

  const sortedPersonRows = useMemo(() => {
    const rows = stats?.personWise.rows ?? [];
    if (!personSort) return rows;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      const dir = personSort.dir === "asc" ? 1 : -1;
      switch (personSort.key) {
        case "username":
          return dir * a.username.localeCompare(b.username);
        case "lotsParticipated":
          return dir * (a.lotsParticipated - b.lotsParticipated);
        case "figsCollected":
          return dir * (a.figsCollected - b.figsCollected);
        case "amount":
          return dir * (a.amount - b.amount);
        default:
          return 0;
      }
    });
    return sorted;
  }, [personSort, stats]);

  function cycleChecklistStatus(item: ChecklistItemRow): "unchecked" | "checked" | "rejected" {
    const current =
      (item.checklist_status as string | null) ||
      (item.checked ? "checked" : "unchecked");
    if (!current || current === "unchecked") return "checked";
    if (current === "checked") return "rejected";
    return "unchecked";
  }

  async function toggleChecklistItem(itemId: string, next: "unchecked" | "checked" | "rejected") {
    // Optimistic update
    setChecklistItems((prev) =>
      prev.map((it) =>
        String(it.id) === itemId
          ? { ...it, checklist_status: next, checked: next === "checked" }
          : it
      )
    );

    try {
      const res = await fetch(
        `/api/admin/checklist-items/${encodeURIComponent(itemId)}`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ checklist_status: next })
        }
      );
      const json = (await res.json()) as ApiOk<Record<string, never>> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
    } catch (e: any) {
      alert(e?.message ?? "Failed to update item");
      // Re-sync
      if (selectedLotId) await loadChecklistItemsForLot(selectedLotId);
    }
  }

  async function bulkChecklist(next: "unchecked" | "checked") {
    if (!selectedLotId) return;
    const lotIdNum = Number(selectedLotId);
    if (!Number.isFinite(lotIdNum)) return;

    // Optimistic update
    setChecklistItems((prev) =>
      prev.map((it) => ({ ...it, checklist_status: next, checked: next === "checked" }))
    );

    try {
      const res = await fetch("/api/admin/checklist-items/bulk", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ lot_id: lotIdNum, checklist_status: next })
      });
      const json = (await res.json()) as ApiOk<Record<string, never>> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
    } catch (e: any) {
      alert(e?.message ?? "Failed to update items");
      if (selectedLotId) await loadChecklistItemsForLot(selectedLotId);
    }
  }

  function openAdd() {
    setForm({ username: "", number: "", password: "", access_level: "viewer" });
    setShowAdd(true);
  }

  function openEdit(u: UserRow) {
    setActiveUser(u);
    setForm({
      username: u.username ?? "",
      number: u.number ?? "",
      password: "",
      access_level: (u.access_level ?? "viewer").toLowerCase()
    });
    setShowEdit(true);
  }

  async function createUser() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          username: form.username,
          number: form.number,
          password: form.password,
          access_level: form.access_level
        })
      });
      const json = (await res.json()) as ApiOk<Record<string, never>> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setShowAdd(false);
      await loadUsers();
    } catch (e: any) {
      alert(e?.message ?? "Failed to create user");
    } finally {
      setSaving(false);
    }
  }

  async function saveEdit() {
    if (!activeUser) return;
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        username: form.username,
        number: form.number,
        access_level: form.access_level
      };
      // Only set password when typed (legacy behavior)
      if (form.password.trim().length > 0) payload.password = form.password;

      const res = await fetch(`/api/admin/users/${encodeURIComponent(String(activeUser.id))}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      const json = (await res.json()) as ApiOk<Record<string, never>> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setShowEdit(false);
      setActiveUser(null);
      await loadUsers();
    } catch (e: any) {
      alert(e?.message ?? "Failed to update user");
    } finally {
      setSaving(false);
    }
  }

  async function deleteUser(u: UserRow) {
    if (!confirm(`Delete user "${u.username ?? "Unknown"}"?`)) return;
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(String(u.id))}`, {
        method: "DELETE"
      });
      const json = (await res.json()) as ApiOk<Record<string, never>> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      await loadUsers();
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete user");
    }
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900">{title}</h1>
        </div>

        {section === "users" ? (
          <button
            className="rounded-xl bg-[#2c3e50] px-4 py-2 text-sm font-medium text-white hover:bg-[#1f2d3a] disabled:opacity-60"
            onClick={openAdd}
            disabled={loading}
          >
            + Add User
          </button>
        ) : null}
      </div>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row">
        <div className="inline-flex self-start rounded-xl border border-slate-200 bg-white p-1 shadow-sm lg:flex-col">
          {(
            [
              { key: "users", label: "Collector Management" },
              { key: "stats", label: "Statistics" },
              { key: "checklist", label: "Checklist" }
            ] as const
          ).map((t) => {
            const active = section === t.key;
            return (
              <button
                key={t.key}
                onClick={() => {
                  if (t.key === "checklist") {
                    setSelectedLotId("");
                    setSelectedLotName("");
                    setChecklistItems([]);
                  }
                  setSection(t.key);
                }}
                className={`rounded-lg px-4 py-2 text-sm font-medium text-left transition ${
                  active ? "bg-slate-100 text-[#2c3e50]" : "text-slate-600 hover:bg-slate-50"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="min-w-0 flex-1">
          {section === "users" ? (
            <>
              <div className="mt-0 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <input
                    className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                    placeholder="Search by username or number..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  <button
                    className="shrink-0 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                    onClick={loadUsers}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="mt-4">
                {loading ? (
                  <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
                    Loading users...
                  </div>
                ) : error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
                    {error}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                    <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
                      <div className="col-span-4">Username</div>
                      <div className="col-span-3">Number</div>
                      <div className="col-span-2">Access</div>
                      <div className="col-span-3 text-right">Actions</div>
                    </div>

                    {filtered.map((u) => {
                      const hasPassword = !!(u.password && u.password.length > 0);
                      const access = (u.access_level ?? "viewer").toLowerCase();
                      const badgeColor =
                        access === "admin"
                          ? "bg-red-50 text-red-700 border-red-200"
                          : access === "manager"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-slate-50 text-slate-700 border-slate-200";

                      return (
                        <div
                          key={String(u.id)}
                          className="grid grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
                        >
                          <div className="col-span-4">
                            <div className="font-medium text-slate-900">
                              {u.username || "—"}
                            </div>
                            {!hasPassword ? (
                              <div className="mt-0.5 text-xs text-rose-600">
                                Password not set
                              </div>
                            ) : null}
                          </div>
                          <div className="col-span-3 text-slate-700">{u.number || "—"}</div>
                          <div className="col-span-2">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${badgeColor}`}
                            >
                              {access}
                            </span>
                          </div>
                          <div className="col-span-3 flex justify-end gap-2">
                            <button
                              className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                              onClick={() => openEdit(u)}
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm text-rose-700 hover:bg-rose-100"
                              onClick={() => deleteUser(u)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </>
          ) : section === "stats" ? (
            <div className="mt-0">
              {statsLoading ? (
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
                  Loading stats...
                </div>
              ) : statsError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
                  {statsError}
                </div>
              ) : stats ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 bg-white p-2 shadow-sm">
                    <div className="flex gap-2">
                      <button
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                          statsTab === "lot"
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                        onClick={() => setStatsTab("lot")}
                      >
                        Lot-wise Stats
                      </button>
                      <button
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                          statsTab === "person"
                            ? "bg-slate-900 text-white"
                            : "bg-white text-slate-700 hover:bg-slate-50"
                        }`}
                        onClick={() => setStatsTab("person")}
                      >
                        Person-wise Stats
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                    <div className="text-sm font-medium text-slate-700">Month</div>
                    <select
                      className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                      value={statsMonth}
                      onChange={(e) => setStatsMonth(e.target.value)}
                    >
                      {statsMonthOptions.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {statsTab === "lot" ? (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                        {[
                          { label: "Total Lots", value: stats.lotWise.summary.totalLots },
                          {
                            label: "Total Participants",
                            value: stats.lotWise.summary.totalParticipants
                          },
                          {
                            label: "Total Items",
                            value: stats.lotWise.summary.totalItems
                          },
                          {
                            label: "Total Amount",
                            value: `₹${formatInr(stats.lotWise.summary.totalAmount)}`
                          }
                        ].map((c) => (
                          <div
                            key={c.label}
                            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                          >
                            <div className="text-sm text-slate-600">{c.label}</div>
                            <div className="mt-2 text-2xl font-semibold text-slate-900">
                              {typeof c.value === "number"
                                ? c.value.toLocaleString()
                                : c.value}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
                          <button
                            className="col-span-3 text-left hover:text-slate-900"
                            onClick={() =>
                              setLotSort((cur) =>
                                cur?.key === "lotName"
                                  ? { key: "lotName", dir: cur.dir === "asc" ? "desc" : "asc" }
                                  : { key: "lotName", dir: "asc" }
                              )
                            }
                          >
                            Lot Name {lotSort?.key === "lotName" ? (lotSort.dir === "asc" ? "↑" : "↓") : ""}
                          </button>
                          <button
                            className="col-span-3 text-left hover:text-slate-900"
                            onClick={() =>
                              setLotSort((cur) =>
                                cur?.key === "participants"
                                  ? {
                                      key: "participants",
                                      dir: cur.dir === "asc" ? "desc" : "asc"
                                    }
                                  : { key: "participants", dir: "desc" }
                              )
                            }
                          >
                            Participants{" "}
                            {lotSort?.key === "participants"
                              ? lotSort.dir === "asc"
                                ? "↑"
                                : "↓"
                              : ""}
                          </button>
                          <button
                            className="col-span-3 text-left hover:text-slate-900"
                            onClick={() =>
                              setLotSort((cur) =>
                                cur?.key === "totalItems"
                                  ? { key: "totalItems", dir: cur.dir === "asc" ? "desc" : "asc" }
                                  : { key: "totalItems", dir: "desc" }
                              )
                            }
                          >
                            Total Items{" "}
                            {lotSort?.key === "totalItems"
                              ? lotSort.dir === "asc"
                                ? "↑"
                                : "↓"
                              : ""}
                          </button>
                          <button
                            className="col-span-3 text-right hover:text-slate-900"
                            onClick={() =>
                              setLotSort((cur) =>
                                cur?.key === "amount"
                                  ? { key: "amount", dir: cur.dir === "asc" ? "desc" : "asc" }
                                  : { key: "amount", dir: "desc" }
                              )
                            }
                          >
                            Amount{" "}
                            {lotSort?.key === "amount" ? (lotSort.dir === "asc" ? "↑" : "↓") : ""}
                          </button>
                        </div>
                        {sortedLotRows.map((row) => (
                          <button
                            key={row.lotId}
                            className="grid w-full grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 last:border-b-0"
                            onClick={() =>
                              router.push(
                                `/lot?lot_id=${encodeURIComponent(
                                  row.lotId
                                )}&lot_name=${encodeURIComponent(row.lotName)}`
                              )
                            }
                          >
                            <div className="col-span-3 font-medium text-slate-900">
                              {row.lotName}
                            </div>
                            <div className="col-span-3 text-slate-700">
                              {row.participants.toLocaleString()}
                            </div>
                            <div className="col-span-3 text-slate-700">
                              {row.totalItems.toLocaleString()}
                            </div>
                            <div className="col-span-3 text-right font-medium text-slate-900">
                              ₹{formatInr(row.amount)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {[
                          {
                            label: "Total Collectors",
                            value: stats.personWise.summary.totalCollectors
                          },
                          {
                            label: "Total Amount",
                            value: `₹${formatInr(stats.personWise.summary.totalAmount)}`
                          },
                          { label: "Total Figures", value: stats.personWise.summary.totalFigs }
                        ].map((c) => (
                          <div
                            key={c.label}
                            className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm"
                          >
                            <div className="text-sm text-slate-600">{c.label}</div>
                            <div className="mt-2 text-2xl font-semibold text-slate-900">
                              {typeof c.value === "number"
                                ? c.value.toLocaleString()
                                : c.value}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
                        <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
                          <button
                            className="col-span-3 text-left hover:text-slate-900"
                            onClick={() =>
                              setPersonSort((cur) =>
                                cur?.key === "username"
                                  ? { key: "username", dir: cur.dir === "asc" ? "desc" : "asc" }
                                  : { key: "username", dir: "asc" }
                              )
                            }
                          >
                            Collector{" "}
                            {personSort?.key === "username"
                              ? personSort.dir === "asc"
                                ? "↑"
                                : "↓"
                              : ""}
                          </button>
                          <button
                            className="col-span-3 text-left hover:text-slate-900"
                            onClick={() =>
                              setPersonSort((cur) =>
                                cur?.key === "lotsParticipated"
                                  ? {
                                      key: "lotsParticipated",
                                      dir: cur.dir === "asc" ? "desc" : "asc"
                                    }
                                  : { key: "lotsParticipated", dir: "desc" }
                              )
                            }
                          >
                            Lots Participated{" "}
                            {personSort?.key === "lotsParticipated"
                              ? personSort.dir === "asc"
                                ? "↑"
                                : "↓"
                              : ""}
                          </button>
                          <button
                            className="col-span-3 text-left hover:text-slate-900"
                            onClick={() =>
                              setPersonSort((cur) =>
                                cur?.key === "figsCollected"
                                  ? {
                                      key: "figsCollected",
                                      dir: cur.dir === "asc" ? "desc" : "asc"
                                    }
                                  : { key: "figsCollected", dir: "desc" }
                              )
                            }
                          >
                            Figures{" "}
                            {personSort?.key === "figsCollected"
                              ? personSort.dir === "asc"
                                ? "↑"
                                : "↓"
                              : ""}
                          </button>
                          <button
                            className="col-span-3 text-right hover:text-slate-900"
                            onClick={() =>
                              setPersonSort((cur) =>
                                cur?.key === "amount"
                                  ? { key: "amount", dir: cur.dir === "asc" ? "desc" : "asc" }
                                  : { key: "amount", dir: "desc" }
                              )
                            }
                          >
                            Amount{" "}
                            {personSort?.key === "amount"
                              ? personSort.dir === "asc"
                                ? "↑"
                                : "↓"
                              : ""}
                          </button>
                        </div>
                        {sortedPersonRows.map((row) => (
                          <button
                            key={row.username}
                            className="grid w-full grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 text-sm text-left hover:bg-slate-50 last:border-b-0"
                            onClick={() =>
                              router.push(
                                `/person?username=${encodeURIComponent(row.username)}`
                              )
                            }
                          >
                            <div className="col-span-3 font-medium text-slate-900">
                              {row.username}
                            </div>
                            <div className="col-span-3 text-slate-700">
                              {row.lotsParticipated.toLocaleString()}
                            </div>
                            <div className="col-span-3 text-slate-700">
                              {row.figsCollected.toLocaleString()}
                            </div>
                            <div className="col-span-3 text-right font-medium text-slate-900">
                              ₹{formatInr(row.amount)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
                  No stats yet.
                </div>
              )}
            </div>
          ) : (
            <div className="mt-0 space-y-4">
              {checklistLoading ? (
                <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
                  Loading checklist...
                </div>
              ) : checklistError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
                  {checklistError}
                </div>
              ) : (
                <>
                  {checklistMode === "summary" ? (
                    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                      <div className="divide-y divide-slate-200">
                        <div>
                          <button
                            className="flex w-full items-center justify-between px-5 py-4 text-left"
                            onClick={() => setChecklistPartialOpen((v) => !v)}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-[#2c3e50]">
                                {checklistPartialOpen ? "▼" : "▶"}
                              </span>
                              <span className="text-lg font-semibold text-slate-900">
                                Partial
                              </span>
                              <span className="text-slate-500">
                                ({checklistPartialLots.length})
                              </span>
                            </div>
                          </button>

                          {checklistPartialOpen ? (
                            <div className="px-5 pb-5">
                              <div className="overflow-hidden rounded-xl border border-slate-200">
                                <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
                                  <div className="col-span-6">LOT NAME</div>
                                  <div className="col-span-3">TOTAL ITEMS</div>
                                  <div className="col-span-3">STATUS</div>
                                </div>
                                {checklistPartialLots.map((l) => (
                                  <button
                                    key={l.lotId}
                                    className="grid w-full grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 last:border-b-0"
                                    onClick={async () => {
                                      setSelectedLotId(l.lotId);
                                      setSelectedLotName(l.lotName);
                                      await loadChecklistItemsForLot(l.lotId);
                                    }}
                                  >
                                    <div className="col-span-6 font-medium text-slate-900">
                                      {l.lotName}
                                    </div>
                                    <div className="col-span-3 text-slate-700">
                                      {l.totalItems.toLocaleString()}
                                    </div>
                                    <div className="col-span-3">
                                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                        PENDING ({l.pendingItems}/{l.totalItems})
                                      </span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div>
                          <button
                            className="flex w-full items-center justify-between px-5 py-4 text-left"
                            onClick={() => setChecklistIncompleteOpen((v) => !v)}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-[#2c3e50]">
                                {checklistIncompleteOpen ? "▼" : "▶"}
                              </span>
                              <span className="text-lg font-semibold text-slate-900">
                                Incomplete
                              </span>
                              <span className="text-slate-500">
                                ({checklistIncompleteLots.length})
                              </span>
                            </div>
                          </button>

                          {checklistIncompleteOpen ? (
                            <div className="px-5 pb-5">
                              <div className="overflow-hidden rounded-xl border border-slate-200">
                                <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
                                  <div className="col-span-6">LOT NAME</div>
                                  <div className="col-span-3">TOTAL ITEMS</div>
                                  <div className="col-span-3">STATUS</div>
                                </div>
                                {checklistIncompleteLots.map((l) => (
                                  <button
                                    key={l.lotId}
                                    className="grid w-full grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 last:border-b-0"
                                    onClick={async () => {
                                      setSelectedLotId(l.lotId);
                                      setSelectedLotName(l.lotName);
                                      await loadChecklistItemsForLot(l.lotId);
                                    }}
                                  >
                                    <div className="col-span-6 font-medium text-slate-900">
                                      {l.lotName}
                                    </div>
                                    <div className="col-span-3 text-slate-700">
                                      {l.totalItems.toLocaleString()}
                                    </div>
                                    <div className="col-span-3">
                                      <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                                        PENDING (0/{l.totalItems})
                                      </span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>

                        <div>
                          <button
                            className="flex w-full items-center justify-between px-5 py-4 text-left"
                            onClick={() => setChecklistCompletedOpen((v) => !v)}
                          >
                            <div className="flex items-center gap-3">
                              <span className="text-[#2c3e50]">
                                {checklistCompletedOpen ? "▼" : "▶"}
                              </span>
                              <span className="text-lg font-semibold text-slate-900">
                                Completed
                              </span>
                              <span className="text-slate-500">
                                ({checklistCompletedLots.length})
                              </span>
                            </div>
                          </button>

                          {checklistCompletedOpen ? (
                            <div className="px-5 pb-5">
                              <div className="overflow-hidden rounded-xl border border-slate-200">
                                <div className="grid grid-cols-12 gap-2 border-b border-slate-200 bg-slate-50 px-4 py-3 text-xs font-medium text-slate-600">
                                  <div className="col-span-6">LOT NAME</div>
                                  <div className="col-span-3">TOTAL ITEMS</div>
                                  <div className="col-span-3">STATUS</div>
                                </div>
                                {checklistCompletedLots.map((l) => (
                                  <button
                                    key={l.lotId}
                                    className="grid w-full grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 last:border-b-0"
                                    onClick={async () => {
                                      setSelectedLotId(l.lotId);
                                      setSelectedLotName(l.lotName);
                                      await loadChecklistItemsForLot(l.lotId);
                                    }}
                                  >
                                    <div className="col-span-6 font-medium text-slate-900">
                                      {l.lotName}
                                    </div>
                                    <div className="col-span-3 text-slate-700">
                                      {l.totalItems.toLocaleString()}
                                    </div>
                                    <div className="col-span-3">
                                      <span className="inline-flex rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-[#2c3e50]">
                                        COMPLETE ({l.totalItems}/{l.totalItems})
                                      </span>
                                    </div>
                                  </button>
                                ))}
                              </div>
                            </div>
                          ) : null}
                        </div>

                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="text-2xl font-semibold text-slate-900">
                          {selectedLotName ? `${selectedLotName} Checklist` : "Checklist"}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                            onClick={() => {
                              setSelectedLotId("");
                              setSelectedLotName("");
                              setChecklistItems([]);
                            }}
                          >
                            Back
                          </button>
                          <button
                            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void bulkChecklist("checked")}
                            disabled={checklistLoading || checklistItems.length === 0}
                          >
                            Check all
                          </button>
                          <button
                            className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void bulkChecklist("unchecked")}
                            disabled={checklistLoading || checklistItems.length === 0}
                          >
                            Uncheck all
                          </button>
                        </div>
                      </div>

                      {checklistItems.length === 0 ? (
                        <div className="rounded-xl border border-slate-200 bg-white p-6 text-slate-600 shadow-sm">
                          No items in this lot.
                        </div>
                      ) : (
                        <div className="flex flex-wrap gap-3">
                          {checklistItems.map((it) => {
                            const status =
                              (it.checklist_status as string | null) ||
                              (it.checked ? "checked" : "unchecked");
                            const isChecked = status === "checked";
                            const isRejected = status === "rejected";
                            const border = isChecked
                              ? "border-emerald-400"
                              : isRejected
                                ? "border-rose-400"
                                : "border-slate-200";
                            const tint = isChecked
                              ? "bg-emerald-50"
                              : isRejected
                                ? "bg-rose-50"
                                : "bg-white";
                            const tintHover = isChecked
                              ? "hover:bg-emerald-50/80"
                              : isRejected
                                ? "hover:bg-rose-50/80"
                                : "hover:bg-slate-50";

                            return (
                              <button
                                key={String(it.id)}
                                className={`w-[98px] overflow-hidden rounded-md border ${border} ${tint} text-left shadow-sm ${tintHover}`}
                                onClick={() => {
                                  const next = cycleChecklistStatus(it);
                                  void toggleChecklistItem(String(it.id), next);
                                }}
                              >
                                <div
                                  className={`relative h-[84px] w-[98px] ${
                                    isChecked ? "bg-emerald-50/60" : isRejected ? "bg-rose-50/60" : "bg-slate-50"
                                  }`}
                                >
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

                                  {isChecked ? (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-500 text-white shadow">
                                        ✓
                                      </div>
                                    </div>
                                  ) : null}

                                  {isRejected ? (
                                    <div className="absolute inset-0 flex items-center justify-center">
                                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 text-white shadow">
                                        ✕
                                      </div>
                                    </div>
                                  ) : null}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      </div>
      {section === "users" && (showAdd || showEdit) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
          onClick={() => {
            setShowAdd(false);
            setShowEdit(false);
            setActiveUser(null);
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-slate-900">
              {showAdd ? "Add User" : "Edit User"}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <label className="block">
                <span className="text-sm text-slate-700">Username</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-700">Number</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                  value={form.number}
                  onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-700">
                  Password {showEdit ? "(leave blank to keep)" : "(optional)"}
                </span>
                <input
                  type="password"
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-700">Access Level</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                  value={form.access_level}
                  onChange={(e) => setForm((f) => ({ ...f, access_level: e.target.value }))}
                >
                  <option value="admin">admin</option>
                  <option value="manager">manager</option>
                  <option value="viewer">viewer</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
                onClick={() => {
                  setShowAdd(false);
                  setShowEdit(false);
                  setActiveUser(null);
                }}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-[#2c3e50] px-3 py-2 text-sm font-medium text-white hover:bg-[#1f2d3a] disabled:opacity-60"
                disabled={saving}
                onClick={showAdd ? createUser : saveEdit}
              >
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}

