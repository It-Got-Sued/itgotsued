import type { CaseStatus } from "@/lib/types";
import { STATUS_INFO, TONE_CLASSES, TONE_DOT } from "./status";

export function StatusBadge({ status }: { status: CaseStatus }) {
  const info = STATUS_INFO[status] ?? STATUS_INFO.unknown;
  const live = status === "claims_open";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${TONE_CLASSES[info.tone]}`}
    >
      <span aria-hidden className="relative flex h-2 w-2">
        {live && (
          <span className={`absolute inline-flex h-full w-full animate-ping-slow rounded-full ${TONE_DOT[info.tone]}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${TONE_DOT[info.tone]}`} />
      </span>
      {info.label}
    </span>
  );
}
