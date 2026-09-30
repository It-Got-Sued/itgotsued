import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { hasActiveSubscription, listUsers } from "@/lib/repo/users";

export const metadata: Metadata = { title: "Users", robots: { index: false, follow: false } };

const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("en-US") : "—");

// Admin-only list of accounts. Admins are users with is_admin = true (set from ADMIN_EMAILS at sign-up).
export default async function AdminUsersPage() {
  const me = await requireUser("/admin/users");
  if (!me.isAdmin) notFound();
  const users = await listUsers();
  const paying = users.filter(hasActiveSubscription).length;

  return (
    <div className="space-y-6">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold tracking-tight">Users</h1>
        <p className="text-muted">
          {users.length} account{users.length === 1 ? "" : "s"}, {paying} subscribed
        </p>
      </header>
      <div className="card overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="border-b-2 border-border">
            <tr>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Subscription</th>
              <th className="px-4 py-3">Renews / ends</th>
              <th className="px-4 py-3">Signed up</th>
              <th className="px-4 py-3">Last login</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-3 font-medium">
                  {u.email}
                  {u.isAdmin && <span className="ml-2 text-muted">(admin)</span>}
                </td>
                <td className="px-4 py-3">
                  {u.subscriptionStatus}
                  {u.cancelAtPeriodEnd && " (canceling)"}
                </td>
                <td className="px-4 py-3">{fmt(u.currentPeriodEnd)}</td>
                <td className="px-4 py-3">{fmt(u.createdAt)}</td>
                <td className="px-4 py-3">{fmt(u.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
