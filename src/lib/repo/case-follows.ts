import { query, queryOne, transaction } from "@/lib/db";
import type { ProofOfPurchase } from "@/lib/types";

export async function isFollowingCase(userId: string, caseId: string): Promise<boolean> {
  return !!(await queryOne("SELECT 1 FROM case_follows WHERE user_id = $1 AND case_id = $2", [userId, caseId]));
}

/**
 * Follow a case. If its claims are already open, the follower can see that on the page, so the
 * claims-open email is marked as sent and only future changes are emailed.
 */
export async function followCase(userId: string, caseId: string): Promise<void> {
  await transaction(async (client) => {
    await client.query(
      "INSERT INTO case_follows (user_id, case_id) VALUES ($1, $2) ON CONFLICT (user_id, case_id) DO NOTHING",
      [userId, caseId],
    );
    await client.query(
      `INSERT INTO case_notifications (user_id, case_id, kind)
       SELECT $1, id, 'claims_open' FROM cases WHERE id = $2 AND status = 'claims_open'
       ON CONFLICT (user_id, case_id, kind) DO NOTHING`,
      [userId, caseId],
    );
  });
}

export async function unfollowCase(userId: string, caseId: string): Promise<void> {
  await query("DELETE FROM case_follows WHERE user_id = $1 AND case_id = $2", [userId, caseId]);
}

export type ClaimsOpenNotice = {
  userId: string;
  email: string;
  caseId: string;
  caseName: string;
  claimDeadline: string | null;
  proofOfPurchase: ProofOfPurchase;
  noProofPayout: string | null;
};

/** Followers of cases whose claims are open and who have not been emailed about it yet. */
export async function pendingClaimsOpenNotices(): Promise<ClaimsOpenNotice[]> {
  const rows = await query<{
    user_id: string;
    email: string;
    case_id: string;
    case_name: string;
    claim_deadline: string | null;
    proof_of_purchase: ProofOfPurchase;
    no_proof_payout: string | null;
  }>(
    `SELECT u.id AS user_id, u.email, c.id AS case_id, c.case_name, c.claim_deadline, c.proof_of_purchase, c.no_proof_payout
     FROM case_follows f
     JOIN users u ON u.id = f.user_id
     JOIN cases c ON c.id = f.case_id
     WHERE c.status = 'claims_open'
       AND (c.claim_deadline IS NULL OR c.claim_deadline >= current_date)
       AND NOT EXISTS (
         SELECT 1 FROM case_notifications n
         WHERE n.user_id = f.user_id AND n.case_id = f.case_id AND n.kind = 'claims_open'
       )
     ORDER BY c.id, u.id`,
  );
  return rows.map((r) => ({
    userId: r.user_id,
    email: r.email,
    caseId: r.case_id,
    caseName: r.case_name,
    claimDeadline: r.claim_deadline,
    proofOfPurchase: r.proof_of_purchase,
    noProofPayout: r.no_proof_payout,
  }));
}

/** Record a notice before sending it. Returns false if it was already recorded. */
export async function markNotified(userId: string, caseId: string, kind: string): Promise<boolean> {
  const rows = await query(
    `INSERT INTO case_notifications (user_id, case_id, kind) VALUES ($1, $2, $3)
     ON CONFLICT (user_id, case_id, kind) DO NOTHING RETURNING user_id`,
    [userId, caseId, kind],
  );
  return rows.length > 0;
}

/** Undo markNotified when the email could not be sent, so the next run retries it. */
export async function unmarkNotified(userId: string, caseId: string, kind: string): Promise<void> {
  await query("DELETE FROM case_notifications WHERE user_id = $1 AND case_id = $2 AND kind = $3", [
    userId,
    caseId,
    kind,
  ]);
}
