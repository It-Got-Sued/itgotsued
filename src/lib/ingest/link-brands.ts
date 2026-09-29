// Link cases to brands without AI: when the defendant named in the case title is exactly a
// brand, a brand alias, or a brand's parent company (after dropping Inc./LLC/Co. and "The"),
// link the case to that brand. Conservative by design: "Kellogg Supply, Inc." does NOT
// match Kellogg's. Claude enrichment replaces these links with better ones.
import { listBrands, normalizeBrandKey, upsertBrand } from "@/lib/repo/brands";
import { linkCaseBrand } from "@/lib/repo/ingest";
import { companyKey } from "@/lib/brands/normalize";
import type { Brand } from "@/lib/types";

/** "Doe v. Acme Foods, Inc. et al" -> "Acme Foods, Inc." */
export function defendantOf(caseName: string): string | null {
  const m = caseName.match(/\s+v(?:s)?\.?\s+(.+)$/i);
  if (!m) return null;
  return m[1]
    .replace(/,?\s+et\s+al\.?$/i, "")
    .replace(/\s+\(.*\)$/, "")
    .trim();
}

export class DefendantLinker {
  private direct = new Map<string, Brand[]>();
  private viaParent = new Map<string, Brand[]>();

  static async load(): Promise<DefendantLinker> {
    const linker = new DefendantLinker();
    const push = (m: Map<string, Brand[]>, k: string, b: Brand) => {
      if (!k || k.length < 3) return;
      const list = m.get(k) ?? [];
      if (!list.includes(b)) list.push(b);
      m.set(k, list);
    };
    for (const b of await listBrands()) {
      push(linker.direct, companyKey(b.name), b);
      for (const a of b.aliases) push(linker.direct, companyKey(a), b);
      if (b.parentCompany) push(linker.viaParent, companyKey(b.parentCompany), b);
    }
    return linker;
  }

  /** Link one case; returns the brands linked (empty when the defendant is not a known brand). */
  async link(caseId: string, caseName: string): Promise<Brand[]> {
    const defendant = defendantOf(caseName);
    if (!defendant) return [];
    const key = companyKey(defendant);
    let hits = this.direct.get(key) ?? [];
    if (!hits.length && this.viaParent.get(key)?.length) {
      // The defendant is a parent company (e.g. PepsiCo). Link one company entity rather than
      // every product brand; the matcher expands parent -> brands only where filings name them.
      const parentName = this.viaParent.get(key)![0].parentCompany!;
      const company = await upsertBrand({
        name: parentName,
        normalized: normalizeBrandKey(parentName),
        parentCompany: null,
        aliases: [],
        category: "company",
      });
      this.direct.set(key, [company]);
      hits = [company];
    }
    if (!hits.length || hits.length > 3) return [];
    for (const b of hits) await linkCaseBrand(caseId, b.id, "defendant");
    return hits;
  }
}
