import { query, transaction } from "@/lib/db";
import type { OwnedItem } from "@/lib/types";

export const MAX_USER_ITEMS = 500;

type Row = { id: string; label: string; brand: string | null; added_at: Date };

const toItem = (r: Row): OwnedItem => ({
  id: r.id,
  label: r.label,
  ...(r.brand ? { brand: r.brand } : {}),
  addedAt: r.added_at.toISOString(),
});

export async function listUserItems(userId: string): Promise<OwnedItem[]> {
  const rows = await query<Row>(
    "SELECT id, label, brand, added_at FROM user_items WHERE user_id = $1 ORDER BY added_at, id",
    [userId],
  );
  return rows.map(toItem);
}

/**
 * Makes the saved list exactly `items`. Idempotent: re-sending the same list is a no-op in
 * effect. ON CONFLICT DO NOTHING drops duplicate names and any id already owned by
 * another user, so one account can never overwrite another's rows.
 */
export async function replaceUserItems(userId: string, items: OwnedItem[]): Promise<OwnedItem[]> {
  await transaction(async (client) => {
    await client.query("DELETE FROM user_items WHERE user_id = $1", [userId]);
    const list = items.slice(0, MAX_USER_ITEMS);
    if (!list.length) return;
    await client.query(
      `INSERT INTO user_items (id, user_id, label, brand, added_at)
       SELECT id, $1, label, brand, added_at
       FROM unnest($2::text[], $3::text[], $4::text[], $5::timestamptz[]) AS t(id, label, brand, added_at)
       ON CONFLICT DO NOTHING`,
      [userId, list.map((i) => i.id), list.map((i) => i.label), list.map((i) => i.brand ?? null), list.map((i) => i.addedAt)],
    );
  });
  return listUserItems(userId);
}
