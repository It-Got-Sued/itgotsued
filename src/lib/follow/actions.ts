"use server";

import { z } from "zod";
import { getCurrentUser } from "@/lib/auth/session";
import { followCase, unfollowCase } from "@/lib/repo/case-follows";

export type FollowResult = { following: boolean } | { error: string };

const CaseId = z.string().trim().min(1).max(200);

/** Follow or unfollow a case for the signed-in user. Returns the saved state. */
export async function setCaseFollow(caseId: string, follow: boolean): Promise<FollowResult> {
  const user = await getCurrentUser();
  if (!user) return { error: "Sign in to follow cases." };
  const id = CaseId.safeParse(caseId);
  if (!id.success) return { error: "Case not found." };
  try {
    if (follow) await followCase(user.id, id.data);
    else await unfollowCase(user.id, id.data);
    return { following: follow };
  } catch (err) {
    console.error("[follow] save failed:", err instanceof Error ? err.message : err);
    return { error: "Could not save. Please try again." };
  }
}
