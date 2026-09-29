// Shared "detections -> /api/match -> Results screen" flow.
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';

import type { BrandDetection } from '@shared/types';
import { matchBrands, messageFor } from './api';
import { useAppState } from './store';

export function useMatchAndShow() {
  const router = useRouter();
  const { setResults } = useAppState();
  const [matching, setMatching] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);

  const run = useCallback(
    async (detections: BrandDetection[], title: string) => {
      setMatching(true);
      setMatchError(null);
      try {
        const { matches } = await matchBrands({ detections });
        setResults({ title, matches });
        router.push('/results');
      } catch (e) {
        setMatchError(messageFor(e, 'Matching'));
      } finally {
        setMatching(false);
      }
    },
    [router, setResults]
  );

  return { run, matching, matchError, setMatchError };
}
