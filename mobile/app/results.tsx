import { Stack, useRouter } from 'expo-router';
import { FlatList, StyleSheet, View } from 'react-native';

import { Disclaimer } from '@/components/CaseBits';
import { MatchGroup, sortMatches } from '@/components/MatchList';
import { Text, useTheme } from '@/components/Themed';
import { Button, EmptyState } from '@/components/ui';
import { useAppState } from '@/lib/store';

export default function ResultsScreen() {
  const c = useTheme();
  const router = useRouter();
  const { results } = useAppState();
  const matches = results ? sortMatches(results.matches) : [];
  const unmatched = results
    ? results.matches.filter((m) => m.cases.length === 0).map((m) => m.brand.name)
    : [];
  const total = matches.reduce((n, m) => n + m.cases.length, 0);

  return (
    <View style={{ flex: 1, backgroundColor: c.background }}>
      <Stack.Screen options={{ title: results?.title ?? 'Your matches' }} />
      <FlatList
        data={matches}
        keyExtractor={(m) => m.brand.id}
        renderItem={({ item }) => <MatchGroup match={item} />}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          results && matches.length ? (
            <Text muted style={{ marginBottom: 12 }} accessibilityLiveRegion="polite">
              {total} {total === 1 ? 'lawsuit names' : 'lawsuits name'} {matches.length}{' '}
              {matches.length === 1 ? 'brand' : 'brands'} you have. Open one to see if you qualify.
            </Text>
          ) : null
        }
        ListEmptyComponent={
          <View>
            <EmptyState
              title={results ? 'No lawsuits matched' : 'Nothing to show yet'}
              body={
                results
                  ? 'We didn’t find lawsuits naming these brands. Follow a brand to hear when one is filed.'
                  : 'Scan a photo, describe what you own, or check My Items.'
              }
            />
            <Button
              title="Follow a brand"
              variant="secondary"
              onPress={() => router.push('/watchlist')}
            />
          </View>
        }
        ListFooterComponent={
          <View>
            {unmatched.length ? (
              <Text muted style={{ marginTop: 8 }}>
                No lawsuits found for: {unmatched.join(', ')}
              </Text>
            ) : null}
            <Disclaimer />
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
});
