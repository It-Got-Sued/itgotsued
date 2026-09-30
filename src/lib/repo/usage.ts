import { queryOne } from "@/lib/db";

/**
 * Count one use of `feature` today (UTC) if the user is under `limit`.
 * Returns whether it was allowed and how many uses remain today.
 */
export async function consumeDaily(
  userId: string,
  feature: string,
  limit: number,
): Promise<{ ok: boolean; remaining: number }> {
  const r = await queryOne<{ count: number }>(
    `INSERT INTO usage_counts (user_id, feature, count) VALUES ($1, $2, 1)
     ON CONFLICT (user_id, feature, day) DO UPDATE SET count = usage_counts.count + 1
       WHERE usage_counts.count < $3
     RETURNING count`,
    [userId, feature, limit],
  );
  return r ? { ok: true, remaining: Math.max(0, limit - r.count) } : { ok: false, remaining: 0 };
}

export async function usedToday(userId: string, feature: string): Promise<number> {
  const r = await queryOne<{ count: number }>(
    "SELECT count FROM usage_counts WHERE user_id = $1 AND feature = $2 AND day = (now() AT TIME ZONE 'utc')::date",
    [userId, feature],
  );
  return r?.count ?? 0;
}
