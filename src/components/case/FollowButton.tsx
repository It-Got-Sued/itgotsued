"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { setCaseFollow } from "@/lib/follow/actions";
import { IconCheck } from "../icons";

/** Follow toggle on a case page. Signed-out visitors go to sign in and come back. */
export function FollowButton({
  caseId,
  initialFollowing,
  signedIn,
  next,
}: {
  caseId: string;
  initialFollowing: boolean;
  signedIn: boolean;
  next: string;
}) {
  const [following, setFollowing] = useState(initialFollowing);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  if (!signedIn) {
    return (
      <Link href={`/login?next=${encodeURIComponent(next)}`} className="btn-primary shrink-0">
        Follow
      </Link>
    );
  }

  function toggle() {
    const want = !following;
    setFollowing(want);
    setError("");
    startTransition(async () => {
      const result = await setCaseFollow(caseId, want);
      if ("error" in result) {
        setFollowing(!want);
        setError(result.error);
      }
    });
  }

  return (
    <div className="flex shrink-0 flex-col items-start gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-pressed={following}
        className={following ? "btn-secondary" : "btn-primary"}
      >
        {following && <IconCheck size={16} />}
        {following ? "Following" : "Follow"}
      </button>
      {error && <p role="alert" className="text-sm text-danger-fg">{error}</p>}
    </div>
  );
}
