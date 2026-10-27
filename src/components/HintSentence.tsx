import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api';
import { ANY_WORD, tokenize } from '../lib/text';
import { useDictionary } from '../state/dictionary';
import type { Hint, Sentence } from '../types';
import { Spinner } from './Marks';

interface Props {
  sentence: Sentence;
  hints: Hint[];
  /** While translating, a click on a word shows its English; after the answer the looked-up words just stay marked. */
  interactive: boolean;
  onHint: (hint: Hint) => void;
  id?: string;
  className?: string;
}

type Piece = { text: string; at?: number };

/** What goes into the dictionary for a hint: the words as they stand in the reference, so its example highlights them. */
export function dictionaryForm(hint: Hint, sentence: Sentence) {
  return hint.form && sentence.en.toLowerCase().includes(hint.form.toLowerCase()) ? hint.form : hint.word;
}

/** The Russian sentence to translate. Each space-separated chunk stays on one line, as in ClickableSentence. */
export function HintSentence({ sentence, hints, interactive, onHint, id, className = '' }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const [loading, setLoading] = useState<ReadonlySet<number>>(new Set());
  const [errors, setErrors] = useState<Record<number, string>>({});
  const rootRef = useRef<HTMLParagraphElement>(null);
  // A hint that arrives after the answer was given no longer counts.
  const live = useRef(interactive);
  live.current = interactive;

  const chunks = useMemo(() => {
    let at = 0;
    return sentence.ru.split(/(\s+)/).map((chunk, i): Piece[] | string =>
      i % 2 === 1 ? chunk : tokenize(chunk, ANY_WORD).map((t) => (t.word ? { text: t.text, at: at++ } : { text: t.text })),
    );
  }, [sentence.ru]);

  useEffect(() => {
    if (open === null) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!(event.target as Element).closest?.('.hint-card, .ru-word')) setOpen(null);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      const hadFocus = rootRef.current?.contains(document.activeElement);
      setOpen(null);
      if (hadFocus) rootRef.current?.querySelector<HTMLButtonElement>(`[data-at="${open}"]`)?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  function marked(at: number) {
    return chunks
      .map((chunk) => (typeof chunk === 'string' ? chunk : chunk.map((p) => (p.at === at ? `[${p.text}]` : p.text)).join('')))
      .join('');
  }

  async function lookUp(at: number, ru: string) {
    setOpen(at);
    if (hints.some((h) => h.at === at) || loading.has(at)) return;
    setLoading((prev) => new Set(prev).add(at));
    setErrors(({ [at]: _, ...rest }) => rest);
    try {
      const result = await api.hint(marked(at), [sentence.en, ...sentence.alternatives]);
      if (live.current) onHint({ at, ru, ...result });
    } catch (err) {
      setErrors((prev) => ({ ...prev, [at]: (err as Error).message }));
    } finally {
      setLoading((prev) => {
        const next = new Set(prev);
        next.delete(at);
        return next;
      });
    }
  }

  return (
    <p className={`hint-sentence ${className}`} lang="ru" id={id} ref={rootRef}>
      {chunks.map((chunk, i) =>
        typeof chunk === 'string' ? (
          chunk
        ) : (
          <span key={i} className="hint-sentence__chunk">
            {chunk.map((piece, j) => {
              if (piece.at === undefined) return piece.text;
              const at = piece.at;
              const hint = hints.find((h) => h.at === at);
              if (!interactive) {
                return hint ? (
                  <span key={j} className="ru-word" data-hinted="">
                    {piece.text}
                  </span>
                ) : (
                  piece.text
                );
              }
              const isOpen = open === at;
              return (
                <span key={j} className="hint-sentence__anchor">
                  <button
                    type="button"
                    className="ru-word"
                    data-at={at}
                    data-hinted={hint ? '' : undefined}
                    aria-expanded={isOpen}
                    aria-controls={isOpen ? `hint-${at}` : undefined}
                    onClick={() => (isOpen ? setOpen(null) : void lookUp(at, piece.text))}
                  >
                    {piece.text}
                  </button>
                  {isOpen && (
                    <HintCard
                      id={`hint-${at}`}
                      ru={piece.text}
                      sentence={sentence}
                      hint={hint}
                      loading={loading.has(at)}
                      error={errors[at]}
                      onRetry={() => void lookUp(at, piece.text)}
                    />
                  )}
                </span>
              );
            })}
          </span>
        ),
      )}
    </p>
  );
}

interface CardProps {
  id: string;
  ru: string;
  sentence: Sentence;
  hint: Hint | undefined;
  loading: boolean;
  error: string | undefined;
  onRetry: () => void;
}

const EDGE = 12;

function HintCard({ id, ru, sentence, hint, loading, error, onRetry }: CardProps) {
  const { find, isPending, toggle } = useDictionary();
  const ref = useRef<HTMLSpanElement>(null);
  const [shift, setShift] = useState(0);

  // Opens under the word and slides sideways to stay on screen; measured again once the content arrives.
  useLayoutEffect(() => {
    const place = () => {
      const card = ref.current;
      if (!card) return;
      const anchor = card.parentElement!.getBoundingClientRect().left;
      const width = card.offsetWidth;
      const room = document.documentElement.clientWidth - EDGE;
      setShift(Math.max(EDGE - anchor, Math.min(0, room - (anchor + width))));
    };
    place();
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [hint, loading, error]);

  const form = hint ? dictionaryForm(hint, sentence) : '';
  const saved = form ? find(form) ?? find(hint!.word) : undefined;
  const pending = form ? isPending(form) : false;

  return (
    <span className="hint-card" id={id} role="dialog" aria-label={`Подсказка: ${ru}`} ref={ref} style={{ translate: `${shift}px 0` }}>
      <span className="hint-card__ru">{ru}</span>
      {hint ? (
        <>
          {hint.word && (
            <span className="hint-card__en" lang="en">
              {hint.word}
            </span>
          )}
          {hint.note && <span className="hint-card__note">{hint.note}</span>}
          {form && (
            <button
              type="button"
              className="button button--secondary hint-card__add"
              data-saved={saved ? '' : undefined}
              aria-pressed={Boolean(saved)}
              disabled={pending}
              onClick={() => toggle(form, sentence.en, sentence.ru)}
            >
              {pending ? <Spinner /> : saved && <Check />}
              {saved ? 'В словаре' : 'В словарь'}
            </button>
          )}
        </>
      ) : error ? (
        <>
          <span className="hint-card__error" role="alert">{error}</span>
          <button type="button" className="button button--secondary hint-card__add" onClick={onRetry} disabled={loading}>
            Ещё раз
          </button>
        </>
      ) : (
        <span className="hint-card__status" role="status">
          <Spinner />
          Ищу перевод…
        </span>
      )}
    </span>
  );
}

function Check() {
  return (
    <svg className="icon" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M3.5 8.5l3 3 6-7" />
    </svg>
  );
}
