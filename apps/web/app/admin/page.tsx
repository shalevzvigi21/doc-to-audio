import { redirect } from "next/navigation";
import type { AdminDayPoint, AdminSummary, AdminUserRow, MeProfile } from "@doc-to-audio/types";
import { apiFetch, ApiError } from "@/lib/api";
import { decideUserAction } from "@/lib/actions/admin";
import { AdminDashboard } from "@/components/admin/AdminDashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "ניהול משתמשים" };

/** Owner-only screen: who signed up, who is waiting for approval, and basic usage numbers. */
export default async function AdminPage() {
  let profile: MeProfile;
  try {
    profile = await apiFetch<MeProfile>("/me/profile");
  } catch (err) {
    if (err instanceof ApiError && (err.status === 401 || err.status === 403)) redirect("/login");
    throw err;
  }
  if (!profile.isAdmin) redirect("/library");

  const [summary, series, users] = await Promise.all([
    apiFetch<AdminSummary>("/admin/summary"),
    apiFetch<AdminDayPoint[]>("/admin/timeseries?days=30"),
    apiFetch<AdminUserRow[]>("/admin/users"),
  ]);

  return <AdminDashboard summary={summary} series={series} users={users} onDecide={decideUserAction} />;
}
