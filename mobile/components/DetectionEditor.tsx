// Chips for detected brands: tap to confirm/unconfirm, × to remove, field to add.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import type { DetectionSource } from '@shared/types';
import { LOW_CONFIDENCE, type EditableDetection } from '@/lib/detections';
import { Text } from './Themed';
import { Button, Chip, Field } from './ui';

export function DetectionEditor({
  value,
  onChange,
  addSource = 'text',
}: {
  value: EditableDetection[];
  onChange: (next: EditableDetection[]) => void;
  addSource?: DetectionSource;
}) {
  const [draft, setDraft] = useState('');

  const add = () => {
    const brand = draft.trim();
    if (!brand) return;
    const key = brand.toLowerCase();
    const exists = value.find((d) => d.key === key);
    onChange(
      exists
        ? value.map((d) => (d.key === key ? { ...d, confirmed: true } : d))
        : [...value, { brand, key, confidence: 1, source: addSource, confirmed: true }]
    );
    setDraft('');
  };

  const confirmedCount = value.filter((d) => d.confirmed).length;

  return (
    <View>
      <Text muted style={{ marginBottom: 8 }}>
        Tap a brand to include or exclude it. Highlighted brands will be matched.
        {value.some((d) => d.confidence < LOW_CONFIDENCE)
          ? ' Low-confidence guesses start excluded.'
          : ''}
      </Text>
      <View style={styles.chips} accessibilityLabel={`${confirmedCount} of ${value.length} brands selected`}>
        {value.map((d) => (
          <Chip
            key={d.key}
            label={`${d.brand}${d.confidence < 1 ? ` ${Math.round(d.confidence * 100)}%` : ''}`}
            selected={d.confirmed}
            accessibilityLabel={`${d.brand}${d.product ? `, ${d.product}` : ''}, ${Math.round(
              d.confidence * 100
            )} percent confidence, ${d.confirmed ? 'included' : 'excluded'}`}
            accessibilityHint="Double tap to include or exclude this brand"
            onPress={() =>
              onChange(value.map((x) => (x.key === d.key ? { ...x, confirmed: !x.confirmed } : x)))
            }
            onRemove={() => onChange(value.filter((x) => x.key !== d.key))}
          />
        ))}
        {value.length === 0 ? <Text muted>No brands yet. Add one below.</Text> : null}
      </View>
      <View style={styles.addRow}>
        <Field
          value={draft}
          onChangeText={setDraft}
          placeholder="Add a brand we missed"
          returnKeyType="done"
          onSubmitEditing={add}
          accessibilityLabel="Add a brand"
          style={{ flex: 1 }}
        />
        <Button title="Add" variant="secondary" onPress={add} disabled={!draft.trim()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 12, alignItems: 'center' },
});
