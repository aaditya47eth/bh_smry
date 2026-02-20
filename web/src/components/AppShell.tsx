"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getCurrentUser } from "@/lib/session";
import { type ReactNode, useEffect, useState } from "react";

function getCrumbLabel(pathname: string): string {
  if (pathname === "/home" || pathname === "/dashboard") return "Home";
  if (pathname === "/admin") return "Admin";
  if (pathname === "/profile") return "Profile";
  if (pathname === "/lot") return "Lot";
  if (pathname === "/person") return "Person";
  return pathname.replace(/^\//, "") || "Home";
}

export function AppShell({
  children,
  containerWidthClassName
}: {
  children: ReactNode;
  containerWidthClassName?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const user = getCurrentUser();
  const crumb = getCrumbLabel(pathname);
  // Default to percentage-based container across the app (requested).
  const widthClass = containerWidthClassName || "w-[90%]";

  const [theme, setTheme] = useState<"light" | "dark">("light");

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "dark" || (!saved && window.matchMedia("(prefers-color-scheme: dark)").matches)) {
      setTheme("dark");
      document.documentElement.classList.add("dark");
    } else {
      setTheme("light");
      document.documentElement.classList.remove("dark");
    }
  }, []);

  function toggleTheme() {
    const next = theme === "light" ? "dark" : "light";
    setTheme(next);
    localStorage.setItem("theme", next);
    if (next === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }

  return (
    <div className="min-h-screen transition-colors duration-300 dark:bg-neutral-950">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur dark:border-neutral-800 dark:bg-neutral-950/70">
        <div className={`mx-auto flex ${widthClass} items-center justify-between px-4 py-3`}>
          <div className="flex items-center gap-3">
            <Link
              href="/home"
              className="inline-flex items-center gap-2 text-slate-900 hover:text-slate-700 dark:text-neutral-100 dark:hover:text-neutral-300"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://res.cloudinary.com/daye1yfzy/image/upload/v1761855859/5f5d5485-2656-4523-916b-5464cb0f7304.png"
                alt="BH Summary Maker"
                className="h-7 w-auto"
              />
              <span className="sr-only">BH Summary Maker</span>
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={toggleTheme}
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
              title={`Switch to ${theme === "light" ? "dark" : "light"} mode`}
            >
              {theme === "light" ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="https://res.cloudinary.com/dakqalaqy/image/upload/v1771596912/night-mode_a742v0.png"
                  alt="Dark Mode"
                  className="h-5 w-5"
                />
              ) : (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src="https://res.cloudinary.com/dakqalaqy/image/upload/v1771596914/brightness-and-contrast_nspk2c.png"
                  alt="Light Mode"
                  className="h-5 w-5 invert"
                />
              )}
            </button>
            {user ? (
              <>
                <Link
                  href="/profile"
                  className="rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-50 dark:text-neutral-200 dark:hover:bg-neutral-800"
                  title="Profile"
                >
                  {user.username || user.name}
                </Link>
                {user.access_level?.toLowerCase() === "admin" ? (
                  <Link
                    href="/admin"
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  >
                    Admin
                  </Link>
                ) : null}
                <button
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
                  onClick={async () => {
                    try {
                      await fetch("/api/auth/logout", { method: "POST" });
                    } catch {}
                    clearSession();
                    router.push("/");
                  }}
                >
                  Logout
                </button>
              </>
            ) : (
              <Link
                href="/"
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white/60 dark:border-neutral-800 dark:bg-neutral-950/60">
        <div className={`mx-auto ${widthClass} px-4 py-2`}>
          <nav className="text-xs text-slate-500 dark:text-neutral-400" aria-label="Breadcrumb">
            <Link href="/home" className="hover:text-slate-700 dark:hover:text-neutral-200">
              Home
            </Link>
            {crumb !== "Home" ? (
              <>
                <span className="px-2 text-slate-300 dark:text-neutral-600">/</span>
                <span className="text-slate-700 dark:text-neutral-200">{crumb}</span>
              </>
            ) : null}
          </nav>
        </div>
      </div>

      <main className={`mx-auto ${widthClass} px-4 py-6`}>{children}</main>
    </div>
  );
}
