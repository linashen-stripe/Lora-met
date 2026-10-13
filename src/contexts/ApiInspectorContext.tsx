'use client';

import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useConfigContext } from '@/contexts/ConfigContext';
import {
  API_INSPECTOR_EVENT,
  API_INSPECTOR_MAX_ENTRIES,
  type ApiTraceEntry,
  getApiInspectorSessionId,
} from '@/utils/apiInspector';

interface ApiInspectorContextValue {
  entries: ApiTraceEntry[];
  isOpen: boolean;
  isPaused: boolean;
  setIsOpen: (open: boolean) => void;
  setIsPaused: (paused: boolean) => void;
  clear: () => void;
}

const ApiInspectorContext = createContext<ApiInspectorContextValue | null>(null);

export function ApiInspectorProvider({
  children,
}: PropsWithChildren<unknown>) {
  const { settings } = useConfigContext();
  const enabled = Boolean(settings?.apiInspectorEnabled);
  const [entries, setEntries] = useState<ApiTraceEntry[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isPaused, setIsPaused] = useState(false);

  const addEntry = useCallback(
    (entry: ApiTraceEntry) => {
      if (isPaused) return;
      setEntries((current) => {
        const existingIndex = current.findIndex((item) => item.id === entry.id);
        const next =
          existingIndex >= 0
            ? current.map((item, index) =>
                index === existingIndex ? { ...item, ...entry } : item,
              )
            : [...current, entry];
        return next.slice(-API_INSPECTOR_MAX_ENTRIES);
      });
    },
    [isPaused],
  );

  useEffect(() => {
    if (!enabled) {
      setIsOpen(false);
      setEntries([]);
      return;
    }
    const onClientTrace = (event: Event) => {
      addEntry((event as CustomEvent<ApiTraceEntry>).detail);
    };
    window.addEventListener(API_INSPECTOR_EVENT, onClientTrace);

    const sessionId = getApiInspectorSessionId();
    const source = sessionId
      ? new EventSource(
          `/api/debug/traces?session=${encodeURIComponent(sessionId)}`,
        )
      : null;
    if (source) {
      source.onmessage = (event) => {
        try {
          addEntry(JSON.parse(event.data) as ApiTraceEntry);
        } catch {
          // Ignore malformed diagnostic messages without affecting the app.
        }
      };
    }
    return () => {
      window.removeEventListener(API_INSPECTOR_EVENT, onClientTrace);
      source?.close();
    };
  }, [addEntry, enabled]);

  const value = useMemo(
    () => ({
      entries,
      isOpen,
      isPaused,
      setIsOpen,
      setIsPaused,
      clear: () => setEntries([]),
    }),
    [entries, isOpen, isPaused],
  );

  return (
    <ApiInspectorContext.Provider value={value}>
      {children}
    </ApiInspectorContext.Provider>
  );
}

export function useApiInspector(): ApiInspectorContextValue {
  const context = useContext(ApiInspectorContext);
  if (!context) {
    throw new Error('useApiInspector must be used inside ApiInspectorProvider');
  }
  return context;
}
