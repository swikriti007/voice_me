import { useCallback, useState } from 'react';

/**
 * State for a ScrollView's RefreshControl: pulling down runs `load` (the same
 * loader the screen uses on open) and keeps the spinner up until it finishes,
 * so new backend data shows without having to log out and back in.
 */
export function usePullToRefresh(load: () => unknown) {
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }, [load]);

  return { refreshing, onRefresh };
}
