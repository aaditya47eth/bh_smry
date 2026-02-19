"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { clearSession, getCurrentUser } from "@/lib/session";
import type { ReactNode } from "react";

function IconRailButton({
  href,
  title,
  active,
  children
}: {
  href: string;
  title: string;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      title={title}
      className={`flex h-11 w-11 items-center justify-center rounded-xl transition ${
        active ? "bg-slate-100 text-[#2c3e50]" : "text-slate-400 hover:bg-slate-50"
      }`}
    >
      {children}
    </Link>
  );
}

function NavItem({
  href,
  label,
  active,
  icon
}: {
  href: string;
  label: string;
  active: boolean;
  icon: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium transition ${
        active
          ? "bg-slate-100 text-[#2c3e50]"
          : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
      }`}
    >
      <span className={active ? "text-[#2c3e50]" : "text-slate-400"}>{icon}</span>
      <span>{label}</span>
    </Link>
  );
}

export function DashboardLayout({
  children,
  showIconRail = true
}: {
  children: ReactNode;
  showIconRail?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const user = getCurrentUser();
  const isAdmin = (user?.access_level ?? "").toLowerCase() === "admin";

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto flex max-w-[1400px] gap-6 px-4 py-6">
        {/* Icon rail */}
        {showIconRail ? (
          <aside className="hidden w-16 shrink-0 rounded-3xl border border-slate-200 bg-white p-2 shadow-sm md:block">
            <div className="flex flex-col items-center gap-2">
              <IconRailButton
                href="/dashboard"
                title="Dashboard"
                active={pathname === "/dashboard"}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-10h8V3h-8v8Z"
                    fill="currentColor"
                  />
                </svg>
              </IconRailButton>

              <IconRailButton href="/profile" title="Profile" active={pathname === "/profile"}>
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </IconRailButton>

              {isAdmin ? (
                <IconRailButton href="/admin" title="Admin" active={pathname === "/admin"}>
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M9 12l2 2 4-5"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </IconRailButton>
              ) : null}
            </div>

            <div className="mt-4 border-t border-slate-200 pt-4">
              <button
                className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl text-slate-400 hover:bg-slate-50"
                title="Logout"
                onClick={() => {
                  clearSession();
                  router.push("/");
                }}
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M16 17l5-5-5-5"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <path
                    d="M21 12H9"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </button>
            </div>
          </aside>
        ) : null}

        {/* Main sidebar */}
        <aside className="hidden w-64 shrink-0 rounded-3xl border border-slate-200 bg-white shadow-sm md:block">
          <div className="border-b border-slate-200 px-6 py-5">
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://res.cloudinary.com/daye1yfzy/image/upload/v1761855859/5f5d5485-2656-4523-916b-5464cb0f7304.png"
                alt="BH Summary Maker"
                className="h-9 w-auto"
              />
              <div className="text-base font-semibold text-slate-900">BH</div>
            </div>
          </div>

          <div className="px-4 py-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              Menu
            </div>
            <div className="mt-3 space-y-1">
              <NavItem
                href="/dashboard"
                label="Dashboard"
                active={pathname === "/dashboard"}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M3 13h8V3H3v10Zm10 8h8V11h-8v10ZM3 21h8v-6H3v6Zm10-10h8V3h-8v8Z"
                      fill="currentColor"
                    />
                  </svg>
                }
              />
              <NavItem
                href="/profile"
                label="Profile"
                active={pathname === "/profile"}
                icon={
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path
                      d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                }
              />
              {isAdmin ? (
                <NavItem
                  href="/admin"
                  label="Admin Panel"
                  active={pathname === "/admin"}
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path
                        d="M12 2l7 4v6c0 5-3 9-7 10-4-1-7-5-7-10V6l7-4Z"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinejoin="round"
                      />
                    </svg>
                  }
                />
              ) : null}
            </div>
          </div>

          <div className="mt-auto border-t border-slate-200 px-6 py-5">
            <div className="text-sm font-medium text-slate-900">{user?.username ?? "User"}</div>
            <div className="mt-1 text-xs text-slate-500">
              {(user?.access_level ?? "").toLowerCase()}
            </div>
            <button
              className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 hover:bg-slate-50"
              onClick={() => {
                clearSession();
                router.push("/");
              }}
            >
              Log out
            </button>
          </div>
        </aside>

        {/* Content */}
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}

