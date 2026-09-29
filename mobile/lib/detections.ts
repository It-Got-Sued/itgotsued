// Helpers for the editable list of detected brands shown as chips.
import type { BrandDetection } from '@shared/types';

export interface EditableDetection extends BrandDetection {
  key: string;
  confirmed: boolean;
}

/** Detections below this confidence start unconfirmed; the user taps to include them. */
export const LOW_CONFIDENCE = 0.6;

export function toEditable(detections: BrandDetection[]): EditableDetection[] {
  const seen = new Set<string>();
  const out: EditableDetection[] = [];
  for (const d of detections) {
    const key = d.brand.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...d, key, confirmed: d.confidence >= LOW_CONFIDENCE });
  }
  return out;
}

export function stripEditable(list: EditableDetection[]): BrandDetection[] {
  return list
    .filter((d) => d.confirmed)
    .map(({ key: _key, confirmed: _confirmed, ...d }) => d);
}
