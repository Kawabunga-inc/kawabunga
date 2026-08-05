import { cookies } from "next/headers";
import { AdminShell } from "@/components/admin-shell";
import { getSessionActivityData } from "@/lib/session-index-data";

const SIDEBAR_COOKIE = "odyssey-sidebar-collapsed";

export default async function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Read the persisted sidebar state server-side so the first paint matches
  // the user's preference. Without this the sidebar always renders open and
  // then snaps closed once a useEffect reads localStorage post-hydration.
  const initialCollapsed =
    (await cookies()).get(SIDEBAR_COOKIE)?.value === "true";
  const activeSessionCount = await getSessionActivityData()
    .then((data) => data.activeCount)
    .catch(() => 0);
  return (
    <AdminShell
      initialCollapsed={initialCollapsed}
      activeSessionCount={activeSessionCount}
    >
      {children}
    </AdminShell>
  );
}
