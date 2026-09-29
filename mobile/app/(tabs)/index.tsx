import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,

  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { CASE_STATUSES, type CaseStatus, type CaseSummary } from '@shared/types';
import { CaseCard, Disclaimer } from '@/components/CaseBits';
import { Text, useTheme } from '@/components/Themed';
import {
  Button,
  Card,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  LoadingState,
  Notice,
  SectionTitle,
} from '@/components/ui';
import { detectText, messageFor, searchCases } from '@/lib/api';
import { STATUS_INFO } from '@/lib/status';
import { useMatchAndShow } from '@/lib/useMatch';

const PAGE_SIZE = 20;

export default function HomeScreen() {
  const c = useTheme();

  // Index (infinite scroll)
  const [draftQ, setDraftQ] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<CaseStatus | undefined>();
  const [cases, setCases] = useState<CaseSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(
    async (nextPage: number, mode: 'initial' | 'more' | 'refresh') => {
      const id = ++requestId.current;
      if (mode === 'initial') setLoading(true);
      if (mode === 'more') setLoadingMore(true);
      if (mode === 'refresh') setRefreshing(true);
      setError(null);
      try {
        const res = await searchCases({ q: q || undefined, status, page: nextPage, pageSize: PAGE_SIZE });
        if (id !== requestId.current) return;
        setCases((prev) => (nextPage === 1 ? res.cases : [...prev, ...res.cases]));
        setTotal(res.total);
        setPage(nextPage);
      } catch (e) {
        if (id === requestId.current) setError(messageFor(e, 'Search'));
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setLoadingMore(false);
          setRefreshing(false);
        }
      }
    },
    [q, status]
  );

  useEffect(() => {
    load(1, 'initial');
  }, [load]);

  // Claims open now
  const [openCases, setOpenCases] = useState<CaseSummary[] | null>(null);
  const [openError, setOpenError] = useState<string | null>(null);
  const loadOpen = useCallback(async () => {
    setOpenError(null);
    try {
      const res = await searchCases({ status: 'claims_open', pageSize: 10 });
      setOpenCases(res.cases);
    } catch (e) {
      setOpenError(messageFor(e, 'Search'));
      setOpenCases([]);
    }
  }, []);
  useEffect(() => {
    loadOpen();
  }, [loadOpen]);

  // "What do you own?"
  const [owned, setOwned] = useState('');
  const [detecting, setDetecting] = useState(false);
  const [ownError, setOwnError] = useState<string | null>(null);
  const { run, matching, matchError } = useMatchAndShow();

  const onFindForMe = async () => {
    if (!owned.trim()) return;
    setDetecting(true);
    setOwnError(null);
    try {
      const { detections } = await detectText(owned.trim());
      if (detections.length === 0) {
        setOwnError("We didn't recognize any brands. Try naming them, e.g. “Crest, Coke, Peloton”.");
        return;
      }
      await run(detections, 'From what you own');
    } catch (e) {
      setOwnError(messageFor(e, 'Brand detection'));
    } finally {
      setDetecting(false);
    }
  };

  const hasMore = cases.length < total;
  const onEndReached = () => {
    if (!loading && !loadingMore && !error && hasMore) load(page + 1, 'more');
  };

  const header = (
    <View>
      <View style={styles.searchRow}>
        <Field
          value={draftQ}
          onChangeText={setDraftQ}
          placeholder="Search lawsuits, companies, products"
          returnKeyType="search"
          onSubmitEditing={() => setQ(draftQ.trim())}
          clearButtonMode="while-editing"
          autoCorrect={false}
          accessibilityLabel="Search lawsuits"
          accessibilityHint="Type a company or product and press search"
          style={{ flex: 1 }}
        />
      </View>

      <Card style={{ marginTop: 16 }}>
        <Text accessibilityRole="header" style={styles.cardTitle}>
          What do you own?
        </Text>
        <Text muted style={{ marginBottom: 10 }}>
          Describe the products and services you use. We&apos;ll find lawsuits that name them.
        </Text>
        <Field
          value={owned}
          onChangeText={setOwned}
          multiline
          placeholder="I use Crest toothpaste, drink Coke, and have a Peloton…"
          accessibilityLabel="What do you own? Describe products and services you use"
        />
        {ownError || matchError ? (
          <View style={{ marginTop: 10 }}>
            <Notice tone="danger">{ownError || matchError}</Notice>
          </View>
        ) : null}
        <Button
          title="Find lawsuits for me"
          onPress={onFindForMe}
          loading={detecting || matching}
          disabled={!owned.trim()}
          style={{ marginTop: 12 }}
        />
      </Card>

      <SectionTitle>Claims open now</SectionTitle>
      {openCases === null ? (
        <LoadingState label="Loading open claims…" />
      ) : openError ? (
        <ErrorState message={openError} onRetry={loadOpen} />
      ) : openCases.length === 0 ? (
        <Text muted>No open claim forms right now.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          accessibilityLabel="Lawsuits with claim forms open now">
          {openCases.map((item) => (
            <CaseCard key={item.id} item={item} compact />
          ))}
        </ScrollView>
      )}

      <SectionTitle>All lawsuits</SectionTitle>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filters}
        accessibilityLabel="Filter by case status">
        <Chip label="All" selected={!status} onPress={() => setStatus(undefined)} />
        {CASE_STATUSES.map((s) => (
          <Chip
            key={s}
            label={STATUS_INFO[s].label}
            selected={status === s}
            onPress={() => setStatus(status === s ? undefined : s)}
            accessibilityHint={`Show only ${STATUS_INFO[s].label.toLowerCase()} lawsuits`}
          />
        ))}
      </ScrollView>
      {!loading && !error ? (
        <Text muted style={{ marginBottom: 8 }} accessibilityLiveRegion="polite">
          {total.toLocaleString()} {total === 1 ? 'lawsuit' : 'lawsuits'}
          {q ? ` for “${q}”` : ''}
        </Text>
      ) : null}
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: c.background }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <FlatList
        data={loading || error ? [] : cases}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => <CaseCard item={item} />}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <LoadingState label="Loading lawsuits…" />
          ) : error ? (
            <ErrorState message={error} onRetry={() => load(1, 'initial')} />
          ) : (
            <EmptyState
              title="No lawsuits found"
              body="Try a different search or status filter."
            />
          )
        }
        ListFooterComponent={
          loadingMore ? (
            <ActivityIndicator style={{ margin: 16 }} color={c.tint} />
          ) : !loading && !error && cases.length > 0 && !hasMore ? (
            <Disclaimer />
          ) : null
        }
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              load(1, 'refresh');
              loadOpen();
            }}
            tintColor={c.tint}
          />
        }
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        contentContainerStyle={styles.content}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  searchRow: { flexDirection: 'row', gap: 8 },
  cardTitle: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
  filters: { gap: 8, paddingBottom: 12 },
});

