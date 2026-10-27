import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api } from '../api';
import type { DictionaryEntry } from '../types';
import { useToast } from './toast';

interface DictionaryState {
  entries: DictionaryEntry[];
  loaded: boolean;
  find: (form: string) => DictionaryEntry | undefined;
  isPending: (form: string) => boolean;
  /** Adds the word, or removes it if it is already in the dictionary. */
  toggle: (form: string, sentence: string, sentenceRu: string) => void;
  /** Adds every word that isn't in the dictionary yet, with one message at the end. */
  addMany: (words: { form: string; sentence: string; sentenceRu: string }[]) => Promise<void>;
  /** Adds a word typed by hand (English or Russian); resolves to the saved entry, or null if it failed. */
  addTyped: (typed: string) => Promise<DictionaryEntry | null>;
  remove: (entry: DictionaryEntry) => void;
}

const DictionaryContext = createContext<DictionaryState | null>(null);

export function useDictionary() {
  const state = useContext(DictionaryContext);
  if (!state) throw new Error('useDictionary needs a DictionaryProvider');
  return state;
}

const keyOf = (form: string) => form.toLowerCase().replace(/’/g, "'");

export function DictionaryProvider({ children }: { children: ReactNode }) {
  const notify = useToast();
  const [entries, setEntries] = useState<DictionaryEntry[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    api
      .dictionary()
      .then(setEntries)
      .catch((err: Error) => notify({ message: `Словарь не загрузился: ${err.message}`, tone: 'error' }))
      .finally(() => setLoaded(true));
  }, [notify]);

  const find = useCallback(
    (form: string) => {
      const key = keyOf(form);
      return entries.find((e) => keyOf(e.form) === key || keyOf(e.word) === key);
    },
    [entries],
  );

  const setPendingFor = (key: string, on: boolean) =>
    setPending((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const restore = useCallback(
    (entry: DictionaryEntry) => {
      setEntries((prev) => [entry, ...prev.filter((e) => e.id !== entry.id)].sort((a, b) => b.addedAt.localeCompare(a.addedAt)));
      api.restoreWord(entry).catch((err: Error) => notify({ message: err.message, tone: 'error' }));
    },
    [notify],
  );

  const remove = useCallback(
    (entry: DictionaryEntry) => {
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));
      api
        .removeWord(entry.id)
        .then(() => notify({ message: `«${entry.word}» удалено из словаря`, action: { label: 'Вернуть', run: () => restore(entry) } }))
        .catch((err: Error) => {
          setEntries((prev) => [entry, ...prev]);
          notify({ message: err.message, tone: 'error' });
        });
    },
    [notify, restore],
  );

  const toggle = useCallback(
    (form: string, sentence: string, sentenceRu: string) => {
      const key = keyOf(form);
      if (pending.has(key)) return;
      const existing = find(form);
      if (existing) return remove(existing);

      setPendingFor(key, true);
      notify({ message: `Добавляю «${form}» в словарь…`, busy: true });
      api
        .addWord(form, sentence, sentenceRu)
        .then((entry) => {
          setEntries((prev) => [entry, ...prev.filter((e) => keyOf(e.word) !== keyOf(entry.word))]);
          notify({
            message: `«${entry.word}» — ${entry.translation}`,
            action: { label: 'Отменить', run: () => remove(entry) },
          });
        })
        .catch((err: Error) => notify({ message: `Слово не добавлено: ${err.message}`, tone: 'error' }))
        .finally(() => setPendingFor(key, false));
    },
    [find, notify, pending, remove],
  );

  const addMany = useCallback(
    async (words: { form: string; sentence: string; sentenceRu: string }[]) => {
      const fresh = words.filter((w, i) => !find(w.form) && words.findIndex((o) => keyOf(o.form) === keyOf(w.form)) === i);
      if (fresh.length === 0) return;
      fresh.forEach((w) => setPendingFor(keyOf(w.form), true));
      notify({ message: `Добавляю в словарь: ${fresh.map((w) => w.form).join(', ')}…`, busy: true });
      const results = await Promise.allSettled(fresh.map((w) => api.addWord(w.form, w.sentence, w.sentenceRu)));
      fresh.forEach((w) => setPendingFor(keyOf(w.form), false));
      const added = results.flatMap((r) => (r.status === 'fulfilled' ? [r.value] : []));
      setEntries((prev) => [...added, ...prev.filter((e) => !added.some((a) => keyOf(a.word) === keyOf(e.word)))]);
      const failed = results.length - added.length;
      notify(
        failed === 0
          ? { message: `В словарь добавлено: ${added.map((e) => e.word).join(', ')}` }
          : { message: `Добавлено ${added.length} из ${results.length}, остальные не получилось. Попробуй ещё раз.`, tone: 'error' },
      );
    },
    [find, notify],
  );

  const addTyped = useCallback(
    async (typed: string) => {
      const existing = find(typed);
      if (existing) {
        notify({ message: `«${existing.word}» уже есть в словаре` });
        return existing;
      }
      try {
        const entry = await api.addTypedWord(typed);
        setEntries((prev) => [entry, ...prev.filter((e) => keyOf(e.word) !== keyOf(entry.word))]);
        notify({
          message: `«${entry.word}» — ${entry.translation}`,
          action: { label: 'Отменить', run: () => remove(entry) },
        });
        return entry;
      } catch (err) {
        notify({ message: `Слово не добавлено: ${(err as Error).message}`, tone: 'error' });
        return null;
      }
    },
    [find, notify, remove],
  );

  const value = useMemo<DictionaryState>(
    () => ({ entries, loaded, find, isPending: (form) => pending.has(keyOf(form)), toggle, addMany, addTyped, remove }),
    [entries, loaded, find, pending, toggle, addMany, addTyped, remove],
  );

  return <DictionaryContext.Provider value={value}>{children}</DictionaryContext.Provider>;
}
