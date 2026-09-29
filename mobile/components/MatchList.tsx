// Renders BrandMatch[] grouped by brand, cases sorted with claims_open first.
import { StyleSheet, View } from 'react-native';

import type { BrandMatch } from '@shared/types';
import { STATUS_RANK } from '@/lib/status';
import { CaseCard } from './CaseBits';
import { Text, useTheme } from './Themed';

export function sortMatches(matches: BrandMatch[]): BrandMatch[] {
  const withCases = matches
    .filter((m) => m.cases.length > 0)
    .map((m) => ({
      ...m,
      cases: [...m.cases].sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]),
    }));
  const best = (m: BrandMatch) => Math.min(...m.cases.map((c) => STATUS_RANK[c.status]));
  return withCases.sort((a, b) => best(a) - best(b) || a.brand.name.localeCompare(b.brand.name));
}

export function MatchGroup({ match }: { match: BrandMatch }) {
  const c = useTheme();
  const via = Array.from(
    new Set(match.detections.map((d) => d.product || d.brand).filter(Boolean))
  ).slice(0, 4);
  const open = match.cases.filter((x) => x.status === 'claims_open').length;
  return (
    <View style={styles.group}>
      <Text accessibilityRole="header" style={styles.brand}>
        {match.brand.name}
        <Text muted style={{ fontSize: 15, fontWeight: '400' }}>
          {'  '}
          {match.cases.length} {match.cases.length === 1 ? 'lawsuit' : 'lawsuits'}
          {open ? ` · ${open} open for claims` : ''}
        </Text>
      </Text>
      {match.brand.parentCompany && match.brand.parentCompany !== match.brand.name ? (
        <Text muted style={styles.sub}>
          Owned by {match.brand.parentCompany}
        </Text>
      ) : null}
      {via.length ? (
        <Text style={[styles.sub, { color: c.muted }]}>Matched from: {via.join(', ')}</Text>
      ) : null}
      <View style={{ marginTop: 8 }}>
        {match.cases.map((cs) => (
          <CaseCard key={cs.id} item={cs} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: 18 },
  brand: { fontSize: 20, fontWeight: '700' },
  sub: { fontSize: 14, marginTop: 2 },
});
