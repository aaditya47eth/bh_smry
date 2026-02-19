"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getCurrentUser } from "@/lib/session";
import type { ReactNode } from "react";

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

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/70 backdrop-blur">
        <div className={`mx-auto flex ${widthClass} items-center justify-between px-4 py-3`}>
          <div className="flex items-center gap-3">
            <Link
              href="/home"
              className="inline-flex items-center gap-2 text-slate-900 hover:text-slate-700"
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
            {user ? (
              <>
                <Link
                  href="/profile"
                  className="rounded-md px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  title="Profile"
                >
                  {user.username || user.name}
                </Link>
                {user.access_level?.toLowerCase() === "admin" ? (
                  <Link
                    href="/admin"
                    className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    Admin
                  </Link>
                ) : null}
                <button
                  className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
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
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                Login
              </Link>
            )}
          </div>
        </div>
      </header>

      <div className="border-b border-slate-200 bg-white/60">
        <div className={`mx-auto ${widthClass} px-4 py-2`}>
          <nav className="text-xs text-slate-500" aria-label="Breadcrumb">
            <Link href="/home" className="hover:text-slate-700">
              Home
            </Link>
            {crumb !== "Home" ? (
              <>
                <span className="px-2 text-slate-300">/</span>
                <span className="text-slate-700">{crumb}</span>
              </>
            ) : null}
          </nav>
        </div>
      </div>

      <main className={`mx-auto ${widthClass} px-4 py-6`}>{children}</main>
    </div>
  );
}

