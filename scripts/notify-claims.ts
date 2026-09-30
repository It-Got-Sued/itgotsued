// Email people who follow a case when its settlement claim form opens. Each follower gets one
// email per case; case_notifications records who has been told.
//   npm run notify-claims
//   npm run notify-claims -- --dry-run    list who would be emailed, send nothing
import "./_env";
import { parseArgs } from "./_env";
import { closePool } from "@/lib/db";
import { formatDate } from "@/components/format";
import { sendEmail } from "@/lib/email";
import { markNotified, pendingClaimsOpenNotices, unmarkNotified, type ClaimsOpenNotice } from "@/lib/repo/case-follows";
import { SITE_NAME, SITE_URL } from "@/lib/seo";

function message(n: ClaimsOpenNotice): { subject: string; text: string } {
  const url = `${SITE_URL}/cases/${encodeURIComponent(n.caseId)}`;
  const deadline = formatDate(n.claimDeadline);
  return {
    subject: `Claims are open: ${n.caseName}`,
    text: [
      `The settlement claim form for ${n.caseName} is now open.`,
      ...(deadline ? [`Claims are due by ${deadline}.`] : []),
      ...(n.proofOfPurchase === "not_required"
        ? [`No proof of purchase needed${n.noProofPayout ? `: claims without a receipt get ${n.noProofPayout}` : ""}.`]
        : []),
      "",
      "See who qualifies and how to file a claim:",
      url,
      "",
      `You're getting this because you follow this case on ${SITE_NAME}.`,
      "To stop these emails, open the case page and press Following to unfollow.",
    ].join("\n"),
  };
}

async function main() {
  const dryRun = Boolean(parseArgs()["dry-run"]);
  // sendEmail only logs without a key; stop so notices are not marked sent when nothing went out.
  if (!dryRun && !process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY is not set.");
  const notices = await pendingClaimsOpenNotices();
  let sent = 0;
  let failed = 0;
  for (const n of notices) {
    if (dryRun) {
      console.log(`would email ${n.email} about ${n.caseId}`);
      continue;
    }
    // Record first so an overlapping run cannot send twice; undo on failure so the next run retries.
    if (!(await markNotified(n.userId, n.caseId, "claims_open"))) continue;
    const { subject, text } = message(n);
    try {
      await sendEmail(n.email, subject, text);
      sent++;
    } catch (err) {
      await unmarkNotified(n.userId, n.caseId, "claims_open");
      console.error(`[notify] ${n.caseId} to user ${n.userId} failed:`, err instanceof Error ? err.message : err);
      failed++;
    }
  }
  console.log(dryRun ? `${notices.length} pending` : `Sent ${sent} claims-open emails; ${failed} failed.`);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(closePool);
