import { SessionsRefresh } from "@/components/sessions-refresh";
import { SessionsTable } from "@/components/sessions-table";
import { getSessionsIndexData } from "@/lib/session-index-data";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const data = await getSessionsIndexData();

  return (
    <>
      <SessionsRefresh activeCount={data.activeCount} />
      <SessionsTable data={data} />
    </>
  );
}
