import "dotenv/config";
import { eq } from "drizzle-orm";
import { getDb, usersTable } from "@kawabunga/db";

async function main() {
  const db = getDb();
  if (!db) { console.log("No DB"); return; }
  const rows = await db.select({ id: usersTable.id, name: usersTable.name, email: usersTable.email })
    .from(usersTable)
    .where(eq(usersTable.role, "admin"));
  console.log(JSON.stringify(rows, null, 2));
}

main().catch(console.error);
