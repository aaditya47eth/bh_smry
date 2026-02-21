"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { getCurrentUser, isAuthenticated } from "@/lib/session";

type AdminSection = "users" | "stats" | "checklist" | "auction";

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

type AuctionWatcherRow = {
  id: number | string;
  post_url: string;
  my_name: string;
  is_running: boolean;
  is_bookmarked?: boolean;
  created_by: string;
  created_at: string;
  updated_at?: string; // Added updated_at
  images?: string[];
  last_bid_amount?: number | null;
  last_bid_at?: string | null;
};

type BidRow = {
  id: number;
  post_url: string;
  bidder_name: string; // Changed from user_name to match DB
  user_id: string;
  bid_text: string;
  amount: number | null; // Changed from price to amount to match DB
  item_number?: number;
  timestamp: string;
  image_text?: string;
  profile_pic?: string;
};

type ActivityLogItem = {
  type: string;
  post_url: string;
  post_label: string;
  item_number?: number;
  my_bid: number;
  winning_bid: number;
  winner: string;
  timestamp: string;
};

type WinningBidItem = {
  post_url: string;
  post_label: string;
  item_number: number;
  my_bid: number;
  timestamp: string;
};

const ADMIN_SECTION_KEY = "adminPanelSelectedSection";
const CLOUDINARY_CLOUD_NAME = "daye1yfzy";
const CLOUDINARY_UPLOAD_PRESET = "bh_smry_upload";

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

  const [auctionWatchers, setAuctionWatchers] = useState<AuctionWatcherRow[]>([]);
  const [auctionLoading, setAuctionLoading] = useState(false);
  const [auctionError, setAuctionError] = useState<string | null>(null);
  const [auctionSort, setAuctionSort] = useState<"time_added" | "post_number" | "recent_bid">("time_added");

  const [cookiesInput, setCookiesInput] = useState("");
  const [savingCookies, setSavingCookies] = useState(false);
  const [cookiesStatus, setCookiesStatus] = useState<string | null>(null);

  const [viewBidsWatcherId, setViewBidsWatcherId] = useState<string | null>(null);
  const [viewImages, setViewImages] = useState<string[] | null>(null);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [bids, setBids] = useState<BidRow[]>([]);
  const [bidsLoading, setBidsLoading] = useState(false);
  const [bidsError, setBidsError] = useState<string | null>(null);

  const [activityLog, setActivityLog] = useState<ActivityLogItem[]>([]);
  const [winningBids, setWinningBids] = useState<WinningBidItem[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);

  const [showAddAuction, setShowAddAuction] = useState(false);
  const [showEditAuction, setShowEditAuction] = useState(false);
  const [activeAuction, setActiveAuction] = useState<AuctionWatcherRow | null>(null);
  const [cardImageIndices, setCardImageIndices] = useState<Record<string, number>>({});
  const [auctionForm, setAuctionForm] = useState({
    postUrl: "",
    postNumber: "",
    images: [] as string[]
  });
  const [uploadingImage, setUploadingImage] = useState(false);

  const [showAdd, setShowAdd] = useState(false);

  useEffect(() => {
    if (!viewImages) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        setCurrentImageIndex((prev) => (prev === 0 ? viewImages.length - 1 : prev - 1));
      } else if (e.key === "ArrowRight") {
        setCurrentImageIndex((prev) => (prev === viewImages.length - 1 ? 0 : prev + 1));
      } else if (e.key === "Escape") {
        setViewImages(null);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [viewImages]);
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
      paramSection && ["users", "stats", "checklist", "auction", "activity-log"].includes(paramSection)
        ? paramSection
        : savedSection && ["users", "stats", "checklist", "auction", "activity-log"].includes(savedSection)
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

  async function loadAuctions() {
    setAuctionLoading(true);
    setAuctionError(null);
    try {
      const res = await fetch("/api/admin/auctions", { cache: "no-store" });
      const json = (await res.json()) as ApiOk<{ watchers: AuctionWatcherRow[] }> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setAuctionWatchers(json.watchers);
    } catch (e: any) {
      setAuctionError(e?.message ?? "Failed to load auctions");
    } finally {
      setAuctionLoading(false);
    }
  }

  async function loadActivityLog() {
    setActivityLoading(true);
    try {
      const res = await fetch("/api/admin/activity-log", { cache: "no-store" });
      const json = (await res.json()) as ApiOk<{ activities: ActivityLogItem[]; winningBids: WinningBidItem[] }> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setActivityLog(json.activities);
      setWinningBids(json.winningBids || []);
    } catch (e: any) {
      console.error("Failed to load activity log", e);
    } finally {
      setActivityLoading(false);
    }
  }

  async function toggleBookmark(id: string | number, currentStatus: boolean) {
    try {
      const res = await fetch("/api/admin/auctions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, is_bookmarked: !currentStatus })
      });
      const json = (await res.json()) as ApiOk<Record<string, never>> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      await loadAuctions();
    } catch (e: any) {
      alert(e?.message ?? "Failed to toggle bookmark");
    }
  }

  async function deleteAuction(id: string | number) {
    if (!confirm("Delete this auction watcher?")) return;
    try {
      const res = await fetch(`/api/admin/auctions?id=${id}`, {
        method: "DELETE"
      });
      const json = (await res.json()) as ApiOk<Record<string, never>> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      await loadAuctions();
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete auction");
    }
  }

  async function deleteAllAuctions() {
    if (!confirm("Are you sure you want to delete ALL auction watchers? This cannot be undone.")) return;
    try {
      const res = await fetch(`/api/admin/auctions?all=true`, {
        method: "DELETE"
      });
      const json = (await res.json()) as ApiOk<Record<string, never>> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      await loadAuctions();
    } catch (e: any) {
      alert(e?.message ?? "Failed to delete all auctions");
    }
  }

  async function saveCookies() {
    if (!cookiesInput.trim()) return;
    setSavingCookies(true);
    try {
      const res = await fetch("/api/admin/cookies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cookies: cookiesInput })
      });
      const json = (await res.json()) as ApiOk<Record<string, never>> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setCookiesStatus("Cookies saved successfully!");
      setCookiesInput("");
      await checkCookieStatus();
      setTimeout(() => setCookiesStatus(null), 5000);
    } catch (e: any) {
      alert(e?.message ?? "Failed to save cookies");
    } finally {
      setSavingCookies(false);
    }
  }

  async function checkCookieStatus() {
    try {
      const res = await fetch("/api/admin/cookies");
      const json = (await res.json()) as ApiOk<{ lastUpdated: string | null }> | ApiErr;
      if (res.ok && json.ok && (json as any).lastUpdated) {
        setCookiesStatus(`Cookies active (Last updated: ${new Date((json as any).lastUpdated).toLocaleString()})`);
      } else {
        setCookiesStatus("No cookies set. Scraper may fail.");
      }
    } catch {}
  }

  const [nextRefreshTime, setNextRefreshTime] = useState<Date | null>(null);
  const [lastUpdatedTime, setLastUpdatedTime] = useState<Date | null>(null);
  const [timerString, setTimerString] = useState("");

  // Auto-refresh bids when modal is open
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (viewBidsWatcherId) {
      interval = setInterval(() => {
        fetch(`/api/admin/auctions/${encodeURIComponent(viewBidsWatcherId)}/bids`)
          .then((res) => res.json())
          .then((json: ApiOk<{ bids: BidRow[] }> | ApiErr) => {
            if (json.ok) {
              setBids(json.bids);
            }
          })
          .catch((err) => console.error("Auto-refresh failed", err));
      }, 5000); // Refresh every 5 seconds
    }
    return () => clearInterval(interval);
  }, [viewBidsWatcherId]);

  useEffect(() => {
      if (!nextRefreshTime) {
          setTimerString("");
          return;
      }
      const interval = setInterval(() => {
          const now = new Date().getTime();
          const diff = nextRefreshTime.getTime() - now;
          if (diff <= 0) {
              setTimerString("Refreshing soon...");
          } else {
              const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
              const s = Math.floor((diff % (1000 * 60)) / 1000);
              setTimerString(`Next refresh in: ${m}m ${s}s`);
          }
      }, 1000);
      return () => clearInterval(interval);
  }, [nextRefreshTime]);

  async function openBidsModal(watcher: AuctionWatcherRow) {
    setViewBidsWatcherId(String(watcher.id));
    setBidsLoading(true);
    setBidsError(null);
    setBids([]);
    
    // Calculate next refresh (2 mins from last update)
    if (watcher.updated_at) {
        const lastUpdate = new Date(watcher.updated_at);
        if (!isNaN(lastUpdate.getTime())) {
            setLastUpdatedTime(lastUpdate);
            if (watcher.is_running) {
                const next = new Date(lastUpdate.getTime() + 120000); // 2 mins
                setNextRefreshTime(next);
            } else {
                setNextRefreshTime(null);
            }
        } else {
            setLastUpdatedTime(null);
            setNextRefreshTime(null);
        }
    } else {
        setNextRefreshTime(null);
        setLastUpdatedTime(null);
    }

    try {
      const res = await fetch(`/api/admin/auctions/${encodeURIComponent(String(watcher.id))}/bids`);
      const json = (await res.json()) as ApiOk<{ bids: BidRow[] }> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setBids(json.bids);
    } catch (e: any) {
      setBidsError(e?.message ?? "Failed to load bids");
    } finally {
      setBidsLoading(false);
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
    if (section === "auction") {
      void loadAuctions();
      void checkCookieStatus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  useEffect(() => {
    void loadActivityLog();
  }, []);

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

  const sortedAuctions = useMemo(() => {
    const sorted = [...auctionWatchers];
    sorted.sort((a, b) => {
      // Always prioritize bookmarks
      if (a.is_bookmarked && !b.is_bookmarked) return -1;
      if (!a.is_bookmarked && b.is_bookmarked) return 1;

      if (auctionSort === "time_added") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      } else if (auctionSort === "post_number") {
        const getNum = (name: string) => {
            const m = name.match(/Post_No\.(\d+-\d+)/);
            return m ? m[1] : name;
        };
        return getNum(a.my_name).localeCompare(getNum(b.my_name));
      } else if (auctionSort === "recent_bid") {
        const timeA = a.last_bid_at ? new Date(a.last_bid_at).getTime() : 0;
        const timeB = b.last_bid_at ? new Date(b.last_bid_at).getTime() : 0;
        return timeB - timeA;
      }
      return 0;
    });
    return sorted;
  }, [auctionWatchers, auctionSort]);

  const title = section === "users" ? "Collector Management" : section === "stats" ? "Statistics" : section === "checklist" ? "Checklist" : "Auction Scraper";

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

  async function uploadToCloudinary(file: File): Promise<string> {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("upload_preset", CLOUDINARY_UPLOAD_PRESET);
    const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`, {
      method: "POST",
      body: formData
    });
    if (!res.ok) {
      const err = await res.json().catch(() => null);
      throw new Error(err?.error?.message || "Cloudinary upload failed");
    }
    const json = (await res.json()) as { secure_url: string };
    return json.secure_url;
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

  async function createAuction() {
    setSaving(true);
    try {
      const res = await fetch("/api/admin/auctions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          postUrl: auctionForm.postUrl,
          my_name: auctionForm.postNumber,
          images: auctionForm.images
        })
      });
      const json = (await res.json()) as ApiOk<Record<string, never>> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setShowAddAuction(false);
      await loadAuctions();
    } catch (e: any) {
      alert(e?.message ?? "Failed to create auction");
    } finally {
      setSaving(false);
    }
  }

  async function updateAuction() {
    if (!activeAuction) return;
    setSaving(true);
    try {
      const res = await fetch("/api/admin/auctions", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          id: activeAuction.id,
          post_url: auctionForm.postUrl,
          my_name: auctionForm.postNumber,
          images: auctionForm.images
        })
      });
      const json = (await res.json()) as ApiOk<Record<string, never>> | ApiErr;
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setShowEditAuction(false);
      setActiveAuction(null);
      await loadAuctions();
    } catch (e: any) {
      alert(e?.message ?? "Failed to update auction");
    } finally {
      setSaving(false);
    }
  }

  function openAddAuction() {
    setAuctionForm({ postUrl: "", postNumber: "", images: [] });
    setShowAddAuction(true);
  }

  function openEditAuction(w: AuctionWatcherRow) {
    const postNoMatch = w.my_name.match(/Post_No\.(\d+-\d+)/);
    const displayPostNo = postNoMatch ? `Post_No.${postNoMatch[1]}` : w.my_name;
    
    setActiveAuction(w);
    setAuctionForm({
        postUrl: w.post_url,
        postNumber: displayPostNo,
        images: w.images || []
    });
    setShowEditAuction(true);
  }

  return (
    <AppShell>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="mt-1 text-2xl font-semibold text-slate-900 dark:text-neutral-100">{title}</h1>
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
        <div className="inline-flex flex-col gap-4 self-start lg:w-64 lg:sticky lg:top-4">
          <div className="flex flex-col rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-1 shadow-sm">
            {(
              [
                { key: "users", label: "Collector Management" },
                { key: "stats", label: "Statistics" },
                { key: "checklist", label: "Checklist" },
                { key: "auction", label: "Auction" }
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
                    active ? "bg-slate-100 text-[#2c3e50]" : "text-slate-600 dark:text-neutral-400 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          {/* Activity Log & My Bids - Only visible in Auction section */}
          {section === "auction" && (
            <div className="flex flex-col gap-4">
                {/* Activity Log */}
                <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm" style={{ maxHeight: '300px' }}>
                  <div className="border-b border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900 px-4 py-2 font-semibold text-sm text-slate-900 dark:text-neutral-100">
                    Activity Log
                  </div>
                  <div className="flex-1 overflow-y-auto p-0">
                    {activityLoading ? (
                      <div className="p-4 text-center text-xs text-slate-500 dark:text-neutral-400">Loading...</div>
                    ) : activityLog.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 dark:text-neutral-400">No activity yet.</div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-neutral-700">
                        {activityLog.map((log, i) => (
                          <div key={i} className="p-2 hover:bg-slate-50 dark:hover:bg-neutral-700/50">
                            <div className="flex items-start gap-2">
                              <div className={`mt-1 flex h-1.5 w-1.5 shrink-0 rounded-full ${log.type === 'outbidded' ? 'bg-red-500' : 'bg-blue-500'}`} />
                              <div className="min-w-0 flex-1">
                                <div className="text-[10px] font-medium text-slate-900 dark:text-neutral-100">
                                  {log.type === 'outbidded' ? 'Outbidded!' : 'Bid Placed'}
                                </div>
                                <a 
                                  href={log.post_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="block truncate text-[10px] text-blue-600 hover:underline dark:text-blue-400"
                                  title={log.post_label}
                                >
                                  {log.post_label} {log.item_number ? `(Item ${log.item_number})` : ''}
                                </a>
                                <div className="text-[10px] text-slate-600 dark:text-neutral-400">
                                  {log.type === 'outbidded' ? (
                                      <>
                                          You: {log.my_bid} <span className="text-slate-300">|</span> Win: {log.winning_bid} ({log.winner})
                                      </>
                                  ) : (
                                      <>You bid {log.my_bid}</>
                                  )}
                                </div>
                                <div className="text-[9px] text-slate-400">
                                  {new Date(log.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {/* My Bids */}
                <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm" style={{ maxHeight: '300px' }}>
                  <div className="border-b border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900 px-4 py-2 font-semibold text-sm text-slate-900 dark:text-neutral-100">
                    My Winning Bids
                  </div>
                  <div className="flex-1 overflow-y-auto p-0">
                    {activityLoading ? (
                      <div className="p-4 text-center text-xs text-slate-500 dark:text-neutral-400">Loading...</div>
                    ) : winningBids.length === 0 ? (
                      <div className="p-4 text-center text-xs text-slate-500 dark:text-neutral-400">No winning bids yet.</div>
                    ) : (
                      <div className="divide-y divide-slate-100 dark:divide-neutral-700">
                        {winningBids.map((bid, i) => (
                          <div key={i} className="p-2 hover:bg-slate-50 dark:hover:bg-neutral-700/50">
                            <div className="flex items-start gap-2">
                              <div className="mt-1 flex h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                              <div className="min-w-0 flex-1">
                                <a 
                                  href={bid.post_url} 
                                  target="_blank" 
                                  rel="noopener noreferrer"
                                  className="block truncate text-[10px] font-medium text-blue-600 hover:underline dark:text-blue-400"
                                  title={bid.post_label}
                                >
                                  {bid.post_label}
                                </a>
                                <div className="flex justify-between text-[10px] text-slate-600 dark:text-neutral-400">
                                    <span>Item {bid.item_number}</span>
                                    <span className="font-bold text-emerald-600 dark:text-emerald-400">{bid.my_bid}</span>
                                </div>
                                <div className="text-[9px] text-slate-400">
                                  {bid.timestamp ? new Date(bid.timestamp).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : ''}
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
            </div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          {section === "users" ? (
            <>
              <div className="mt-0 rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <input
                    className="w-full rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                    placeholder="Search by username or number..."
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                  />
                  <button
                    className="shrink-0 rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                    onClick={loadUsers}
                  >
                    Refresh
                  </button>
                </div>
              </div>

              <div className="mt-4">
                {loading ? (
                  <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 text-slate-600 dark:text-neutral-400 shadow-sm">
                    Loading users...
                  </div>
                ) : error ? (
                  <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
                    {error}
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm">
                    <div className="grid grid-cols-12 gap-2 border-b border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900 px-4 py-3 text-xs font-medium text-slate-600 dark:text-neutral-400">
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
                            : "bg-slate-50 dark:bg-neutral-900 text-slate-700 dark:text-neutral-300 border-slate-200 dark:border-neutral-700";

                      return (
                        <div
                          key={String(u.id)}
                          className="grid grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 text-sm last:border-b-0"
                        >
                          <div className="col-span-4">
                            <div className="font-medium text-slate-900 dark:text-neutral-100">
                              {u.username || "—"}
                            </div>
                            {!hasPassword ? (
                              <div className="mt-0.5 text-xs text-rose-600">
                                Password not set
                              </div>
                            ) : null}
                          </div>
                          <div className="col-span-3 text-slate-700 dark:text-neutral-300">{u.number || "—"}</div>
                          <div className="col-span-2">
                            <span
                              className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${badgeColor}`}
                            >
                              {access}
                            </span>
                          </div>
                          <div className="col-span-3 flex justify-end gap-2">
                            <button
                              className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
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
                <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 text-slate-600 dark:text-neutral-400 shadow-sm">
                  Loading stats...
                </div>
              ) : statsError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
                  {statsError}
                </div>
              ) : stats ? (
                <div className="space-y-4">
                  <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-2 shadow-sm">
                    <div className="flex gap-2">
                      <button
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                          statsTab === "lot"
                            ? "bg-slate-900 text-white"
                            : "bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                        }`}
                        onClick={() => setStatsTab("lot")}
                      >
                        Lot-wise Stats
                      </button>
                      <button
                        className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium ${
                          statsTab === "person"
                            ? "bg-slate-900 text-white"
                            : "bg-white dark:bg-neutral-800 text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                        }`}
                        onClick={() => setStatsTab("person")}
                      >
                        Person-wise Stats
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
                    <div className="text-sm font-medium text-slate-700 dark:text-neutral-300">Month</div>
                    <select
                      className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
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
                            className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5 shadow-sm"
                          >
                            <div className="text-sm text-slate-600 dark:text-neutral-400">{c.label}</div>
                            <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-neutral-100">
                              {typeof c.value === "number"
                                ? c.value.toLocaleString()
                                : c.value}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm">
                        <div className="grid grid-cols-12 gap-2 border-b border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900 px-4 py-3 text-xs font-medium text-slate-600 dark:text-neutral-400">
                          <button
                            className="col-span-3 text-left hover:text-slate-900 dark:text-neutral-100"
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
                            className="col-span-3 text-left hover:text-slate-900 dark:text-neutral-100"
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
                            className="col-span-3 text-left hover:text-slate-900 dark:text-neutral-100"
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
                            className="col-span-3 text-right hover:text-slate-900 dark:text-neutral-100"
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
                            className="grid w-full grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900 last:border-b-0"
                            onClick={() =>
                              router.push(
                                `/lot?lot_id=${encodeURIComponent(
                                  row.lotId
                                )}&lot_name=${encodeURIComponent(row.lotName)}`
                              )
                            }
                          >
                            <div className="col-span-3 font-medium text-slate-900 dark:text-neutral-100">
                              {row.lotName}
                            </div>
                            <div className="col-span-3 text-slate-700 dark:text-neutral-300">
                              {row.participants.toLocaleString()}
                            </div>
                            <div className="col-span-3 text-slate-700 dark:text-neutral-300">
                              {row.totalItems.toLocaleString()}
                            </div>
                            <div className="col-span-3 text-right font-medium text-slate-900 dark:text-neutral-100">
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
                            className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5 shadow-sm"
                          >
                            <div className="text-sm text-slate-600 dark:text-neutral-400">{c.label}</div>
                            <div className="mt-2 text-2xl font-semibold text-slate-900 dark:text-neutral-100">
                              {typeof c.value === "number"
                                ? c.value.toLocaleString()
                                : c.value}
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm">
                        <div className="grid grid-cols-12 gap-2 border-b border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900 px-4 py-3 text-xs font-medium text-slate-600 dark:text-neutral-400">
                          <button
                            className="col-span-3 text-left hover:text-slate-900 dark:text-neutral-100"
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
                            className="col-span-3 text-left hover:text-slate-900 dark:text-neutral-100"
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
                            className="col-span-3 text-left hover:text-slate-900 dark:text-neutral-100"
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
                            className="col-span-3 text-right hover:text-slate-900 dark:text-neutral-100"
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
                            className="grid w-full grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 text-sm text-left hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900 last:border-b-0"
                            onClick={() =>
                              router.push(
                                `/person?username=${encodeURIComponent(row.username)}`
                              )
                            }
                          >
                            <div className="col-span-3 font-medium text-slate-900 dark:text-neutral-100">
                              {row.username}
                            </div>
                            <div className="col-span-3 text-slate-700 dark:text-neutral-300">
                              {row.lotsParticipated.toLocaleString()}
                            </div>
                            <div className="col-span-3 text-slate-700 dark:text-neutral-300">
                              {row.figsCollected.toLocaleString()}
                            </div>
                            <div className="col-span-3 text-right font-medium text-slate-900 dark:text-neutral-100">
                              ₹{formatInr(row.amount)}
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 text-slate-600 dark:text-neutral-400 shadow-sm">
                  No stats yet.
                </div>
              )}
            </div>
          ) : section === "checklist" ? (
            <div className="mt-0 space-y-4">
              {checklistLoading ? (
                <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 text-slate-600 dark:text-neutral-400 shadow-sm">
                  Loading checklist...
                </div>
              ) : checklistError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
                  {checklistError}
                </div>
              ) : (
                <>
                  {checklistMode === "summary" ? (
                    <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm">
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
                              <span className="text-lg font-semibold text-slate-900 dark:text-neutral-100">
                                Partial
                              </span>
                              <span className="text-slate-500">
                                ({checklistPartialLots.length})
                              </span>
                            </div>
                          </button>

                          {checklistPartialOpen ? (
                            <div className="px-5 pb-5">
                              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-700">
                                <div className="grid grid-cols-12 gap-2 border-b border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900 px-4 py-3 text-xs font-medium text-slate-600 dark:text-neutral-400">
                                  <div className="col-span-6">LOT NAME</div>
                                  <div className="col-span-3">TOTAL ITEMS</div>
                                  <div className="col-span-3">STATUS</div>
                                </div>
                                {checklistPartialLots.map((l) => (
                                  <button
                                    key={l.lotId}
                                    className="grid w-full grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900 last:border-b-0"
                                    onClick={async () => {
                                      setSelectedLotId(l.lotId);
                                      setSelectedLotName(l.lotName);
                                      await loadChecklistItemsForLot(l.lotId);
                                    }}
                                  >
                                    <div className="col-span-6 font-medium text-slate-900 dark:text-neutral-100">
                                      {l.lotName}
                                    </div>
                                    <div className="col-span-3 text-slate-700 dark:text-neutral-300">
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
                              <span className="text-lg font-semibold text-slate-900 dark:text-neutral-100">
                                Incomplete
                              </span>
                              <span className="text-slate-500">
                                ({checklistIncompleteLots.length})
                              </span>
                            </div>
                          </button>

                          {checklistIncompleteOpen ? (
                            <div className="px-5 pb-5">
                              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-700">
                                <div className="grid grid-cols-12 gap-2 border-b border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900 px-4 py-3 text-xs font-medium text-slate-600 dark:text-neutral-400">
                                  <div className="col-span-6">LOT NAME</div>
                                  <div className="col-span-3">TOTAL ITEMS</div>
                                  <div className="col-span-3">STATUS</div>
                                </div>
                                {checklistIncompleteLots.map((l) => (
                                  <button
                                    key={l.lotId}
                                    className="grid w-full grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900 last:border-b-0"
                                    onClick={async () => {
                                      setSelectedLotId(l.lotId);
                                      setSelectedLotName(l.lotName);
                                      await loadChecklistItemsForLot(l.lotId);
                                    }}
                                  >
                                    <div className="col-span-6 font-medium text-slate-900 dark:text-neutral-100">
                                      {l.lotName}
                                    </div>
                                    <div className="col-span-3 text-slate-700 dark:text-neutral-300">
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
                              <span className="text-lg font-semibold text-slate-900 dark:text-neutral-100">
                                Completed
                              </span>
                              <span className="text-slate-500">
                                ({checklistCompletedLots.length})
                              </span>
                            </div>
                          </button>

                          {checklistCompletedOpen ? (
                            <div className="px-5 pb-5">
                              <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-neutral-700">
                                <div className="grid grid-cols-12 gap-2 border-b border-slate-200 dark:border-neutral-700 bg-slate-50 dark:bg-neutral-900 px-4 py-3 text-xs font-medium text-slate-600 dark:text-neutral-400">
                                  <div className="col-span-6">LOT NAME</div>
                                  <div className="col-span-3">TOTAL ITEMS</div>
                                  <div className="col-span-3">STATUS</div>
                                </div>
                                {checklistCompletedLots.map((l) => (
                                  <button
                                    key={l.lotId}
                                    className="grid w-full grid-cols-12 gap-2 border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900 last:border-b-0"
                                    onClick={async () => {
                                      setSelectedLotId(l.lotId);
                                      setSelectedLotName(l.lotName);
                                      await loadChecklistItemsForLot(l.lotId);
                                    }}
                                  >
                                    <div className="col-span-6 font-medium text-slate-900 dark:text-neutral-100">
                                      {l.lotName}
                                    </div>
                                    <div className="col-span-3 text-slate-700 dark:text-neutral-300">
                                      {l.totalItems.toLocaleString()}
                                    </div>
                                    <div className="col-span-3">
                                      <span className="inline-flex rounded-full border border-slate-200 dark:border-neutral-700 bg-slate-100 px-3 py-1 text-xs font-semibold text-[#2c3e50]">
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
                      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
                        <div className="text-2xl font-semibold text-slate-900 dark:text-neutral-100">
                          {selectedLotName ? `${selectedLotName} Checklist` : "Checklist"}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                            onClick={() => {
                              setSelectedLotId("");
                              setSelectedLotName("");
                              setChecklistItems([]);
                            }}
                          >
                            Back
                          </button>
                          <button
                            className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void bulkChecklist("checked")}
                            disabled={checklistLoading || checklistItems.length === 0}
                          >
                            Check all
                          </button>
                          <button
                            className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900 disabled:cursor-not-allowed disabled:opacity-60"
                            onClick={() => void bulkChecklist("unchecked")}
                            disabled={checklistLoading || checklistItems.length === 0}
                          >
                            Uncheck all
                          </button>
                        </div>
                      </div>

                      {checklistItems.length === 0 ? (
                        <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 text-slate-600 dark:text-neutral-400 shadow-sm">
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
                                : "border-slate-200 dark:border-neutral-700";
                            const tint = isChecked
                              ? "bg-emerald-50"
                              : isRejected
                                ? "bg-rose-50"
                                : "bg-white dark:bg-neutral-800";
                            const tintHover = isChecked
                              ? "hover:bg-emerald-50/80"
                              : isRejected
                                ? "hover:bg-rose-50/80"
                                : "hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900";

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
                                    isChecked ? "bg-emerald-50/60" : isRejected ? "bg-rose-50/60" : "bg-slate-50 dark:bg-neutral-900"
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
          ) : (
            <div className="mt-0 space-y-4">
              {/* Cookies Section */}
              <details className="group rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-sm">
                <summary className="flex cursor-pointer items-center justify-between p-4 font-semibold text-slate-900 dark:text-neutral-100">
                  <span>Facebook Session (Cookies)</span>
                  <span className="text-slate-500 group-open:rotate-180">▼</span>
                </summary>
                <div className="px-4 pb-4">
                  <div className="mb-3">
                    <div className="mt-0.5 text-xs text-slate-500">
                      Paste your Facebook cookies JSON here to allow the scraper to log in.
                    </div>
                  </div>
                  <textarea
                    className="w-full rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-xs font-mono text-slate-900 dark:text-neutral-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                    rows={3}
                    placeholder='[{"domain": ".facebook.com", ...}]'
                    value={cookiesInput}
                    onChange={(e) => setCookiesInput(e.target.value)}
                  />
                  <div className="mt-2 flex items-center justify-between">
                    <div className="text-xs font-medium text-emerald-600">
                      {cookiesStatus}
                    </div>
                    <button
                      className="rounded-md bg-slate-900 px-3 py-2 text-xs font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      onClick={saveCookies}
                      disabled={savingCookies || !cookiesInput.trim()}
                    >
                      {savingCookies ? "Saving..." : "Save Cookies"}
                    </button>
                  </div>
                </div>
              </details>

              <div className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
                <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-slate-700 dark:text-neutral-300">Sort by:</span>
                    <select 
                        className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                        value={auctionSort}
                        onChange={(e) => setAuctionSort(e.target.value as any)}
                    >
                        <option value="time_added">Time Added</option>
                        <option value="post_number">Post Number</option>
                        <option value="recent_bid">Recent Bid</option>
                    </select>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        className="rounded-md bg-[#2c3e50] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#1f2d3a]"
                        onClick={openAddAuction}
                    >
                        Add Post
                    </button>
                    <button
                        className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-100"
                        onClick={deleteAllAuctions}
                    >
                        Delete All
                    </button>
                </div>
              </div>

              {auctionLoading ? (
                <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 text-slate-600 dark:text-neutral-400 shadow-sm">
                  Loading auctions...
                </div>
              ) : auctionError ? (
                <div className="rounded-xl border border-red-200 bg-red-50 p-6 text-red-700">
                  {auctionError}
                </div>
              ) : sortedAuctions.length === 0 ? (
                <div className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-6 text-slate-600 dark:text-neutral-400 shadow-sm">
                  No active auctions found. Run the scraper to discover posts.
                </div>
              ) : (
                <div className="grid grid-cols-1 gap-4">
                  {sortedAuctions.map((w) => {
                    const postNoMatch = w.my_name.match(/Post_No\.(\d+-\d+)/);
                    const displayName = postNoMatch ? `Post_No.${postNoMatch[1]}` : w.my_name;
                    const currentImgIdx = cardImageIndices[w.id] || 0;
                    const images = w.images || [];
                    
                    return (
                    <div key={w.id} className="rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-4 shadow-sm">
                      <div className="flex flex-col gap-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-3">
                              <button
                                onClick={() => toggleBookmark(w.id, !!w.is_bookmarked)}
                                className={`text-xl focus:outline-none ${w.is_bookmarked ? "text-amber-400" : "text-slate-300 hover:text-amber-400"}`}
                                title={w.is_bookmarked ? "Remove bookmark" : "Bookmark this post"}
                              >
                                ★
                              </button>
                              <a 
                                href={w.post_url} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="text-lg font-bold text-blue-600 hover:underline dark:text-blue-400"
                              >
                                {displayName}
                              </a>
                            </div>
                            <div className="mt-1 text-xs text-slate-500">
                              Created by: {w.created_by} • {new Date(w.created_at).toLocaleString()}
                              {w.last_bid_amount && (
                                <span className="ml-2 font-medium text-emerald-600 dark:text-emerald-400">
                                    • Last Bid: {w.last_bid_amount} ({w.last_bid_at ? new Date(w.last_bid_at).toLocaleTimeString() : '?'})
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                              onClick={() => openEditAuction(w)}
                            >
                              Edit
                            </button>
                            <button
                              className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-1.5 text-xs font-medium text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                              onClick={() => openBidsModal(w)}
                            >
                              View Bids
                            </button>
                            <button
                              className="rounded-md border border-rose-200 bg-rose-50 px-3 py-1.5 text-xs font-medium text-rose-700 hover:bg-rose-100"
                              onClick={() => deleteAuction(w.id)}
                            >
                              Delete
                            </button>
                          </div>
                        </div>

                        {/* Images Row */}
                        {w.images && w.images.length > 0 ? (
                          <div className="flex gap-2 overflow-x-auto pb-2">
                            {w.images.map((img, idx) => (
                              <div 
                                key={idx}
                                className="relative h-24 w-24 shrink-0 cursor-pointer overflow-hidden rounded-md border border-slate-200 dark:border-neutral-700 hover:opacity-90"
                                onClick={() => {
                                  setViewImages(w.images || []);
                                  setCurrentImageIndex(idx);
                                }}
                              >
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img 
                                  src={img} 
                                  alt={`Image ${idx + 1}`} 
                                  className="h-full w-full object-cover"
                                  loading="lazy"
                                />
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-xs italic text-slate-400">No images found</div>
                        )}
                      </div>
                    </div>
                  );
                  })}
                </div>
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
            className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-slate-900 dark:text-neutral-100">
              {showAdd ? "Add User" : "Edit User"}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <label className="block">
                <span className="text-sm text-slate-700 dark:text-neutral-300">Username</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                  value={form.username}
                  onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-700 dark:text-neutral-300">Number</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                  value={form.number}
                  onChange={(e) => setForm((f) => ({ ...f, number: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-700 dark:text-neutral-300">
                  Password {showEdit ? "(leave blank to keep)" : "(optional)"}
                </span>
                <input
                  type="password"
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-700 dark:text-neutral-300">Access Level</span>
                <select
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
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
                className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
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

      {viewBidsWatcherId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setViewBidsWatcherId(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-4xl flex-col rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-neutral-700 px-5 py-4">
              <div className="flex items-center gap-4">
                  <div className="text-lg font-semibold text-slate-900 dark:text-neutral-100">Bids Found</div>
                  <div className="flex items-center gap-2">
                      {lastUpdatedTime && (
                          <div className="text-xs text-slate-500 dark:text-neutral-400">
                              Last updated: {lastUpdatedTime.toLocaleTimeString()}
                          </div>
                      )}
                      {timerString && (
                          <div className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900 dark:text-blue-200">
                              {timerString}
                          </div>
                      )}
                  </div>
              </div>
              <button
                className="rounded-md p-1 hover:bg-slate-100 dark:hover:bg-neutral-700"
                onClick={() => setViewBidsWatcherId(null)}
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-auto p-5">
              {bidsLoading ? (
                <div className="py-10 text-center text-slate-500 dark:text-neutral-400">Loading bids...</div>
              ) : bidsError ? (
                <div className="rounded-md bg-red-50 p-4 text-red-700 dark:bg-red-900 dark:text-red-300">{bidsError}</div>
              ) : bids.length === 0 ? (
                <div className="py-10 text-center text-slate-500 dark:text-neutral-400">
                  No bids found yet for this post.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5 md:grid-cols-6 lg:grid-cols-8">
                  {Array.from({ length: 50 }, (_, i) => i + 1).map((itemNum) => {
                    const itemBids = bids.filter((b) => b.item_number === itemNum);
                    if (itemBids.length === 0) return null; // Only show items with activity? Or show all? User said "around 30..40 items". Let's show only active ones or up to max found.
                    // Actually, let's show items if they have bids.
                    // Or better: Find max item number and show grid up to that.
                    return null; 
                  })}
                  
                  {(() => {
                      // Group bids by item
                      const itemMap = new Map<number, BidRow[]>();
                      let maxItem = 0;
                      bids.forEach(b => {
                          if (b.item_number) {
                              if (!itemMap.has(b.item_number)) itemMap.set(b.item_number, []);
                              itemMap.get(b.item_number)?.push(b);
                              if (b.item_number > maxItem) maxItem = b.item_number;
                          }
                      });
                      
                      // Ensure we show at least up to 40 if data exists, or just dynamic
                      const limit = Math.max(maxItem, 40);
                      const gridItems = [];

                      for (let i = 1; i <= limit; i++) {
                          const itemBids = itemMap.get(i) || [];
                          // Sort by amount desc, then time asc (First bid wins)
                          itemBids.sort((a, b) => {
                              const amountA = a.amount || 0;
                              const amountB = b.amount || 0;
                              if (amountA !== amountB) return amountB - amountA;
                              
                              const timeA = new Date(a.timestamp || 0).getTime();
                              const timeB = new Date(b.timestamp || 0).getTime();
                              return (isNaN(timeA) ? 0 : timeA) - (isNaN(timeB) ? 0 : timeB);
                          });
                          
                          const highestBid = itemBids[0];
                          const myBids = itemBids.filter(b => (b.bidder_name || "").trim().toLowerCase() === "ken kaneki"); 
                          
                          let statusColor = "bg-slate-50 dark:bg-neutral-900 border-slate-200 dark:border-neutral-700"; // Default
                          let statusText = "";

                          if (highestBid) {
                              const highestUser = (highestBid.bidder_name || "").trim().toLowerCase();
                              if (highestUser === "ken kaneki") {
                                  statusColor = "bg-emerald-100 border-emerald-300 dark:bg-emerald-900/40 dark:border-emerald-700"; // Green (Mine)
                                  statusText = "Winning";
                              } else if (myBids.length > 0) {
                                  statusColor = "bg-rose-100 border-rose-300 dark:bg-rose-900/40 dark:border-rose-700"; // Red (Overbidded)
                                  statusText = "Outbidded";
                              } else {
                                  statusColor = "bg-amber-100 border-amber-300 dark:bg-amber-900/40 dark:border-amber-700"; // Yellow (Not bidded)
                              }
                          }

                          gridItems.push(
                              <div key={i} className={`relative flex flex-col justify-between rounded-md border p-1.5 shadow-sm transition-all hover:shadow-md ${statusColor}`}>
                                  <div className="flex items-start justify-between">
                                      <span className="text-xs font-bold text-slate-700 dark:text-neutral-200">#{i}</span>
                                      {itemBids.length > 0 && (
                                          <span className="rounded-full bg-black/5 px-1 py-0.5 text-[8px] font-medium text-slate-600 dark:bg-white/10 dark:text-neutral-300">
                                              {itemBids.length}
                                          </span>
                                      )}
                                  </div>
                                  
                                  <div className="mt-1">
                                      {highestBid ? (
                                          <>
                                              <div className="text-sm font-bold text-slate-900 dark:text-white">
                                                  {highestBid.amount != null ? highestBid.amount : '?'}
                                              </div>
                                              <div className="mt-0.5 truncate text-[9px] font-medium text-slate-800 dark:text-neutral-100" title={highestBid.bidder_name}>
                                                  {highestBid.bidder_name || "Unknown"}
                                              </div>
                                              <div className="mt-0.5 text-[8px] text-slate-500 dark:text-neutral-400">
                                                  {(() => {
                                                      try {
                                                          const d = new Date(highestBid.timestamp);
                                                          return isNaN(d.getTime()) ? "?" : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                                                      } catch { return "?"; }
                                                  })()}
                                              </div>
                                              {statusText && (
                                                  <div className={`mt-0.5 text-[8px] font-bold uppercase tracking-wider ${
                                                      statusText === 'Winning' ? 'text-emerald-700 dark:text-emerald-400' :
                                                      'text-rose-700 dark:text-rose-400'
                                                  }`}>
                                                      {statusText}
                                                  </div>
                                              )}
                                          </>
                                      ) : (
                                          <div className="mt-1 text-center text-[9px] text-slate-400 italic">
                                              -
                                          </div>
                                      )}
                                  </div>
                              </div>
                          );
                      }
                      return gridItems;
                  })()}
                </div>
              )}
            </div>

            <div className="border-t border-slate-200 dark:border-neutral-700 px-5 py-3 text-right">
              <button
                className="rounded-md bg-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-300 dark:bg-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-600"
                onClick={() => setViewBidsWatcherId(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {viewImages && viewImages.length > 0 && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
          onClick={() => setViewImages(null)}
        >
          <div
            className="relative flex h-full max-h-[90vh] w-full max-w-5xl items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="absolute right-4 top-4 z-10 rounded-full bg-black/50 p-2 text-white hover:bg-black/70"
              onClick={() => setViewImages(null)}
            >
              ✕
            </button>

            {/* Previous Button */}
            {viewImages.length > 1 && (
              <button
                className="absolute left-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white hover:bg-black/70 disabled:opacity-30"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentImageIndex((prev) => (prev === 0 ? viewImages.length - 1 : prev - 1));
                }}
              >
                ‹
              </button>
            )}

            {/* Main Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={viewImages[currentImageIndex]}
              alt={`Image ${currentImageIndex + 1}`}
              className="max-h-full max-w-full object-contain shadow-2xl"
            />

            {/* Next Button */}
            {viewImages.length > 1 && (
              <button
                className="absolute right-4 top-1/2 z-10 -translate-y-1/2 rounded-full bg-black/50 p-3 text-white hover:bg-black/70 disabled:opacity-30"
                onClick={(e) => {
                  e.stopPropagation();
                  setCurrentImageIndex((prev) => (prev === viewImages.length - 1 ? 0 : prev + 1));
                }}
              >
                ›
              </button>
            )}

            {/* Counter */}
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-sm text-white">
              {currentImageIndex + 1} / {viewImages.length}
            </div>
          </div>
        </div>
      )}

      {/* Add/Edit Auction Modal */}
      {(showAddAuction || showEditAuction) && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => {
            setShowAddAuction(false);
            setShowEditAuction(false);
            setActiveAuction(null);
          }}
        >
          <div
            className="w-full max-w-lg rounded-xl border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-lg font-semibold text-slate-900 dark:text-neutral-100">
              {showAddAuction ? "Add New Post" : "Edit Post"}
            </div>

            <div className="mt-4 grid grid-cols-1 gap-3">
              <label className="block">
                <span className="text-sm text-slate-700 dark:text-neutral-300">Post URL</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                  value={auctionForm.postUrl}
                  onChange={(e) => setAuctionForm((f) => ({ ...f, postUrl: e.target.value }))}
                  placeholder="https://facebook.com/..."
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-700 dark:text-neutral-300">Post Number / Name</span>
                <input
                  className="mt-1 w-full rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-900 dark:text-neutral-100 focus:outline-none focus:ring-2 focus:ring-[#2c3e50]/15"
                  value={auctionForm.postNumber}
                  onChange={(e) => setAuctionForm((f) => ({ ...f, postNumber: e.target.value }))}
                  placeholder="Post_No.XXXX-XX"
                />
              </label>

              <label className="block">
                <span className="text-sm text-slate-700 dark:text-neutral-300">Images</span>
                <div 
                    className="mt-1 flex min-h-[100px] cursor-text flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-center text-sm text-slate-500 hover:bg-slate-100 focus:border-blue-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900 dark:hover:bg-neutral-800"
                    tabIndex={0}
                    onPaste={async (e) => {
                        const items = e.clipboardData?.items;
                        if (!items) return;

                        const filesToUpload: File[] = [];
                        const textItems: DataTransferItem[] = [];

                        // Extract synchronously
                        for (let i = 0; i < items.length; i++) {
                            const item = items[i];
                            if (item.type.startsWith("image/")) {
                                const file = item.getAsFile();
                                if (file) filesToUpload.push(file);
                            } else if (item.type === "text/plain") {
                                textItems.push(item);
                            }
                        }

                        // Handle text (URLs)
                        for (const item of textItems) {
                             item.getAsString((text) => {
                                if (text.startsWith("http")) {
                                    setAuctionForm(prev => ({ ...prev, images: [...prev.images, text] }));
                                }
                            });
                        }

                        // Handle images
                        if (filesToUpload.length > 0) {
                            setUploadingImage(true);
                            try {
                                for (const file of filesToUpload) {
                                    const url = await uploadToCloudinary(file);
                                    setAuctionForm(prev => ({ ...prev, images: [...prev.images, url] }));
                                }
                            } catch (err: any) {
                                alert("Failed to upload image: " + err.message);
                            } finally {
                                setUploadingImage(false);
                            }
                        }
                    }}
                >
                    {uploadingImage ? (
                        <span>Uploading...</span>
                    ) : (
                        <span>Click here and press Ctrl+V to paste image or URL</span>
                    )}
                </div>

                {/* Image List */}
                {auctionForm.images.length > 0 && (
                    <div className="mt-3 grid grid-cols-4 gap-2">
                        {auctionForm.images.map((img, idx) => (
                            <div key={idx} className="relative aspect-square overflow-hidden rounded-md border border-slate-200 dark:border-neutral-700">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img src={img} alt="" className="h-full w-full object-cover" />
                                <button
                                    className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white hover:bg-black/80"
                                    onClick={() => {
                                        setAuctionForm(prev => ({
                                            ...prev,
                                            images: prev.images.filter((_, i) => i !== idx)
                                        }));
                                    }}
                                >
                                    ✕
                                </button>
                            </div>
                        ))}
                    </div>
                )}
              </label>
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md border border-slate-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 px-3 py-2 text-sm text-slate-700 dark:text-neutral-300 hover:bg-slate-50 dark:hover:bg-neutral-700 dark:bg-neutral-900"
                onClick={() => {
                  setShowAddAuction(false);
                  setShowEditAuction(false);
                  setActiveAuction(null);
                }}
              >
                Cancel
              </button>
              <button
                className="rounded-md bg-[#2c3e50] px-3 py-2 text-sm font-medium text-white hover:bg-[#1f2d3a] disabled:opacity-60"
                disabled={saving}
                onClick={showAddAuction ? createAuction : updateAuction}
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

