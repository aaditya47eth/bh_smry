import { Suspense } from "react";
import PersonClient from "./PersonClient";

export default function PersonPage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-600">Loading...</div>}>
      <PersonClient />
    </Suspense>
  );
}

