// Privacy explainer shown before opening Plaid Link, then the scan + match flow.
import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { DetectionEditor } from '@/components/DetectionEditor';
import { Text, useTheme } from '@/components/Themed';
import { Button, LoadingState, Notice, SectionTitle } from '@/components/ui';
import { createPlaidLinkToken, messageFor, plaidScan } from '@/lib/api';
import { stripEditable, toEditable, type EditableDetection } from '@/lib/detections';
import { isExpoGo, loadPlaid } from '@/lib/plaid';
import { useMatchAndShow } from '@/lib/useMatch';

const POINTS: [string, string][] = [
  ['Read-only', 'Plaid gives us read-only access to recent transactions. We can’t move money.'],
  [
    'Deleted right after',
    'As soon as the scan finishes, we remove the bank connection and discard all transaction data.',
  ],
  [
    'Only brand names come back',
    'Your phone receives only the list of merchant brands we found — no amounts, dates or account numbers.',
  ],
  [
    'Merchants, not products',
    'Banks show where you paid (Amazon, Verizon, Peloton), not what you bought. It works best for services, subscriptions, telecoms and airlines.',
  ],
  ['Optional', 'You never need a bank connection to use ClassActionForMe.'],
];

export default function BankScanScreen() {
  const c = useTheme();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [detections, setDetections] = useState<EditableDetection[] | null>(null);
  const { run, matching, matchError } = useMatchAndShow();

  const start = async () => {
    setError(null);
    const plaid = loadPlaid();
    if (!plaid) {
      setError(
        isExpoGo
          ? 'Bank scan needs the full ClassActionForMe app build. It isn’t available in Expo Go.'
          : 'Bank scan isn’t available in this build of the app.'
      );
      return;
    }
    try {
      setBusy('Starting secure connection…');
      const { linkToken } = await createPlaidLinkToken('ios');
      const session = await plaid.createPlaidLinkSession({
        token: linkToken,
        onSuccess: async (success) => {
          setBusy('Scanning transactions for brands…');
          try {
            const res = await plaidScan(success.publicToken);
            setDetections(toEditable(res.detections));
          } catch (e) {
            setError(messageFor(e, 'Bank scan'));
          } finally {
            setBusy(null);
          }
        },
        onEvent: () => {},
        onExit: (exit) => {
          setBusy(null);
          if (exit.error) {
            setError(exit.error.displayMessage || 'The bank connection was not completed.');
          }
        },
      });
      setBusy(null);
      await session.open(true);
    } catch (e) {
      setBusy(null);
      setError(messageFor(e, 'Bank scan'));
    }
  };

  const confirmed = detections ? stripEditable(detections) : [];

  return (
    <ScrollView
      style={{ backgroundColor: c.background }}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled">
      {!detections ? (
        <>
          <Text accessibilityRole="header" style={styles.title}>
            Find lawsuits from what you pay for
          </Text>
          <Text muted style={{ marginBottom: 16 }}>
            Here&apos;s exactly what happens with your bank data:
          </Text>
          {POINTS.map(([h, b]) => (
            <View key={h} style={styles.point} accessible accessibilityLabel={`${h}. ${b}`}>
              <Text style={{ fontWeight: '600' }}>{h}</Text>
              <Text muted style={{ marginTop: 2 }}>
                {b}
              </Text>
            </View>
          ))}
          {error ? (
            <View style={{ marginTop: 12 }}>
              <Notice tone="danger">{error}</Notice>
            </View>
          ) : null}
          {busy ? (
            <LoadingState label={busy} />
          ) : (
            <Button
              title="Continue to Plaid"
              onPress={start}
              style={{ marginTop: 20 }}
              accessibilityHint="Opens Plaid to connect a bank account read-only"
            />
          )}
        </>
      ) : (
        <>
          <SectionTitle>Brands from your transactions</SectionTitle>
          <Notice tone="success">Your bank connection has been removed and transactions discarded.</Notice>
          <View style={{ marginTop: 12 }}>
            {detections.length === 0 ? (
              <Notice>We didn&apos;t find brands linked to lawsuits in your transactions.</Notice>
            ) : null}
            <DetectionEditor value={detections} onChange={setDetections} />
          </View>
          {matchError ? (
            <View style={{ marginTop: 12 }}>
              <Notice tone="danger">{matchError}</Notice>
            </View>
          ) : null}
          <Button
            title={`Find lawsuits (${confirmed.length})`}
            onPress={() => run(confirmed, 'From your bank transactions')}
            loading={matching}
            disabled={confirmed.length === 0}
            style={{ marginTop: 16 }}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  title: { fontSize: 22, fontWeight: '700', marginBottom: 6 },
  point: { marginBottom: 14 },
});
