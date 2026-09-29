import { Stack, useLocalSearchParams } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import type { CaseDetail } from '@shared/types';
import { Disclaimer, SampleBanner, StatusBadge } from '@/components/CaseBits';
import { Text, useTheme } from '@/components/Themed';
import {
  Button,
  Card,
  Chip,
  ErrorState,
  Field,
  LoadingState,
  Notice,
  SectionTitle,
} from '@/components/ui';
import { followBrand, getCase, messageFor } from '@/lib/api';
import { addDeadlineToCalendar } from '@/lib/calendar';
import { daysUntil, deadlineLabel, formatDate } from '@/lib/format';
import { STATUS_INFO } from '@/lib/status';
import { useAppState } from '@/lib/store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

async function openInApp(url: string) {
  await WebBrowser.openBrowserAsync(url, {
    presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET,
    dismissButtonStyle: 'close',
  });
}

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useTheme();
  const [data, setData] = useState<CaseDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setData(null);
    try {
      setData(await getCase(String(id)));
    } catch (e) {
      setError(messageFor(e, 'This lawsuit'));
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  if (error) {
    return (
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        <ErrorState message={error} onRetry={load} />
      </View>
    );
  }
  if (!data) {
    return (
      <View style={[styles.fill, { backgroundColor: c.background }]}>
        <LoadingState label="Loading lawsuit…" />
      </View>
    );
  }
  return <CaseBody data={data} />;
}

function CaseBody({ data }: { data: CaseDetail }) {
  const c = useTheme();
  const info = STATUS_INFO[data.status] ?? STATUS_INFO.unknown;
  const canApply = data.status === 'claims_open' && !!data.claimUrl;
  const deadlineDays = daysUntil(data.claimDeadline);
  const canAddDeadline =
    data.status === 'claims_open' && !!data.claimDeadline && (deadlineDays ?? 0) >= 0;
  const [calendarMsg, setCalendarMsg] = useState<string | null>(null);

  const addToCalendar = async () => {
    setCalendarMsg(null);
    try {
      const r = await addDeadlineToCalendar({
        caseName: data.caseName,
        deadline: data.claimDeadline!,
        claimUrl: data.claimUrl,
      });
      if (r === 'saved') setCalendarMsg('Deadline added to your calendar.');
    } catch {
      setCalendarMsg('Could not open your calendar. Check calendar access in Settings.');
    }
  };

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: data.brands[0] ?? 'Lawsuit' }} />
      {data.isSample ? (
        <View style={{ marginBottom: 12 }}>
          <SampleBanner />
        </View>
      ) : null}

      <StatusBadge status={data.status} />
      <Text accessibilityRole="header" style={styles.title}>
        {data.caseName}
      </Text>
      <Text muted style={styles.meta}>
        {data.court}
        {data.docketNumber ? ` · No. ${data.docketNumber}` : ''}
      </Text>
      {data.dateFiled ? <Text muted style={styles.meta}>Filed {formatDate(data.dateFiled)}</Text> : null}

      <Card style={{ marginTop: 14 }}>
        <Text style={{ fontWeight: '700', marginBottom: 4 }}>What “{info.label}” means</Text>
        <Text muted>{info.explanation}</Text>
      </Card>

      {data.status === 'claims_open' ? (
        <Card style={{ marginTop: 14 }}>
          {data.claimDeadline ? (
            <Text style={{ fontWeight: '700', color: c.successFg }}>
              {deadlineLabel(data.claimDeadline)}
            </Text>
          ) : (
            <Text muted>No claim deadline listed.</Text>
          )}
          {data.settlementAmount ? (
            <Text muted style={{ marginTop: 4 }}>
              Settlement: {data.settlementAmount}
            </Text>
          ) : null}
          {canApply ? (
            <>
              <Button
                title="Apply on official settlement site"
                onPress={() => openInApp(data.claimUrl!)}
                style={{ marginTop: 12 }}
                accessibilityHint="Opens the settlement administrator's website in an in-app browser"
              />
              <Text muted style={styles.small}>
                You&apos;ll leave ClassActionForMe and file directly with the court-appointed
                administrator. We never file claims for you.
              </Text>
            </>
          ) : (
            <Text muted style={{ marginTop: 8 }}>
              We don&apos;t have the official claim link yet.
            </Text>
          )}
          {canAddDeadline ? (
            <Button
              title="Add deadline to calendar"
              variant="secondary"
              onPress={addToCalendar}
              style={{ marginTop: 10 }}
            />
          ) : null}
          {calendarMsg ? <Text muted style={styles.small}>{calendarMsg}</Text> : null}
        </Card>
      ) : data.settlementAmount ? (
        <Text muted style={{ marginTop: 10 }}>Settlement: {data.settlementAmount}</Text>
      ) : null}

      {data.summary ? (
        <>
          <SectionTitle>Summary</SectionTitle>
          <Text style={styles.body}>{data.summary}</Text>
        </>
      ) : null}

      <SectionTitle>Who qualifies</SectionTitle>
      <Text style={styles.body} muted={!data.whoQualifies}>
        {data.whoQualifies ?? 'The class definition hasn’t been summarized yet. Check the complaint.'}
      </Text>
      {data.states.length ? (
        <Text muted style={styles.meta}>States: {data.states.join(', ')}</Text>
      ) : null}

      {data.brands.length ? (
        <>
          <SectionTitle>Brands named</SectionTitle>
          <View style={styles.chips}>
            {data.brands.map((b) => (
              <Chip key={b} label={b} />
            ))}
          </View>
        </>
      ) : null}

      <FollowBrand brands={data.brands} />

      <SectionTitle>Court documents</SectionTitle>
      {data.complaintUrl ? (
        <Button
          title="Read the complaint (PDF)"
          variant="secondary"
          onPress={() => openInApp(data.complaintUrl!)}
        />
      ) : (
        <Text muted>The complaint PDF isn&apos;t available yet.</Text>
      )}
      {data.docketEntries.length ? (
        <View style={{ marginTop: 12 }}>
          {data.docketEntries.map((e, i) => {
            const label = `${e.entryNumber != null ? `#${e.entryNumber} ` : ''}${
              e.dateFiled ? formatDate(e.dateFiled) : ''
            }`.trim();
            const content = (
              <>
                {label ? <Text muted style={styles.small}>{label}</Text> : null}
                <Text style={{ fontSize: 15 }} numberOfLines={6}>
                  {e.description}
                </Text>
                {e.documentUrl ? (
                  <Text style={[styles.small, { color: c.tint }]}>Open document</Text>
                ) : null}
              </>
            );
            return e.documentUrl ? (
              <Pressable
                key={`${e.entryNumber}-${i}`}
                onPress={() => openInApp(e.documentUrl!)}
                accessibilityRole="link"
                accessibilityLabel={`Docket entry ${label}: ${e.description}. Opens document.`}
                style={[styles.entry, { borderColor: c.border }]}>
                {content}
              </Pressable>
            ) : (
              <View key={`${e.entryNumber}-${i}`} style={[styles.entry, { borderColor: c.border }]}>
                {content}
              </View>
            );
          })}
        </View>
      ) : (
        <Text muted style={{ marginTop: 8 }}>No docket entries yet.</Text>
      )}

      <View style={{ marginTop: 20 }}>
        {data.sourceUrl ? (
          <Pressable
            onPress={() => openInApp(data.sourceUrl!)}
            accessibilityRole="link"
            accessibilityLabel="View the source docket">
            <Text style={{ color: c.tint }}>View source docket ({data.source})</Text>
          </Pressable>
        ) : (
          <Text muted>Source: {data.source}</Text>
        )}
        {data.lastChecked ? (
          <Text muted style={styles.small}>Last checked {formatDate(data.lastChecked)}</Text>
        ) : null}
      </View>

      <Disclaimer />
    </ScrollView>
  );
}

function FollowBrand({ brands }: { brands: string[] }) {
  const { lastEmail, addFollow } = useAppState();
  const [brand, setBrand] = useState(brands[0] ?? '');
  const [email, setEmail] = useState(lastEmail);
  const [state, setState] = useState<'idle' | 'saving' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (brands.length === 0) return null;

  const submit = async () => {
    const e = email.trim();
    if (!EMAIL_RE.test(e)) {
      setError('Enter a valid email address.');
      return;
    }
    setError(null);
    setState('saving');
    try {
      await followBrand(e, brand);
      addFollow({ brand, email: e, followedAt: new Date().toISOString() });
      setState('done');
    } catch (err) {
      setError(messageFor(err, 'Brand alerts'));
      setState('idle');
    }
  };

  return (
    <Card style={{ marginTop: 20 }}>
      <Text accessibilityRole="header" style={{ fontWeight: '700', fontSize: 17 }}>
        Follow {brands.length === 1 ? brands[0] : 'a brand'}
      </Text>
      <Text muted style={{ marginTop: 4, marginBottom: 10 }}>
        Get an email when a new lawsuit is filed or a claim form opens.
      </Text>
      {state === 'done' ? (
        <Notice tone="success">You&apos;re following {brand}. We&apos;ll email {email.trim()}.</Notice>
      ) : (
        <>
          {brands.length > 1 ? (
            <View style={[styles.chips, { marginBottom: 10 }]}>
              {brands.map((b) => (
                <Chip key={b} label={b} selected={b === brand} onPress={() => setBrand(b)} />
              ))}
            </View>
          ) : null}
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            accessibilityLabel="Email address for alerts"
          />
          {error ? (
            <View style={{ marginTop: 8 }}>
              <Notice tone="danger">{error}</Notice>
            </View>
          ) : null}
          <Button
            title={`Follow ${brand}`}
            onPress={submit}
            loading={state === 'saving'}
            disabled={!email.trim() || !brand}
            style={{ marginTop: 10 }}
          />
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'center' },
  content: { padding: 16, paddingBottom: 48 },
  title: { fontSize: 24, fontWeight: '700', marginTop: 10 },
  meta: { fontSize: 14, marginTop: 4 },
  body: { fontSize: 16, lineHeight: 23 },
  small: { fontSize: 13, marginTop: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  entry: { borderTopWidth: StyleSheet.hairlineWidth, paddingVertical: 10 },
});
