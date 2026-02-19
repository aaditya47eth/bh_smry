import type { Permission, SessionUser } from "@/lib/types";

const USER_KEY = "user";
const TOKEN_KEY = "access_token";
const REMEMBER_KEY = "remember_me";

type SessionOptions = {
  rememberMe?: boolean;
  accessToken?: string;
};

export function getCurrentUser(): SessionUser | null {
  if (typeof window === "undefined") return null;
  const sessionUserStr = window.sessionStorage.getItem(USER_KEY);
  if (sessionUserStr) return JSON.parse(sessionUserStr) as SessionUser;

  // Remember-me fallback: revive from localStorage into sessionStorage.
  const localUserStr = window.localStorage.getItem(USER_KEY);
  if (!localUserStr) return null;
  window.sessionStorage.setItem(USER_KEY, localUserStr);
  return JSON.parse(localUserStr) as SessionUser;
}

export function setCurrentUser(user: SessionUser, options?: SessionOptions): void {
  if (typeof window === "undefined") return;
  const rememberMe = !!options?.rememberMe;
  const userStr = JSON.stringify(user);
  const token = options?.accessToken?.trim() || "";

  window.sessionStorage.setItem(USER_KEY, userStr);
  if (token) window.sessionStorage.setItem(TOKEN_KEY, token);

  if (rememberMe) {
    window.localStorage.setItem(USER_KEY, userStr);
    if (token) window.localStorage.setItem(TOKEN_KEY, token);
    window.localStorage.setItem(REMEMBER_KEY, "1");
  } else {
    window.localStorage.removeItem(USER_KEY);
    window.localStorage.removeItem(TOKEN_KEY);
    window.localStorage.removeItem(REMEMBER_KEY);
  }
}

export function getAccessToken(): string {
  if (typeof window === "undefined") return "";
  const fromSession = window.sessionStorage.getItem(TOKEN_KEY) || "";
  if (fromSession) return fromSession;
  return window.localStorage.getItem(TOKEN_KEY) || "";
}

export function clearSession(): void {
  if (typeof window === "undefined") return;
  window.sessionStorage.removeItem(USER_KEY);
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.localStorage.removeItem(TOKEN_KEY);
  window.localStorage.removeItem(REMEMBER_KEY);
}

export function isAuthenticated(): boolean {
  const user = getCurrentUser();
  return !!user && user.id !== "guest";
}

export function hasPermission(permission: Permission): boolean {
  const user = getCurrentUser();
  if (!user) return false;
  if (user.id === "guest") return false;

  const accessLevel = (user.access_level || "").toLowerCase();
  switch (permission) {
    case "view":
      return ["admin", "manager", "viewer"].includes(accessLevel);
    case "add":
    case "edit":
    case "delete":
    case "manage":
    case "manage_users":
      return ["admin", "manager"].includes(accessLevel);
    default:
      return false;
  }
}

