import Constants from 'expo-constants';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Disclaimer } from '@/components/CaseBits';
import { Text, useTheme } from '@/components/Themed';
import { Card, SectionTitle } from '@/components/ui';
import { API_BASE_URL } from '@/lib/api';
import { isExpoGo } from '@/lib/plaid';

const PRIVACY: [string, string][] = [
  ['No account needed', 'You can search, scan and check your items without signing up.'],
  [
    'Photos',
    'Photos are downscaled on your phone, sent once to detect brand names, and never stored on our servers.',
  ],
  [
    'My Items',
    'Your list is stored only on this phone. It is sent to our server only when you check it, and not saved there.',
  ],
  [
    'Bank scan (optional)',
    'Read-only through Plaid. The bank connection is removed and all transaction data discarded as soon as the scan finishes. Only matched brand names come back to your phone.',
  ],
  [
    'Brand alerts',
    'If you follow a brand, we store your email address and that brand so we can notify you. Unsubscribe from any alert email.',
  ],
  ['Calendar', 'We only add a claim deadline when you tap the button and confirm it.'],
];

export default function SettingsScreen() {
  const c = useTheme();
  const version = Constants.expoConfig?.version ?? '—';
  return (
    <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.content}>
      <SectionTitle>Privacy</SectionTitle>
      {PRIVACY.map(([h, b]) => (
        <View key={h} style={styles.point} accessible accessibilityLabel={`${h}. ${b}`}>
          <Text style={{ fontWeight: '600' }}>{h}</Text>
          <Text muted style={{ marginTop: 2 }}>
            {b}
          </Text>
        </View>
      ))}

      <SectionTitle>Server</SectionTitle>
      <Card>
        <Text muted style={{ fontSize: 14 }}>
          API base URL
        </Text>
        <Text selectable style={{ marginTop: 2 }} accessibilityLabel={`API base URL ${API_BASE_URL}`}>
          {API_BASE_URL}
        </Text>
        <Text muted style={{ fontSize: 13, marginTop: 8 }}>
          Set with EXPO_PUBLIC_API_URL at build time.
          {isExpoGo ? ' Running in Expo Go — bank scan is unavailable here.' : ''}
        </Text>
      </Card>

      <SectionTitle>About</SectionTitle>
      <Text style={{ lineHeight: 22 }}>
        ClassActionForMe is one index of U.S. class action lawsuits. Tell us what you own, or scan a
        shelf, and we&apos;ll show lawsuits that name those brands. When a claim form is open, we link
        you to the official settlement administrator — we never file claims for you.
      </Text>
      <Text muted style={{ marginTop: 10 }}>
        Version {version}
      </Text>
      <Disclaimer />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  point: { marginBottom: 14 },
});
