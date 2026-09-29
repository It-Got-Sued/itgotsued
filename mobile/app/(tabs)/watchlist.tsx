import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';

import { Text, useTheme } from '@/components/Themed';
import { Button, Card, EmptyState, Field, Notice, SectionTitle } from '@/components/ui';
import { followBrand, messageFor } from '@/lib/api';
import { formatDate } from '@/lib/format';
import { useAppState } from '@/lib/store';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function WatchlistScreen() {
  const c = useTheme();
  const { follows, addFollow, lastEmail } = useAppState();
  const [brand, setBrand] = useState('');
  const [email, setEmail] = useState(lastEmail);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  const submit = async () => {
    const b = brand.trim();
    const e = email.trim();
    if (!b) return;
    if (!EMAIL_RE.test(e)) {
      setMsg({ tone: 'danger', text: 'Enter a valid email address.' });
      return;
    }
    setSaving(true);
    setMsg(null);
    try {
      await followBrand(e, b);
      addFollow({ brand: b, email: e, followedAt: new Date().toISOString() });
      setMsg({ tone: 'success', text: `You're following ${b}.` });
      setBrand('');
    } catch (err) {
      setMsg({ tone: 'danger', text: messageFor(err, 'Brand alerts') });
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text muted style={{ marginBottom: 12 }}>
          Follow a brand and we&apos;ll email you when a new lawsuit names it or a claim form opens.
        </Text>
        <Card>
          <Field
            value={brand}
            onChangeText={setBrand}
            placeholder="Brand, e.g. Peloton"
            accessibilityLabel="Brand to follow"
            autoCorrect={false}
          />
          <Field
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            accessibilityLabel="Your email address"
            style={{ marginTop: 10 }}
          />
          {msg ? (
            <View style={{ marginTop: 10 }}>
              <Notice tone={msg.tone}>{msg.text}</Notice>
            </View>
          ) : null}
          <Button
            title="Follow brand"
            onPress={submit}
            loading={saving}
            disabled={!brand.trim() || !email.trim()}
            style={{ marginTop: 12 }}
          />
        </Card>

        <SectionTitle>Brands you follow</SectionTitle>
        {follows.length === 0 ? (
          <EmptyState
            title="You're not following any brands yet"
            body="Follow brands here or from any lawsuit page."
          />
        ) : (
          follows.map((f) => (
            <View
              key={f.brand}
              style={[styles.row, { borderColor: c.border }]}
              accessible
              accessibilityLabel={`${f.brand}, alerts to ${f.email}`}>
              <Text style={{ fontWeight: '600' }}>{f.brand}</Text>
              <Text muted style={{ fontSize: 14 }}>
                Alerts to {f.email} · since {formatDate(f.followedAt)}
              </Text>
            </View>
          ))
        )}
        <Text muted style={styles.note}>
          This list is saved on this phone. To stop alerts, use the unsubscribe link in any alert
          email.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  row: { borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 12 },
  note: { fontSize: 13, marginTop: 16 },
});
