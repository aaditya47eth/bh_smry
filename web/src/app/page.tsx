"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { clearSession, getCurrentUser, setCurrentUser } from "@/lib/session";

type LoginState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

export default function LoginPage() {
  const router = useRouter();
  const [phoneNumber, setPhoneNumber] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);
  const [state, setState] = useState<LoginState>({ status: "idle" });

  useEffect(() => {
    const user = getCurrentUser();
    if (user?.id === "guest") {
      // Guest mode is removed; treat any old guest session as logged out.
      clearSession();
      return;
    }
    if (user) router.push("/home");
  }, [router]);

  async function handleLogin(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    const number = phoneNumber.trim();
    if (!number)
      return setState({ status: "error", message: "Please enter your number" });
    if (!password)
      return setState({ status: "error", message: "Please enter your password" });

    setState({ status: "loading" });
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ number, password, rememberMe })
      });
      const json = (await res.json()) as
        | {
            ok: true;
            access_token: string;
            user: { id: string; name: string; username: string; access_level: string };
          }
        | { ok: false; error?: string };

      if (!res.ok || !json.ok) {
        throw new Error(!json.ok ? json.error || "Login failed" : "Login failed");
      }

      setCurrentUser(json.user, {
        rememberMe,
        accessToken: json.access_token
      });

      router.push("/home");
    } catch (err: any) {
      setState({
        status: "error",
        message: `Login failed: ${err?.message ?? "Unknown error"}`
      });
    }
  }

  return (
    <div className="min-h-screen bg-[#f5f8fa] dark:bg-slate-900 px-4 py-6">
      <div className="mx-auto flex min-h-screen max-w-[1000px] items-center justify-center">
        <div className="flex w-full overflow-hidden rounded-2xl border border-[#e8eef3] dark:border-slate-700 bg-white dark:bg-slate-800 shadow-[0_4px_24px_rgba(0,0,0,0.06)] max-md:flex-col">
          <div className="flex min-h-[500px] flex-1 items-center justify-center bg-[linear-gradient(135deg,#2c3e50_0%,#1f2d3a_100%)] p-[60px] max-md:min-h-[300px] max-md:p-10">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://res.cloudinary.com/daye1yfzy/image/upload/v1761855859/5f5d5485-2656-4523-916b-5464cb0f7304.png"
              alt="Logo"
              className="h-auto max-w-[70%] cursor-pointer opacity-100"
              onClick={() => router.push("/home")}
            />
          </div>

          <div className="flex flex-1 flex-col justify-center bg-white dark:bg-slate-800 p-[60px] max-md:p-10 max-sm:p-6">
            <h2 className="mb-7 text-center text-[1.75rem] font-semibold tracking-[-0.02em] text-[#2c3e50] dark:text-slate-100">
              Login
            </h2>

            {state.status === "error" ? (
              <div className="mb-5 rounded-lg border border-[#fecaca] bg-[#fee2e2] px-4 py-3 text-center text-[0.8125rem] text-[#dc2626]">
                {state.message}
              </div>
            ) : null}

            <form onSubmit={handleLogin}>
              <div className="mb-6">
                <label className="mb-2 block text-sm font-semibold text-[#2c3e50] dark:text-slate-100">
                  Number
                </label>
                <input
                  className="w-full rounded-lg border border-[#e8eef3] dark:border-slate-700 bg-[#f5f8fa] dark:bg-slate-900 px-4 py-3 text-sm text-[#2c3e50] dark:text-slate-100 placeholder:text-[#95a5a6] dark:placeholder:text-slate-500 transition focus:border-[#2c3e50] dark:focus:border-slate-500 focus:bg-white dark:focus:bg-slate-800 dark:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-[#e8eef3] dark:focus:ring-slate-700"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="Enter your number"
                  autoComplete="tel"
                />
              </div>

              <div className="mb-6">
                <label className="mb-2 block text-sm font-semibold text-[#2c3e50] dark:text-slate-100">
                  Password
                </label>
                <div className="relative flex items-center">
                  <input
                    className="w-full rounded-lg border border-[#e8eef3] dark:border-slate-700 bg-[#f5f8fa] dark:bg-slate-900 px-4 py-3 pr-14 text-sm text-[#2c3e50] dark:text-slate-100 placeholder:text-[#95a5a6] dark:placeholder:text-slate-500 transition focus:border-[#2c3e50] dark:focus:border-slate-500 focus:bg-white dark:focus:bg-slate-800 dark:bg-slate-800 focus:outline-none focus:ring-4 focus:ring-[#e8eef3] dark:focus:ring-slate-700"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    title="Show/Hide Password"
                    className="absolute right-2 rounded-md px-3 py-2 text-sm text-[#6c757d] dark:text-slate-400 transition hover:bg-[#f5f8fa] dark:hover:bg-slate-700 dark:bg-slate-900 hover:text-[#2c3e50] dark:hover:text-slate-200 dark:text-slate-100"
                    onClick={() => setShowPassword((v) => !v)}
                  >
                    {showPassword ? "Hide" : "Show"}
                  </button>
                </div>
              </div>

              <div className="mb-6">
                <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-[#2c3e50] dark:text-slate-100">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border border-[#cbd5e1] dark:border-slate-600 text-[#2c3e50] dark:text-slate-100 focus:ring-[#2c3e50]/30"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                  />
                  <span>Remember me</span>
                </label>
              </div>

              <button
                type="submit"
                disabled={state.status === "loading"}
                className="mt-2 w-full rounded-lg bg-[#2c3e50] dark:bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1f2d3a] dark:hover:bg-blue-700 hover:shadow-[0_4px_12px_rgba(44,62,80,0.18)] disabled:cursor-not-allowed disabled:bg-[#e8eef3] disabled:text-[#95a5a6] disabled:shadow-none"
              >
                {state.status === "loading" ? "Logging in..." : "Login"}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}

