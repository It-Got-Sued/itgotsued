// My Items: a device-only list of things the user owns, matched to active lawsuits.
import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import {
  ACTIVE_STATUSES,
  type BrandDetection,
  type BrandMatch,
  type OwnedItem,
} from '@shared/types';
import { Disclaimer } from '@/components/CaseBits';
import { MatchGroup, sortMatches } from '@/components/MatchList';
import { Text, useTheme } from '@/components/Themed';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Notice,
  SectionTitle,
} from '@/components/ui';
import { matchBrands, messageFor } from '@/lib/api';
import { parseItemList, useAppState } from '@/lib/store';

function toDetection(item: OwnedItem): BrandDetection {
  return {
    brand: item.brand?.trim() || item.label,
    product: item.label,
    confidence: 1,
    source: 'manual',
  };
}

const signature = (items: OwnedItem[]) =>
  items.map((i) => `${i.label}|${i.brand ?? ''}`).sort().join('\n');

export default function MyItemsScreen() {
  const c = useTheme();
  const { loaded, items, addItems, updateItem, removeItem } = useAppState();

  const [draft, setDraft] = useState('');
  const [pasteMode, setPasteMode] = useState(false);
  const [addMsg, setAddMsg] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [matches, setMatches] = useState<BrandMatch[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastChecked = useRef<string | null>(null);

  const check = useCallback(async (list: OwnedItem[]) => {
    lastChecked.current = signature(list);
    if (list.length === 0) {
      setMatches([]);
      return;
    }
    setChecking(true);
    setError(null);
    try {
      const res = await matchBrands({ detections: list.map(toDetection), activeOnly: true });
      // Keep only active cases even if the server ignores activeOnly.
      setMatches(
        res.matches.map((m) => ({
          ...m,
          cases: m.cases.filter((cs) => ACTIVE_STATUSES.includes(cs.status)),
        }))
      );
    } catch (e) {
      setError(messageFor(e, 'Matching'));
    } finally {
      setChecking(false);
    }
  }, []);

  // Runs when the tab opens (and again if the list changed since the last check).
  useFocusEffect(
    useCallback(() => {
      if (loaded && lastChecked.current !== signature(items)) check(items);
    }, [loaded, items, check])
  );

  const add = () => {
    const labels = pasteMode ? parseItemList(draft) : [draft.trim()].filter(Boolean);
    if (!labels.length) return;
    const n = addItems(labels);
    setAddMsg(
      n === 0
        ? 'Already in your list.'
        : pasteMode
          ? `Added ${n} ${n === 1 ? 'item' : 'items'}.`
          : null
    );
    setDraft('');
    if (n > 0) setPasteMode(false);
  };

  const sorted = useMemo(() => (matches ? sortMatches(matches) : []), [matches]);
  const unmatched = useMemo(() => {
    if (!matches) return [];
    const hit = new Set<string>();
    for (const m of matches) {
      if (m.cases.length === 0) continue;
      for (const d of m.detections) {
        if (d.product) hit.add(d.product.toLowerCase());
        hit.add(d.brand.toLowerCase());
      }
    }
    return items.filter(
      (i) => !hit.has(i.label.toLowerCase()) && !(i.brand && hit.has(i.brand.toLowerCase()))
    );
  }, [matches, items]);
  const stale = matches !== null && lastChecked.current !== signature(items);

  if (!loaded) return <LoadingState label="Loading your items…" />;

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text muted style={{ marginBottom: 12 }}>
          List the things you own or use. We check them against active lawsuits. Your list stays on
          this phone; it&apos;s only sent to our server when you check it, and isn&apos;t saved there.
        </Text>

        <Card>
          <Field
            value={draft}
            onChangeText={setDraft}
            multiline={pasteMode}
            placeholder={
              pasteMode
                ? 'Paste a list — one per line or separated by commas'
                : 'e.g. Crest toothpaste'
            }
            returnKeyType={pasteMode ? 'default' : 'done'}
            onSubmitEditing={pasteMode ? undefined : add}
            submitBehavior={pasteMode ? 'newline' : 'submit'}
            accessibilityLabel={pasteMode ? 'Paste a list of items' : 'Add an item you own'}
          />
          {addMsg ? (
            <Text muted style={{ marginTop: 6 }} accessibilityLiveRegion="polite">
              {addMsg}
            </Text>
          ) : null}
          <View style={styles.row}>
            <Button
              title={pasteMode ? 'Add all' : 'Add'}
              onPress={add}
              disabled={!draft.trim()}
              style={{ flex: 1 }}
            />
            <Button
              title={pasteMode ? 'Add one at a time' : 'Paste a list'}
              variant="secondary"
              onPress={() => {
                setPasteMode((p) => !p);
                setAddMsg(null);
              }}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        <SectionTitle>
          Your items{items.length ? ` (${items.length})` : ''}
        </SectionTitle>
        {items.length === 0 ? (
          <EmptyState
            title="No items yet"
            body="Add products and services you use — toothpaste, soda, your phone carrier, your car."
          />
        ) : (
          items.map((item) =>
            editingId === item.id ? (
              <EditRow
                key={item.id}
                item={item}
                onSave={(patch) => {
                  updateItem(item.id, patch);
                  setEditingId(null);
                }}
                onCancel={() => setEditingId(null)}
              />
            ) : (
              <View key={item.id} style={[styles.itemRow, { borderColor: c.border }]}>
                <Pressable
                  style={{ flex: 1 }}
                  onPress={() => setEditingId(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.label}${item.brand ? `, brand ${item.brand}` : ''}`}
                  accessibilityHint="Double tap to edit">
                  <Text>{item.label}</Text>
                  {item.brand ? (
                    <Text muted style={{ fontSize: 14 }}>
                      Brand: {item.brand}
                    </Text>
                  ) : null}
                </Pressable>
                <Pressable
                  onPress={() => setEditingId(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Edit ${item.label}`}
                  hitSlop={8}
                  style={styles.iconBtn}>
                  <Text style={{ color: c.tint }}>Edit</Text>
                </Pressable>
                <Pressable
                  onPress={() => removeItem(item.id)}
                  accessibilityRole="button"
                  accessibilityLabel={`Remove ${item.label}`}
                  hitSlop={8}
                  style={styles.iconBtn}>
                  <Text style={{ color: c.dangerFg }}>Remove</Text>
                </Pressable>
              </View>
            )
          )
        )}

        {items.length ? (
          <Button
            title={stale ? 'Check my items (list changed)' : 'Check my items'}
            onPress={() => check(items)}
            loading={checking}
            style={{ marginTop: 16 }}
          />
        ) : null}

        {items.length ? <SectionTitle>Active lawsuits for your items</SectionTitle> : null}
        {checking && !matches ? <LoadingState label="Checking your items…" /> : null}
        {error ? <ErrorState message={error} onRetry={() => check(items)} /> : null}
        {!error && matches && items.length ? (
          sorted.length === 0 ? (
            <Notice>
              No active lawsuits name your items right now. Follow brands in Watchlist to hear when
              one is filed.
            </Notice>
          ) : (
            sorted.map((m) => <MatchGroup key={m.brand.id} match={m} />)
          )
        ) : null}

        {!error && matches && unmatched.length && sorted.length ? (
          <>
            <SectionTitle>No active lawsuits found for</SectionTitle>
            <Text muted>{unmatched.map((i) => i.label).join(', ')}</Text>
            <Text muted style={{ fontSize: 14, marginTop: 6 }}>
              Tip: tap an item and add its brand name to improve matching.
            </Text>
          </>
        ) : null}

        <Disclaimer />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function EditRow({
  item,
  onSave,
  onCancel,
}: {
  item: OwnedItem;
  onSave: (patch: { label: string; brand?: string }) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(item.label);
  const [brand, setBrand] = useState(item.brand ?? '');
  return (
    <Card style={{ marginBottom: 10 }}>
      <Field value={label} onChangeText={setLabel} accessibilityLabel="Item name" autoFocus />
      <Field
        value={brand}
        onChangeText={setBrand}
        placeholder="Brand (optional), e.g. Crest"
        accessibilityLabel="Brand, optional"
        style={{ marginTop: 8 }}
      />
      <View style={styles.row}>
        <Button
          title="Save"
          onPress={() => onSave({ label: label.trim(), brand: brand.trim() })}
          disabled={!label.trim()}
          style={{ flex: 1 }}
        />
        <Button title="Cancel" variant="secondary" onPress={onCancel} style={{ flex: 1 }} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 48 },
  row: { flexDirection: 'row', gap: 10, marginTop: 10 },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: 12,
    gap: 8,
  },
  iconBtn: { paddingHorizontal: 6, paddingVertical: 4 },
});
