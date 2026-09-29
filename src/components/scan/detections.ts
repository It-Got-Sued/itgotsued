import type { BrandDetection, DetectionSource } from "@/lib/types";

/** One confirmable chip: all detections of the same brand, grouped. */
export interface DetectionGroup {
  key: string;
  label: string;
  detections: BrandDetection[];
  confidence: number;
  sources: DetectionSource[];
}

export function brandKey(brand: string): string {
  return brand.trim().toLowerCase().replace(/\s+/g, " ");
}

export function groupDetections(list: BrandDetection[]): DetectionGroup[] {
  const map = new Map<string, DetectionGroup>();
  for (const d of list) {
    if (!d.brand?.trim()) continue;
    const key = brandKey(d.brand);
    const g = map.get(key);
    if (g) {
      g.detections.push(d);
      if (d.confidence > g.confidence) {
        g.confidence = d.confidence;
        g.label = d.brand.trim();
      }
      if (!g.sources.includes(d.source)) g.sources.push(d.source);
    } else {
      map.set(key, {
        key,
        label: d.brand.trim(),
        detections: [d],
        confidence: d.confidence,
        sources: [d.source],
      });
    }
  }
  return [...map.values()];
}

export const SOURCE_LABEL: Record<DetectionSource, string> = {
  photo: "photo",
  text: "your description",
  bank: "bank",
  receipt: "receipt",
  manual: "My Items",
};
