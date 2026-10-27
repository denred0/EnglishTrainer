import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { LessonRecord } from '../types';

interface HistoryState {
  /** Newest first; null until loaded. */
  records: LessonRecord[] | null;
  error: string | null;
  /** Adds or replaces (same session) a record the server just stored. */
  put: (record: LessonRecord) => void;
  /** Deletes every lesson on the server: back to the first class. */
  reset: () => Promise<void>;
}

const HistoryContext = createContext<HistoryState | null>(null);

export function useHistory() {
  const state = useContext(HistoryContext);
  if (!state) throw new Error('useHistory needs a HistoryProvider');
  return state;
}

/** Finished lessons, shared by the start screen, the results screen and the history page. */
export function HistoryProvider({ children }: { children: ReactNode }) {
  const [records, setRecords] = useState<LessonRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .history()
      .then(setRecords)
      .catch((err: Error) => {
        setError(err.message);
        setRecords([]);
      });
  }, []);

  const put = useCallback(
    (record: LessonRecord) =>
      setRecords((prev) => [record, ...(prev ?? []).filter((r) => r.sessionId !== record.sessionId)]),
    [],
  );

  const reset = useCallback(async () => {
    await api.resetHistory();
    setRecords([]);
    setError(null);
  }, []);

  const value = useMemo(() => ({ records, error, put, reset }), [records, error, put, reset]);
  return <HistoryContext.Provider value={value}>{children}</HistoryContext.Provider>;
}
