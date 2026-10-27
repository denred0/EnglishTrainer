import { useMemo, useRef, useState, type FormEvent } from 'react';
import { useDictionary } from '../state/dictionary';
import { useSaved } from '../state/saved';
import type { DictionaryEntry, SavedSentence } from '../types';
import { ClickableSentence } from './ClickableSentence';
import { GrammarTags, Loading, SearchIcon, Spinner, TrashIcon } from './Marks';

const dateFormat = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const formatDate = (iso: string) => dateFormat.format(new Date(iso)).replace('.', '');

export type DictionaryTab = 'words' | 'sentences';

export function DictionaryPage({ tab }: { tab: DictionaryTab }) {
  const { entries: words } = useDictionary();
  const { entries: sentences } = useSaved();
  const [query, setQuery] = useState('');
  const [shownTab, setShownTab] = useState(tab);
  if (shownTab !== tab) {
    setShownTab(tab);
    setQuery('');
  }
  const listLength = tab === 'words' ? words.length : sentences.length;

  return (
    <section className="dictionary" aria-labelledby="dictionary-title">
      <header className="dictionary__head">
        <h1 className="dictionary__title" id="dictionary-title">Словарь</h1>
        {listLength > 0 && (
          <div className="search">
            <SearchIcon />
            <label className="visually-hidden" htmlFor="dictionary-search">Поиск</label>
            <input
              id="dictionary-search"
              className="search__input"
              type="search"
              placeholder={tab === 'words' ? 'Найти слово' : 'Найти предложение'}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        )}
      </header>

      <nav className="tabs" aria-label="Что показать">
        <a className="tabs__link" href="#/dictionary" aria-current={tab === 'words' ? 'page' : undefined}>
          Слова <span className="tabs__count">{words.length}</span>
        </a>
        <a className="tabs__link" href="#/dictionary/sentences" aria-current={tab === 'sentences' ? 'page' : undefined}>
          Предложения <span className="tabs__count">{sentences.length}</span>
        </a>
      </nav>

      {tab === 'words' ? (
        <WordsTab query={query} onAdded={() => setQuery('')} />
      ) : (
        <SentencesTab query={query} />
      )}
    </section>
  );
}

/* ——— Words ——— */

function WordsTab({ query, onAdded }: { query: string; onAdded: () => void }) {
  const { entries, loaded, remove } = useDictionary();
  const [freshId, setFreshId] = useState<string | null>(null);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => [e.word, e.form, e.translation].some((field) => field.toLowerCase().includes(q)));
  }, [entries, query]);

  return (
    <>
      <AddWordForm
        onAdded={(entry) => {
          onAdded();
          setFreshId(entry.id);
        }}
      />

      {!loaded && <Loading>Загружаю словарь…</Loading>}

      {loaded && entries.length === 0 && (
        <div className="empty">
          <p className="empty__title">Здесь пока пусто</p>
          <p className="empty__text">
            Добавь первое слово выше или нажимай на слова в правильных ответах во время занятия.
          </p>
          <a className="button button--secondary" href="#/practice">Начать занятие</a>
        </div>
      )}

      {entries.length > 0 && visible.length === 0 && (
        <p className="dictionary__nothing">Ничего не нашлось по запросу «{query.trim()}».</p>
      )}

      <ul className="vocab">
        {visible.map((entry) => (
          <VocabRow key={entry.id} entry={entry} fresh={entry.id === freshId} onRemove={() => remove(entry)} />
        ))}
      </ul>
    </>
  );
}

function AddWordForm({ onAdded }: { onAdded: (entry: DictionaryEntry) => void }) {
  const { addTyped } = useDictionary();
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    const typed = value.trim().replace(/\s+/g, ' ');
    if (!typed || busy) return;
    setBusy(true);
    const entry = await addTyped(typed);
    setBusy(false);
    if (entry) {
      setValue('');
      onAdded(entry);
    }
    inputRef.current?.focus();
  }

  return (
    <form className="add-word" onSubmit={submit}>
      <label className="add-word__label" htmlFor="add-word">Новое слово</label>
      <div className="add-word__row">
        <input
          ref={inputRef}
          id="add-word"
          className="add-word__input"
          placeholder="Например, sunrise"
          aria-describedby="add-word-hint"
          maxLength={80}
          autoComplete="off"
          spellCheck={false}
          value={value}
          readOnly={busy}
          onChange={(e) => setValue(e.target.value)}
        />
        <button type="submit" className="button button--primary" disabled={!value.trim() || busy} aria-busy={busy || undefined}>
          {busy ? (
            <>
              <Spinner />
              Добавляю…
            </>
          ) : (
            'Добавить'
          )}
        </button>
      </div>
      <p className="add-word__hint" id="add-word-hint">
        Можно по-английски или по-русски. Перевод, транскрипция и пример появятся сами.
      </p>
    </form>
  );
}

function VocabRow({ entry, fresh, onRemove }: { entry: DictionaryEntry; fresh: boolean; onRemove: () => void }) {
  return (
    <li className={`vocab__row${fresh ? ' vocab__row--fresh' : ''}`}>
      <time className="vocab__date" dateTime={entry.addedAt}>
        {formatDate(entry.addedAt)}
      </time>
      <div className="vocab__main">
        <p className="vocab__word" lang="en">{entry.word}</p>
        <p className="vocab__meta">
          {entry.transcription && <span lang="en">{entry.transcription}</span>}
          {entry.partOfSpeech && <span className="vocab__pos">{entry.partOfSpeech}</span>}
        </p>
      </div>
      <p className="vocab__translation">{entry.translation}</p>
      <button type="button" className="icon-button vocab__remove" aria-label={`Удалить «${entry.word}»`} onClick={onRemove}>
        <TrashIcon />
      </button>
      <div className="vocab__example">
        <p lang="en">
          <Highlight sentence={entry.example} form={entry.form} />
        </p>
        {entry.exampleRu && <p className="vocab__example-ru" lang="ru">{entry.exampleRu}</p>}
      </div>
    </li>
  );
}

function Highlight({ sentence, form }: { sentence: string; form: string }) {
  const escaped = form.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = sentence.split(new RegExp(`\\b(${escaped})\\b`, 'i'));
  return (
    <>
      {parts.map((part, i) => (i % 2 === 1 ? <mark key={i}>{part}</mark> : part))}
    </>
  );
}

/* ——— Saved sentences ——— */

function SentencesTab({ query }: { query: string }) {
  const { entries, loaded, remove } = useSaved();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries;
    return entries.filter((e) => [e.ru, e.en, ...e.alternatives].some((field) => field.toLowerCase().includes(q)));
  }, [entries, query]);

  return (
    <>
      {!loaded && <Loading>Загружаю сохранённые предложения…</Loading>}

      {loaded && entries.length === 0 && (
        <div className="empty">
          <p className="empty__title">Здесь пока пусто</p>
          <p className="empty__text">
            Во время занятия нажми «Сохранить» под предложением, и его можно будет потренировать ещё раз.
          </p>
          <a className="button button--primary" href="#/practice">Начать занятие</a>
        </div>
      )}

      {entries.length > 0 && visible.length === 0 && (
        <p className="dictionary__nothing">Ничего не нашлось по запросу «{query.trim()}».</p>
      )}

      <ul className="saved-list">
        {visible.map((entry) => (
          <SavedRow key={entry.id} entry={entry} onRemove={() => remove(entry)} />
        ))}
      </ul>
    </>
  );
}

function SavedRow({ entry, onRemove }: { entry: SavedSentence; onRemove: () => void }) {
  return (
    <li className="saved-row">
      <div className="saved-row__margin">
        <span className="level-tag" title="Уровень предложения">{entry.level}</span>
        <time className="saved-row__date" dateTime={entry.addedAt}>{formatDate(entry.addedAt)}</time>
      </div>
      <div className="saved-row__body">
        <p className="saved-row__ru" lang="ru">{entry.ru}</p>
        <GrammarTags grammar={entry.grammar} />
        <ClickableSentence sentence={entry.en} sentenceRu={entry.ru} className="saved-row__en" />
      </div>
      <button type="button" className="icon-button saved-row__remove" aria-label="Удалить из сохранённых" onClick={onRemove}>
        <TrashIcon />
      </button>
    </li>
  );
}
