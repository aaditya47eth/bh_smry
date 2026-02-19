import { AppShell } from "@/components/AppShell";
import { Suspense } from "react";
import LotClient from "./LotClient";

export default function LotPage() {
  return (
    <AppShell containerWidthClassName="w-[90%]">
      <Suspense
        fallback={
          <div className="mt-6 rounded-xl border border-slate-200 bg-white p-4 text-slate-600 shadow-sm">
            Loading query params...
          </div>
        }
      >
        <LotClient />
      </Suspense>
    </AppShell>
  );
}

