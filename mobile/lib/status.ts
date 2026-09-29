// Plain-language labels for each case stage (mirrors the web app's copy).
import type { CaseStatus } from '@shared/types';

export type Tone = 'success' | 'info' | 'warn' | 'neutral' | 'danger';

export interface StatusInfo {
  label: string;
  explanation: string;
  tone: Tone;
}

export const STATUS_INFO: Record<CaseStatus, StatusInfo> = {
  filed: {
    label: 'Filed',
    explanation:
      'A complaint has been filed, but the court has not decided whether it can proceed as a class action. There is nothing to claim yet — follow the brand to hear about changes.',
    tone: 'info',
  },
  certified: {
    label: 'Class certified',
    explanation:
      'The court agreed the case can proceed on behalf of a class. If you fit the class definition you are usually included automatically; you may receive a notice about your rights, including opting out.',
    tone: 'info',
  },
  settlement_pending: {
    label: 'Settlement pending',
    explanation:
      'The parties proposed a settlement and the court has not given final approval yet. A claim form usually opens after approval — follow the brand to be told when.',
    tone: 'warn',
  },
  claims_open: {
    label: 'Claims open',
    explanation:
      "The court approved a settlement and a claim form is open. If you qualify, you can submit a claim on the official settlement administrator's website before the deadline.",
    tone: 'success',
  },
  claims_closed: {
    label: 'Claims closed',
    explanation:
      'The deadline to file a claim has passed. New claims are generally no longer accepted.',
    tone: 'neutral',
  },
  dismissed: {
    label: 'Dismissed',
    explanation:
      'The court dismissed the case, so there is no settlement or payment from it. It may still be appealed or refiled.',
    tone: 'danger',
  },
  unknown: {
    label: 'Status unknown',
    explanation:
      "We have not classified this case's stage yet. Check the source docket for the latest filings.",
    tone: 'neutral',
  },
};

/** Sort rank: claims_open first, then other active stages, then the rest. */
export const STATUS_RANK: Record<CaseStatus, number> = {
  claims_open: 0,
  settlement_pending: 1,
  certified: 2,
  filed: 3,
  unknown: 4,
  claims_closed: 5,
  dismissed: 6,
};
