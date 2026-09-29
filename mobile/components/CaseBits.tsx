// Case-related display components: status badge, case card, sample banner, disclaimer.
import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { CaseStatus, CaseSummary } from '@shared/types';
import { deadlineLabel, formatDate } from '@/lib/format';
import { STATUS_INFO, type Tone } from '@/lib/status';
import { Text, useTheme } from './Themed';

function useToneColors(tone: Tone): [string, string] {
  const c = useTheme();
  switch (tone) {
    case 'success':
      return [c.successBg, c.successFg];
    case 'info':
      return [c.infoBg, c.infoFg];
    case 'warn':
      return [c.warnBg, c.warnFg];
    case 'danger':
      return [c.dangerBg, c.dangerFg];
    default:
      return [c.neutralBg, c.neutralFg];
  }
}

export function StatusBadge({ status }: { status: CaseStatus }) {
  const info = STATUS_INFO[status] ?? STATUS_INFO.unknown;
  const [bg, fg] = useToneColors(info.tone);
  return (
    <View
      style={[styles.badge, { backgroundColor: bg }]}
      accessibilityLabel={`Status: ${info.label}`}>
      <Text style={[styles.badgeText, { color: fg }]}>{info.label}</Text>
    </View>
  );
}

export function SampleBadge() {
  const c = useTheme();
  return (
    <View
      style={[styles.badge, { backgroundColor: c.sampleBg }]}
      accessibilityLabel="Sample data, fictional case">
      <Text style={[styles.badgeText, { color: c.sampleFg }]}>Sample</Text>
    </View>
  );
}

export function SampleBanner() {
  const c = useTheme();
  return (
    <View
      style={[styles.banner, { backgroundColor: c.sampleBg }]}
      accessibilityRole="alert"
      accessibilityLabel="Sample data. This is a fictional case used for development.">
      <Text style={{ color: c.sampleFg, fontWeight: '700' }}>Sample data — fictional case</Text>
      <Text style={{ color: c.sampleFg, marginTop: 2, fontSize: 14 }}>
        This lawsuit and its companies are made up for testing. It is not a real case.
      </Text>
    </View>
  );
}

export function Disclaimer() {
  return (
    <Text muted style={styles.disclaimer} accessibilityRole="text">
      ClassActionForMe provides information, not legal advice. We don&apos;t file claims for
      you — &quot;Apply&quot; always opens the official settlement administrator&apos;s site.
      Talk to a lawyer about your specific situation.
    </Text>
  );
}

export function CaseCard({ item, compact }: { item: CaseSummary; compact?: boolean }) {
  const router = useRouter();
  const c = useTheme();
  const filed = formatDate(item.dateFiled);
  const deadline = item.status === 'claims_open' ? deadlineLabel(item.claimDeadline) : null;
  const statusLabel = (STATUS_INFO[item.status] ?? STATUS_INFO.unknown).label;
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/case/[id]', params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={`${item.caseName}. ${statusLabel}.${deadline ? ` ${deadline}.` : ''}${
        item.isSample ? ' Sample data.' : ''
      }`}
      accessibilityHint="Opens the lawsuit details"
      style={({ pressed }) => [
        styles.card,
        compact && styles.compactCard,
        { backgroundColor: c.surface, borderColor: c.border, opacity: pressed ? 0.8 : 1 },
      ]}>
      <View style={styles.badgeRow}>
        <StatusBadge status={item.status} />
        {item.isSample ? <SampleBadge /> : null}
      </View>
      <Text style={styles.title} numberOfLines={compact ? 3 : 2}>
        {item.caseName}
      </Text>
      <Text muted style={styles.meta} numberOfLines={1}>
        {item.court}
        {filed ? ` · Filed ${filed}` : ''}
      </Text>
      {deadline ? <Text style={[styles.meta, { color: c.successFg }]}>{deadline}</Text> : null}
      {!compact && item.summary ? (
        <Text muted style={styles.summary} numberOfLines={3}>
          {item.summary}
        </Text>
      ) : null}
      {item.brands.length > 0 ? (
        <Text style={[styles.meta, { color: c.tint }]} numberOfLines={1}>
          {item.brands.join(' · ')}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 3, alignSelf: 'flex-start' },
  badgeText: { fontSize: 13, fontWeight: '600' },
  badgeRow: { flexDirection: 'row', gap: 6, marginBottom: 8, flexWrap: 'wrap' },
  banner: { borderRadius: 12, padding: 12 },
  card: { borderRadius: 14, borderWidth: StyleSheet.hairlineWidth, padding: 14, marginBottom: 10 },
  compactCard: { width: 260, marginRight: 10, marginBottom: 0 },
  title: { fontSize: 17, fontWeight: '600' },
  meta: { fontSize: 14, marginTop: 4 },
  summary: { fontSize: 15, marginTop: 6 },
  disclaimer: { fontSize: 13, marginTop: 20, lineHeight: 18 },
});
