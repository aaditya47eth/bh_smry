"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getCurrentUser, hasPermission, isAuthenticated } from "@/lib/session";

type LotRow = {
  id: number | string;
  lot_name: string;
  created_at: string | null;
  locked?: boolean | null;
};

type UserRow = {
  id: number | string;
  username: string | null;
  number: string | null;
};

type ItemRow = {
  id: number | string;
  lot_id: number | string;
  username: string | null;
  picture_url: string | null;
  price: string | number | null;
  cancelled?: boolean | null;
  created_at?: string | null;
};

const CLOUDINARY_CLOUD_NAME = "daye1yfzy";
const CLOUDINARY_UPLOAD_PRESET = "bh_smry_upload";

function toNumber(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export default function LotClient() {
  const router = useRouter();
  const params = useSearchParams();
  const lotIdParam = params.get("lot_id");
  const lotNameParam = params.get("lot_name");

  const galleryRef = useRef<HTMLDivElement | null>(null);
  const addCollectorInputRef = useRef<HTMLInputElement | null>(null);
  const addPriceInputRef = useRef<HTMLInputElement | null>(null);

  const [lots, setLots] = useState<LotRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);

  const [lotId, setLotId] = useState<string>(lotIdParam ?? "");
  const [lotName, setLotName] = useState<string>(lotNameParam ?? "");
  const [locked, setLocked] = useState(false);

  const [items, setItems] = useState<ItemRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const currentUser = getCurrentUser();
  const canAdd = hasPermission("add");
  const canEdit = hasPermission("edit");
  const isAdmin = (currentUser?.access_level ?? "").toLowerCase() === "admin";
  const isViewer = (currentUser?.access_level ?? "").toLowerCase() === "viewer";
  const currentUsername = (currentUser?.username ?? "").trim();

  // UI state
  const [showTotals, setShowTotals] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [quality, setQuality] = useState(2);
  const [generating, setGenerating] = useState(false);

  // Per-item actions (legacy: magnify + 3-dot dropdown)
  const [openItemMenuId, setOpenItemMenuId] = useState<string | null>(null);
  const [zoomImageUrl, setZoomImageUrl] = useState<string | null>(null);

  // Inline price edit (legacy parity)
  const [editingPriceItemId, setEditingPriceItemId] = useState<string | null>(null);
  const [editingPriceValue, setEditingPriceValue] = useState<string>("");

  // Add modal
  const [addOpen, setAddOpen] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [pastedFile, setPastedFile] = useState<File | null>(null);
  const [pastedPreviewUrl, setPastedPreviewUrl] = useState<string | null>(null);

  // Pass modal (legacy)
  const [passOpen, setPassOpen] = useState(false);
  const [passUsername, setPassUsername] = useState("");
  const [passItemId, setPassItemId] = useState<string | null>(null);

  // Smart paste
  const [smartPasting, setSmartPasting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated()) router.push("/");
  }, [router]);

  useEffect(() => {
    // Close item menu when clicking outside (mirrors legacy behavior).
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest(".item-menu")) return;
      setOpenItemMenuId(null);
    };
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  useEffect(() => {
    void init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!addOpen) return;
    // When opening the modal, put cursor in collector field (legacy UX).
    setTimeout(() => addCollectorInputRef.current?.focus(), 0);
  }, [addOpen]);

  useEffect(() => {
    // Legacy behavior: if user pastes an image anywhere, open Add modal
    // and attach the pasted image automatically.
    const onGlobalPaste = (e: ClipboardEvent) => {
      if (!canAdd || locked) return;
      const clipItems = e.clipboardData?.items;
      if (!clipItems || clipItems.length === 0) return;

      for (const it of clipItems) {
        if (!it.type.startsWith("image/")) continue;
        const file = it.getAsFile();
        if (!file) continue;
        e.preventDefault();
        if (!addOpen) setAddOpen(true);
        setPastedFile(file);
        const url = URL.createObjectURL(file);
        if (pastedPreviewUrl) URL.revokeObjectURL(pastedPreviewUrl);
        setPastedPreviewUrl(url);
        break;
      }
    };

    document.addEventListener("paste", onGlobalPaste);
    return () => document.removeEventListener("paste", onGlobalPaste);
  }, [addOpen, canAdd, locked, pastedPreviewUrl]);

  useEffect(() => {
    // Keep state in sync with URL when user navigates via back/forward.
    setLotId(lotIdParam ?? "");
    setLotName(lotNameParam ?? "");
  }, [lotIdParam, lotNameParam]);

  useEffect(() => {
    if (!lotId) return;
    void loadLotAndItems(lotId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lotId]);

  useEffect(() => {
    // Keep CSS variables in sync (legacy zoom behavior)
    const imageSize = Math.round(100 * (zoom / 100));
    const priceSize = 1.0 * (zoom / 100);
    const labelSize = 0.9 * (zoom / 100);
    const totalSize = 0.9 * (zoom / 100);

    document.documentElement.style.setProperty("--image-size", `${imageSize}px`);
    document.documentElement.style.setProperty("--price-size", `${priceSize}em`);
    document.documentElement.style.setProperty("--label-size", `${labelSize}em`);
    document.documentElement.style.setProperty("--total-size", `${totalSize}em`);
  }, [zoom]);

  async function init() {
    setLoading(true);
    setError(null);
    try {
      const lotsRes = await fetch("/api/lots", { cache: "no-store" });
      const lotsJson = (await lotsRes.json()) as {
        ok: boolean;
        lots?: LotRow[];
        error?: string;
      };
      if (!lotsRes.ok || !lotsJson.ok) throw new Error(lotsJson.error || "Failed to load lots");
      const lotsList = lotsJson.lots ?? [];
      lotsList.sort((a, b) => {
        const numA = parseInt(a.lot_name.match(/(\d+)$/)?.[1] || "0", 10);
        const numB = parseInt(b.lot_name.match(/(\d+)$/)?.[1] || "0", 10);
        return numB - numA;
      });
      setLots(lotsList);

      if (canEdit || canAdd) {
        const usersRes = await fetch("/api/admin/users", { cache: "no-store" });
        const usersJson = (await usersRes.json()) as {
          ok: boolean;
          users?: UserRow[];
          error?: string;
        };
        if (usersRes.ok && usersJson.ok) {
          setUsers(usersJson.users ?? []);
        } else {
          setUsers([]);
        }
      } else {
        setUsers([]);
      }

      // If no lotId in URL, pick first
      if (!lotIdParam && lotsList.length > 0) {
        const first = lotsList[0];
        router.replace(
          `/lot?lot_id=${encodeURIComponent(String(first.id))}&lot_name=${encodeURIComponent(
            first.lot_name
          )}`
        );
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to load lots");
    } finally {
      setLoading(false);
    }
  }

  async function loadLotAndItems(id: string) {
    setLoading(true);
    setError(null);
    try {
      const lotMeta = lots.find((l) => String(l.id) === String(id));
      setLocked(!!lotMeta?.locked);

      const res = await fetch(`/api/lot-items?lot_id=${encodeURIComponent(id)}`, {
        cache: "no-store"
      });
      const json = (await res.json()) as { ok: boolean; items?: ItemRow[]; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to load lot items");
      setItems((json.items ?? []) as ItemRow[]);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load lot items");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }

  const currentLotIndex = useMemo(() => {
    if (!lotId) return -1;
    return lots.findIndex((l) => String(l.id) === String(lotId));
  }, [lots, lotId]);

  const prevLot = useMemo(() => {
    if (currentLotIndex <= 0) return null;
    return lots[currentLotIndex - 1] ?? null;
  }, [lots, currentLotIndex]);

  const nextLot = useMemo(() => {
    if (currentLotIndex < 0) return null;
    if (currentLotIndex >= lots.length - 1) return null;
    return lots[currentLotIndex + 1] ?? null;
  }, [lots, currentLotIndex]);

  useEffect(() => {
    // Keyboard navigation for lots: Left/Right arrows.
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = (target?.tagName || "").toLowerCase();
      const typing =
        tag === "input" ||
        tag === "textarea" ||
        tag === "select" ||
        !!target?.closest('[contenteditable="true"]');
      if (typing) return;

      if (e.key === "ArrowLeft" && prevLot) {
        e.preventDefault();
        void switchLot(String(prevLot.id));
      } else if (e.key === "ArrowRight" && nextLot) {
        e.preventDefault();
        void switchLot(String(nextLot.id));
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [prevLot, nextLot]);

  function formatInt(value: unknown): string {
    const n = Math.round(toNumber(value));
    return n > 0 ? String(n) : "";
  }

  const usernameOptions = useMemo(() => {
    const names = users
      .map((u) => (u.username ?? "").trim())
      .filter((v) => v.length > 0);
    names.sort((a, b) => a.localeCompare(b));
    return names;
  }, [users]);

  function pickFirstMatchingUsername(typed: string): string | null {
    if (usernameOptions.length === 0) return null;
    const t = typed.trim().toLowerCase();
    if (!t) return usernameOptions[0] ?? null;
    return usernameOptions.find((u) => u.toLowerCase().startsWith(t)) ?? null;
  }

  const grouped = useMemo(() => {
    const map = new Map<string, ItemRow[]>();
    for (const it of items) {
      const key = (it.username ?? "Unknown").trim() || "Unknown";
      const arr = map.get(key) ?? [];
      arr.push(it);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [items]);

  const viewerItems = useMemo(() => {
    // Viewer sees only active items; cancelled rows are hidden.
    return items.filter((it) => !it.cancelled);
  }, [items]);

  const viewerOwnItems = useMemo(() => {
    return viewerItems.filter((it) => (it.username ?? "").trim() === currentUsername);
  }, [viewerItems, currentUsername]);

  const viewerOtherItems = useMemo(() => {
    return viewerItems.filter((it) => (it.username ?? "").trim() !== currentUsername);
  }, [viewerItems, currentUsername]);

  const viewerOtherItemsToShow = useMemo(() => {
    // If user has no items in this lot, still show all available items.
    return viewerOwnItems.length === 0 ? viewerItems : viewerOtherItems;
  }, [viewerOwnItems.length, viewerItems, viewerOtherItems]);

  const grandTotal = useMemo(() => {
    return items.reduce((sum, it) => {
      if (it.cancelled) return sum;
      return sum + toNumber(it.price);
    }, 0);
  }, [items]);

  async function switchLot(nextLotId: string) {
    const next = lots.find((l) => String(l.id) === nextLotId);
    if (!next) return;
    router.push(
      `/lot?lot_id=${encodeURIComponent(String(next.id))}&lot_name=${encodeURIComponent(
        next.lot_name
      )}`
    );
  }

  function toggleItemMenu(itemId: string) {
    setOpenItemMenuId((prev) => (prev === itemId ? null : itemId));
  }

  function openPassModal(itemId: string) {
    if (locked) return alert("This lot is locked. Please unlock it first to pass items.");
    setOpenItemMenuId(null);
    setPassItemId(itemId);
    setPassUsername("");
    setPassOpen(true);
  }

  function closePassModal() {
    setPassOpen(false);
    setPassItemId(null);
    setPassUsername("");
  }

  async function passItem() {
    if (!passItemId) return;
    if (locked) return alert("This lot is locked. Please unlock it first to pass items.");
    const nextUsername = passUsername.trim();
    if (!nextUsername) return alert("Please enter a username!");

    try {
      setLoading(true);
      const existsAlready = usernameOptions.includes(nextUsername);
      if (!existsAlready) {
        const ok = confirm(
          `User "${nextUsername}" doesn't exist. Do you want to create this collector and pass the item to them?`
        );
        if (!ok) return;
      }

      const res = await fetch(`/api/items/${encodeURIComponent(String(passItemId))}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username: nextUsername, createIfMissing: true })
      });
      const json = (await res.json().catch(() => null)) as
        | null
        | { ok: true }
        | { ok: false; error: string };
      if (!res.ok || !json || (json as any).ok !== true) {
        throw new Error((json as any)?.error || "Failed to pass item");
      }

      closePassModal();
      await loadLotAndItems(lotId);
    } catch (e: any) {
      console.error("passItem failed", e);
      alert(e?.message ?? "Failed to pass item. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleCancelItem(item: ItemRow) {
    if (locked) return alert("This lot is locked. Please unlock it first to cancel/restore items.");
    setOpenItemMenuId(null);
    try {
      setLoading(true);
      const nextCancelled = !(item.cancelled ?? false);
      const res = await fetch(`/api/items/${encodeURIComponent(String(item.id))}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cancelled: nextCancelled })
      });
      const json = (await res.json().catch(() => null)) as
        | null
        | { ok: true }
        | { ok: false; error: string };
      if (!res.ok || !json || (json as any).ok !== true) {
        throw new Error((json as any)?.error || "Failed to update item");
      }
      await loadLotAndItems(lotId);
    } catch (e: any) {
      console.error("toggleCancelItem failed", e);
      alert(e?.message ?? "Failed to update item. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function deleteItem(item: ItemRow) {
    if (locked) return alert("This lot is locked. Please unlock it first to delete items.");
    setOpenItemMenuId(null);
    const ok = confirm("Are you sure you want to delete this item? This action cannot be undone.");
    if (!ok) return;
    try {
      setLoading(true);
      const res = await fetch(`/api/items/${encodeURIComponent(String(item.id))}`, {
        method: "DELETE"
      });
      const json = (await res.json().catch(() => null)) as
        | null
        | { ok: true }
        | { ok: false; error: string };
      if (!res.ok || !json || (json as any).ok !== true) {
        throw new Error((json as any)?.error || "Failed to delete item");
      }
      await loadLotAndItems(lotId);
    } catch (e: any) {
      console.error("deleteItem failed", e);
      alert(e?.message ?? "Failed to delete item. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  async function startEditPrice(item: ItemRow) {
    if (!canEdit) return;
    if (locked) return alert("This lot is locked. Please unlock it first to edit prices.");
    if (item.cancelled) return;
    setEditingPriceItemId(String(item.id));
    const initial = Math.round(toNumber(item.price));
    setEditingPriceValue(initial > 0 ? String(initial) : "");
  }

  function cancelEditPrice() {
    setEditingPriceItemId(null);
    setEditingPriceValue("");
  }

  async function saveEditPrice(item: ItemRow) {
    if (!canEdit) return;
    if (locked) return alert("This lot is locked. Please unlock it first to edit prices.");
    if (item.cancelled) return;
    const parsed = Math.round(toNumber(editingPriceValue));
    if (!Number.isFinite(parsed) || parsed < 0) return alert("Invalid price");

    try {
      setLoading(true);
      const res = await fetch(`/api/items/${encodeURIComponent(String(item.id))}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ price: parsed })
      });
      const json = (await res.json().catch(() => null)) as
        | null
        | { ok: true }
        | { ok: false; error: string };
      if (!res.ok || !json || (json as any).ok !== true) {
        throw new Error((json as any)?.error || "Failed to update price");
      }
      cancelEditPrice();
      await loadLotAndItems(lotId);
    } catch (e: any) {
      console.error("saveEditPrice failed", e);
      alert(e?.message ?? "Failed to update price");
    } finally {
      setLoading(false);
    }
  }

  async function toggleLock() {
    if (!isAdmin) return;
    try {
      const next = !locked;
      const res = await fetch(`/api/lots/${encodeURIComponent(String(lotId))}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ locked: next })
      });
      const json = (await res.json()) as
        | { ok: true; lot: { locked?: boolean | null } }
        | { ok: false; error: string };
      if (!res.ok || !json.ok) throw new Error(!json.ok ? json.error : "Failed");
      setLocked(!!json.lot.locked);

      // Keep lots dropdown state in sync (so switching away/back shows correct icon).
      setLots((prev) =>
        prev.map((l) => (String(l.id) === String(lotId) ? { ...l, locked: !!json.lot.locked } : l))
      );
    } catch (e: any) {
      alert(e?.message ?? "Failed to toggle lock");
    }
  }

  function closeAddModal() {
    setAddOpen(false);
    setNewUsername("");
    setNewPrice("");
    setPastedFile(null);
    if (pastedPreviewUrl) URL.revokeObjectURL(pastedPreviewUrl);
    setPastedPreviewUrl(null);
  }

  function setPastedImage(file: File) {
    setPastedFile(file);
    const url = URL.createObjectURL(file);
    if (pastedPreviewUrl) URL.revokeObjectURL(pastedPreviewUrl);
    setPastedPreviewUrl(url);
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

  async function ensureUserExists(username: string) {
    const exists = users.some((u) => (u.username ?? "").trim() === username);
    if (exists) return;

    const res = await fetch("/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username,
        number: "",
        password: "",
        access_level: "viewer"
      })
    });
    const json = (await res.json()) as { ok: boolean; error?: string };
    if (!res.ok && res.status !== 409) {
      throw new Error(json.error || "Failed to create user");
    }
    setUsers((prev) => {
      if (prev.some((u) => (u.username ?? "").trim() === username)) return prev;
      return [...prev, { id: `tmp-${username}`, username, number: "" }];
    });
  }

  async function addNewItem() {
    if (locked) return alert("This lot is locked. Please unlock it first to add items.");
    const username = newUsername.trim();
    const price = toNumber(newPrice);
    const file = pastedFile;
    if (!username) return alert("Please enter a collector!");
    if (!price || price <= 0) return alert("Please enter a valid price!");
    if (!file) return alert("Please paste or upload an image!");

    try {
      // Close modal immediately to avoid "frozen open modal" confusion while uploading.
      closeAddModal();
      setLoading(true);
      await ensureUserExists(username);
      const url = await uploadToCloudinary(file);
      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lot_id: Number(lotId),
          username,
          picture_url: url,
          price
        })
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to add item");
      await loadLotAndItems(lotId);
    } catch (e: any) {
      alert(e?.message ?? "Failed to add item");
    } finally {
      setLoading(false);
    }
  }

  async function smartPaste() {
    if (locked) return alert("This lot is locked. Please unlock it first to add items.");
    if (smartPasting) return;
    setSmartPasting(true);
    try {
      // `navigator.clipboard` typing differs across TS DOM libs; use a safe runtime check.
      const clipboard = (navigator as any).clipboard as
        | undefined
        | {
            read?: () => Promise<any[]>;
            readText?: () => Promise<string>;
          };
      if (!clipboard) throw new Error("Clipboard API not available.");

      let clipboardText = "";
      if (typeof clipboard.read === "function") {
        const items = await clipboard.read();
        for (const it of items) {
          if (it.types.includes("text/plain")) {
            const blob = await it.getType("text/plain");
            clipboardText = await blob.text();
            break;
          }
          if (it.types.includes("text/html") && !clipboardText) {
            const blob = await it.getType("text/html");
            const html = await blob.text();
            const div = document.createElement("div");
            div.innerHTML = html;
            clipboardText = div.textContent || div.innerText || "";
          }
        }
      } else if (typeof clipboard.readText === "function") {
        clipboardText = await clipboard.readText();
      }

      const lines = clipboardText
        .split(/[\n\r]+/)
        .map((l) => l.trim())
        .filter((l) => l.length > 0);
      if (lines.length < 3) throw new Error("Expected 3 lines: name/number, image URL, price");
      const nameOrNumber = lines[0];
      const imageUrl = lines[1];
      const priceNum = toNumber(lines[2].replace(/[^\d.]/g, ""));
      if (!/^https?:\/\//i.test(imageUrl)) throw new Error("Invalid image URL");
      if (!priceNum || priceNum <= 0) throw new Error("Invalid price");
      const finalPrice = priceNum + 10;

      let mappedUsername =
        users.find((u) => (u.username ?? "").trim() === nameOrNumber)?.username ||
        users.find((u) => (u.number ?? "").trim() === nameOrNumber)?.username ||
        null;

      if (!mappedUsername) {
        await ensureUserExists(nameOrNumber);
        mappedUsername = nameOrNumber;
      }

      const res = await fetch("/api/items", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          lot_id: Number(lotId),
          username: mappedUsername,
          picture_url: imageUrl,
          price: finalPrice
        })
      });
      const json = (await res.json()) as { ok: boolean; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error || "Failed to add item");

      await loadLotAndItems(lotId);
    } catch (e: any) {
      alert(e?.message ?? "Smart paste failed");
    } finally {
      setSmartPasting(false);
    }
  }

  async function generatePNG() {
    if (!galleryRef.current) return;
    setGenerating(true);
    try {
      const mod = await import("html2canvas");
      const html2canvas = (mod as any).default ?? mod;
      const canvas = await html2canvas(galleryRef.current, {
        backgroundColor: "#ffffff",
        scale: quality,
        useCORS: true
      });
      const dataUrl = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      const safeName = (lotName ? decodeURIComponent(lotName) : `lot_${lotId}`)
        .replace(/[^\w\- ]+/g, "")
        .trim()
        .replace(/\s+/g, "_");
      a.download = `${safeName || "lot"}_summary.png`;
      a.href = dataUrl;
      a.click();
    } catch (e: any) {
      alert(e?.message ?? "Failed to generate PNG");
    } finally {
      setGenerating(false);
    }
  }

  const lockIconUrl = locked
    ? "https://res.cloudinary.com/daye1yfzy/image/upload/v1762317006/lock-solid-full_uhekbc.svg"
    : "https://res.cloudinary.com/daye1yfzy/image/upload/v1762317008/lock-open-solid-full_bh6f8q.svg";

  return (
    <div className="lot-container">
      <div className="controls">
        <div className={`controls-top ${isViewer ? "controls-top-viewer" : ""}`}>
          <select
            id="lotDropdown"
            value={lotId}
            onChange={(e) => switchLot(e.target.value)}
          >
            {lots.length === 0 ? (
              <option value="">Loading...</option>
            ) : (
              lots.map((l) => (
                <option key={String(l.id)} value={String(l.id)}>
                  {l.lot_name}
                </option>
              ))
            )}
          </select>

          {!isViewer && isAdmin ? (
            <button
              className={`lock-btn ${locked ? "locked" : ""}`}
              id="lockBtn"
              onClick={toggleLock}
              title="Lock/Unlock Lot"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img id="lockIcon" src={lockIconUrl} alt="Lock" className="lock-icon-img" />
            </button>
          ) : null}

          {!isViewer ? (
            <>
              <div className="lot-total-pill" id="lotTotalDisplay">
                Total: {Math.round(grandTotal).toLocaleString()}
              </div>

              <div className="zoom-control">
                <span className="control-label">Zoom</span>
                <button
                  onClick={() => setZoom((z) => Math.max(50, z - 10))}
                  className="zoom-btn"
                  aria-label="Zoom out"
                >
                  -
                </button>
                <input
                  type="range"
                  id="zoomSlider"
                  min={50}
                  max={150}
                  step={10}
                  value={zoom}
                  onChange={(e) => setZoom(Number(e.target.value))}
                />
                <span id="zoomLevel">{zoom}%</span>
                <button
                  onClick={() => setZoom((z) => Math.min(150, z + 10))}
                  className="zoom-btn"
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>

              <div className="checkbox-control">
                <input
                  type="checkbox"
                  id="showTotalsCheckbox"
                  checked={showTotals}
                  onChange={(e) => setShowTotals(e.target.checked)}
                />
                <label htmlFor="showTotalsCheckbox">Show Totals</label>
              </div>

              <div className="quality-control">
                <span className="control-label">Quality</span>
                <select
                  id="pngQuality"
                  value={quality}
                  onChange={(e) => setQuality(Number(e.target.value))}
                >
                  <option value={1}>1x</option>
                  <option value={2}>2x</option>
                  <option value={3}>3x</option>
                  <option value={4}>4x</option>
                </select>
              </div>

              <button className="generate-btn" onClick={generatePNG} disabled={generating}>
                {generating ? "Generating..." : "Generate PNG"}
              </button>

              {canAdd ? (
                <button
                  className="add-new-btn"
                  id="addNewBtn"
                  onClick={() => {
                    if (locked)
                      return alert(
                        "This lot is locked. Please unlock it first to add items."
                      );
                    setAddOpen(true);
                  }}
                  disabled={locked}
                >
                  + Add New
                </button>
              ) : null}
            </>
          ) : null}
        </div>
      </div>

      {/* Prev/Next lot navigation on both sides */}
      {!isViewer && prevLot ? (
        <button
          type="button"
          className="lot-nav-btn lot-nav-prev"
          onClick={() => switchLot(String(prevLot.id))}
          aria-label="Previous lot"
          title={`Previous: ${prevLot.lot_name}`}
        >
          ‹
        </button>
      ) : null}
      {!isViewer && nextLot ? (
        <button
          type="button"
          className="lot-nav-btn lot-nav-next"
          onClick={() => switchLot(String(nextLot.id))}
          aria-label="Next lot"
          title={`Next: ${nextLot.lot_name}`}
        >
          ›
        </button>
      ) : null}

      <div
        id="gallery"
        ref={galleryRef}
        className={loading ? "loading" : ""}
        style={{ padding: "10px 48px" }}
      >
        {loading ? (
          <>Loading lot items...</>
        ) : error ? (
          <div className="loading">Error loading items: {error}</div>
        ) : items.length === 0 ? (
          <div className="loading">No items in this lot yet.</div>
        ) : isViewer ? (
          <div className="viewer-gallery">
            {viewerOwnItems.length > 0 ? (
              <div className="viewer-group">
                <div className="viewer-group-title">Your Items</div>
                <div className="viewer-grid">
                  {viewerOwnItems.map((it) => (
                    <div key={String(it.id)} className="item-card viewer-own-item">
                      <div className="price" style={{ fontSize: "0.85em" }}>
                        {formatInt(it.price)}
                      </div>
                      <div className="item-image-container">
                        {it.picture_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="item-image"
                            src={it.picture_url}
                            alt=""
                            crossOrigin="anonymous"
                            loading="lazy"
                          />
                        ) : (
                          <div className="paste-instructions">No Image</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {viewerOtherItemsToShow.length > 0 ? (
              <div className="viewer-group">
                <div className="viewer-group-title">Other Items</div>
                <div className="viewer-grid">
                  {viewerOtherItemsToShow.map((it) => (
                    <div key={String(it.id)} className="item-card">
                      <div className="item-image-container">
                        {it.picture_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="item-image"
                            src={it.picture_url}
                            alt=""
                            crossOrigin="anonymous"
                            loading="lazy"
                          />
                        ) : (
                          <div className="paste-instructions">No Image</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <>
            {grouped.map(([username, userItems]) => {
              const total = userItems.reduce((sum, it) => {
                if (it.cancelled) return sum;
                return sum + toNumber(it.price);
              }, 0);
              return (
                <div key={username} className="user-section">
                  <div className="items-grid">
                    {userItems.map((it) => (
                      <div key={String(it.id)} className="item-card">
                        {editingPriceItemId === String(it.id) ? (
                          <input
                            className="price price-input"
                            value={editingPriceValue}
                            onChange={(e) => setEditingPriceValue(e.target.value.replace(/[^\d]/g, ""))}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoFocus
                            onBlur={() => void saveEditPrice(it)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                void saveEditPrice(it);
                              } else if (e.key === "Escape") {
                                e.preventDefault();
                                cancelEditPrice();
                              }
                            }}
                          />
                        ) : (
                          <div
                            className={`price ${canEdit && !locked && !it.cancelled ? "price-editable" : ""}`}
                            style={it.cancelled ? { visibility: "hidden" } : undefined}
                            onClick={() => void startEditPrice(it)}
                            title={
                              canEdit
                                ? locked
                                  ? "Locked"
                                  : "Click to edit price"
                                : undefined
                            }
                          >
                            {formatInt(it.price)}
                          </div>
                        )}
                        <div className="item-image-container">
                          {it.cancelled ? <div className="cancel-overlay">❌</div> : null}
                          {it.picture_url ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              className="item-image"
                              src={it.picture_url}
                              alt=""
                              crossOrigin="anonymous"
                              loading="lazy"
                            />
                          ) : (
                            <div className="paste-instructions">No Image</div>
                          )}

                          {/* Magnify (zoom) - matches legacy UX */}
                          {it.picture_url ? (
                            <button
                              className="magnify-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                setZoomImageUrl(it.picture_url || null);
                              }}
                              aria-label="View image"
                              type="button"
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src="https://res.cloudinary.com/daye1yfzy/image/upload/v1762330881/magnifying-glass-solid-full_vujovk.svg"
                                alt="View"
                                className="magnify-icon"
                              />
                            </button>
                          ) : null}

                          {/* 3-dot item menu (Pass / Cancel / Delete) */}
                          {canEdit ? (
                            <div className={`item-menu ${openItemMenuId === String(it.id) ? "open" : ""}`}>
                              <button
                                className="item-menu-btn"
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  toggleItemMenu(String(it.id));
                                }}
                                aria-label="Item options"
                              >
                                ⋮
                              </button>
                              <div
                                className={`item-menu-dropdown ${
                                  openItemMenuId === String(it.id) ? "show" : ""
                                }`}
                              >
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openPassModal(String(it.id));
                                  }}
                                  disabled={locked}
                                >
                                  Pass
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void toggleCancelItem(it);
                                  }}
                                  disabled={locked}
                                >
                                  {it.cancelled ? "Restore" : "Cancel"}
                                </button>
                                <button
                                  className="delete-menu-item"
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    void deleteItem(it);
                                  }}
                                  disabled={locked}
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="item-label">
                    <span
                      className="username-link"
                      onClick={() => {
                        if (!canEdit) return;
                        router.push(`/person?username=${encodeURIComponent(username)}`);
                      }}
                      style={{ cursor: canEdit ? "pointer" : "default" }}
                    >
                      {username}
                    </span>
                    {showTotals ? (
                      <>
                        {" - "}
                        <span
                          className="total-hover"
                          data-hover-text="Add new"
                          onClick={() => {
                            if (!canAdd) return;
                            if (locked)
                              return alert(
                                "This lot is locked. Please unlock it first to add items."
                              );
                            setNewUsername(username);
                            setAddOpen(true);
                          }}
                        >
                          Total: {total.toFixed(0)}
                        </span>
                      </>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>

      <div
        className={`modal ${addOpen ? "show" : ""}`}
        onClick={() => {
          closeAddModal();
        }}
      >
        <div className="modal-content" onClick={(e) => e.stopPropagation()}>
          <div className="modal-header">Add New Item to Lot</div>
          <div className="form-group">
            <label>Collector:</label>
            <input
              type="text"
              list="usernames"
              ref={addCollectorInputRef}
              value={newUsername}
              onChange={(e) => setNewUsername(e.target.value)}
              placeholder="Enter or select collector"
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                e.stopPropagation();

                const picked = pickFirstMatchingUsername(newUsername);
                if (picked) setNewUsername(picked);

                // Move focus to price input (legacy behavior).
                setTimeout(() => addPriceInputRef.current?.focus(), 0);
              }}
            />
            <datalist id="usernames">
              {usernameOptions.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>

          <div className="form-group">
            <label>Price:</label>
            <input
              type="number"
              ref={addPriceInputRef}
              value={newPrice}
              onChange={(e) => setNewPrice(e.target.value)}
              placeholder="Enter price"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void addNewItem();
                }
              }}
            />
          </div>

          <div className="form-group">
            <label>Image (Click and Paste from Clipboard - Ctrl+V):</label>
            <div
              id="pasteArea"
              className="image-paste-area"
              tabIndex={0}
              onPaste={(e) => {
                const items = e.clipboardData?.items;
                if (!items) return;
                for (const it of items) {
                  if (it.type.startsWith("image/")) {
                    const file = it.getAsFile();
                    if (!file) continue;
                    setPastedImage(file);
                    break;
                  }
                }
              }}
            >
              {pastedPreviewUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={pastedPreviewUrl} alt="Pasted" className="paste-preview" />
              ) : (
                <div className="paste-instructions">
                  Click here and press Ctrl+V to paste image
                </div>
              )}
            </div>
            <div className="mt-2 md:hidden">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setPastedImage(file);
                  e.currentTarget.value = "";
                }}
              />
            </div>
          </div>

          <div className="modal-buttons">
            <button className="btn-cancel" onClick={closeAddModal}>
              Cancel
            </button>
            <button className="btn-add" onClick={addNewItem}>
              Add Item
            </button>
          </div>
        </div>
      </div>

      {/* Pass Item Modal (legacy parity) */}
      <div className={`modal ${passOpen ? "show" : ""}`}>
        <div className="modal-content">
          <div className="modal-header">Pass Item to Collector</div>
          <div className="form-group">
            <label>Collector:</label>
            <input
              type="text"
              list="passUsernames"
              value={passUsername}
              onChange={(e) => setPassUsername(e.target.value)}
              placeholder="Enter or select collector"
            />
            <datalist id="passUsernames">
              {usernameOptions.map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
            <small style={{ color: "#666", display: "block", marginTop: 6 }}>
              Note: If you enter a new collector, a new collector will be created.
            </small>
          </div>
          <div className="modal-buttons">
            <button className="btn-cancel" onClick={closePassModal}>
              Cancel
            </button>
            <button className="btn-add" onClick={passItem} disabled={!passItemId}>
              Pass Item
            </button>
          </div>
        </div>
      </div>

      {/* Full image view (click outside / close button to dismiss) */}
      {zoomImageUrl ? (
        <div
          className="image-fullview-overlay"
          onClick={() => setZoomImageUrl(null)}
          role="presentation"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={zoomImageUrl}
            className="image-fullview"
            alt="Full view"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            className="image-fullview-close"
            onClick={(e) => {
              e.stopPropagation();
              setZoomImageUrl(null);
            }}
            type="button"
            aria-label="Close image"
          >
            ×
          </button>
        </div>
      ) : null}
    </div>
  );
}

