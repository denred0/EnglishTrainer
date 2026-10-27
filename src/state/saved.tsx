import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import { plural } from '../lib/text';
import type { SavedSentence, Sentence } from '../types';
import { useToast } from './toast';

interface SavedState {
  entries: SavedSentence[];
  loaded: boolean;
  find: (ru: string) => SavedSentence | undefined;
  /** Saves the sentence, or removes it if it is already saved. */
  toggle: (sentence: Sentence) => void;
  saveAll: (sentences: Sentence[]) => void;
  remove: (entry: SavedSentence) => void;
}

const SavedContext = createContext<SavedState | null>(null);

export function useSaved() {
  const state = useContext(SavedContext);
  if (!state) throw new Error('useSaved needs a SavedProvider');
  return state;
}

const byNewest = (a: SavedSentence, b: SavedSentence) => b.addedAt.localeCompare(a.addedAt);

export function SavedProvider({ children }: { children: ReactNode }) {
  const notify = useToast();
  const [entries, setEntries] = useState<SavedSentence[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    api
      .saved()
      .then(setEntries)
      .catch((err: Error) => notify({ message: `Сохранённые предложения не загрузились: ${err.message}`, tone: 'error' }))
      .finally(() => setLoaded(true));
  }, [notify]);

  const find = useCallback((ru: string) => entries.find((e) => e.ru === ru.trim()), [entries]);

  const put = (added: SavedSentence[]) =>
    setEntries((prev) => [...added, ...prev.filter((e) => !added.some((a) => a.ru === e.ru))].sort(byNewest));

  const restore = useCallback(
    (entry: SavedSentence) => {
      put([entry]);
      api.restoreSaved(entry).catch((err: Error) => notify({ message: err.message, tone: 'error' }));
    },
    [notify],
  );

  const remove = useCallback(
    (entry: SavedSentence) => {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      api
        .removeSaved(entry.id)
        .then(() => notify({ message: 'Предложение удалено из сохранённых', action: { label: 'Вернуть', run: () => restore(entry) } }))
        .catch((err: Error) => {
          put([entry]);
          notify({ message: err.message, tone: 'error' });
        });
    },
    [notify, restore],
  );

  const toggle = useCallback(
    (sentence: Sentence) => {
      const existing = find(sentence.ru);
      if (existing) return remove(existing);
      api
        .saveSentence(sentence)
        .then((entry) => {
          put([entry]);
          notify({ message: 'Предложение сохранено', action: { label: 'Отменить', run: () => remove(entry) } });
        })
        .catch((err: Error) => notify({ message: `Не сохранилось: ${err.message}`, tone: 'error' }));
    },
    [find, notify, remove],
  );

  const saveAll = useCallback(
    (sentences: Sentence[]) => {
      const fresh = sentences.filter((s) => !find(s.ru));
      if (fresh.length === 0) return;
      Promise.all(fresh.map((s) => api.saveSentence(s)))
        .then((added) => {
          put(added);
          notify({
            message: `Сохранено ${added.length} ${plural(added.length, ['предложение', 'предложения', 'предложений'])}`,
          });
        })
        .catch((err: Error) => notify({ message: `Не сохранилось: ${err.message}`, tone: 'error' }));
    },
    [find, notify],
  );

  const value = useMemo<SavedState>(
    () => ({ entries, loaded, find, toggle, saveAll, remove }),
    [entries, loaded, find, toggle, saveAll, remove],
  );

  return <SavedContext.Provider value={value}>{children}</SavedContext.Provider>;
}
