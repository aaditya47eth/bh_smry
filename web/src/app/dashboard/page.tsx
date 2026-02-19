import { redirect } from "next/navigation";

export default function DashboardPage() {
  // `/dashboard` is kept for backwards compatibility, but Home should be `/home`.
  redirect("/home");
}

