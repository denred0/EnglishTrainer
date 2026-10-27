import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { api } from '../api';
import { attemptPoints, sentencePoints } from '../lib/progress';
import { matchesAny, plural } from '../lib/text';
import type { Attempt, Hint, Sentence } from '../types';
import { Feedback } from './Feedback';
import { HintSentence } from './HintSentence';
import { GrammarTags, Mark, Spinner } from './Marks';
import { SaveButton } from './SaveButton';

interface Props {
  sentence: Sentence;
  attempt: Attempt | undefined;
  /** Words looked up so far; once answered, the ones stored with the attempt. */
  hints: Hint[];
  /** Reasoning effort for the check, from the settings page. */
  effort: string | null;
  isLast: boolean;
  onAnswer: (attempt: Attempt) => void;
  onHint: (hint: Hint) => void;
  onNext: () => void;
}

const pointsWord = (n: number) => plural(n, ['очко', 'очка', 'очков']);

export function Exercise({ sentence, attempt, hints, effort, isLast, onAnswer, onHint, onNext }: Props) {
  const [draft, setDraft] = useState('');
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    (attempt ? nextRef : inputRef).current?.focus({ preventScroll: true });
  }, [attempt]);

  async function check(event?: FormEvent) {
    event?.preventDefault();
    const answer = draft.trim().replace(/\s+/g, ' ');
    if (!answer || checking) return;

    const references = [sentence.en, ...sentence.alternatives];
    if (matchesAny(answer, references)) {
      onAnswer({ answer, exact: true, result: { verdict: 'correct', corrected: answer, notes: [] } });
      return;
    }

    setChecking(true);
    setError(null);
    try {
      const result = await api.check(sentence.ru, references, answer, effort);
      onAnswer({ answer, exact: false, result });
    } catch (err) {
      setError(`Не удалось проверить: ${(err as Error).message}`);
    } finally {
      setChecking(false);
    }
  }

  function giveUp() {
    onAnswer({ answer: '', exact: false, result: { verdict: 'wrong', corrected: '', notes: [] } });
  }

  const hinted = hints.length > 0;
  const maxPoints = sentencePoints(sentence.level, 'correct', hinted);

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void check();
    }
  }

  return (
    <article className="exercise">
      <div className="exercise__margin">
        <span className="level-tag" title="Уровень предложения">{sentence.level}</span>
        {attempt && <Mark verdict={attempt.result.verdict} />}
        {hinted && <span className="margin-note">подсказка</span>}
      </div>

      <div className="exercise__body">
        <HintSentence id="prompt" className="prompt" sentence={sentence} hints={hints} interactive={!attempt} onHint={onHint} />
        <GrammarTags grammar={sentence.grammar} />

        {!attempt ? (
          <form className="answer-form" onSubmit={check}>
            <label className="visually-hidden" htmlFor="answer">Перевод на английский</label>
            <textarea
              ref={inputRef}
              id="answer"
              className="answer-input"
              lang="en"
              rows={1}
              placeholder="Переведи на английский"
              aria-describedby="prompt points-note"
              spellCheck={false}
              autoCorrect="off"
              autoComplete="off"
              autoCapitalize="sentences"
              value={draft}
              readOnly={checking}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
            />
            <p className="answer-form__note" id="points-note">
              <strong className="answer-form__points">
                {maxPoints} {pointsWord(maxPoints)}
              </strong>{' '}
              {hinted
                ? 'за верный перевод: с подсказкой половина.'
                : 'за верный перевод. Забыл слово — нажми на него в предложении, но очков станет вдвое меньше.'}
            </p>
            {error && <p className="form-error" role="alert">{error}</p>}
            <div className="exercise__actions">
              <SaveButton sentence={sentence} />
              <button type="button" className="button button--quiet" onClick={giveUp} disabled={checking}>
                Не знаю
              </button>
              <button
                type="submit"
                className="button button--primary"
                disabled={!draft.trim() || checking}
                aria-busy={checking || undefined}
              >
                {checking ? (
                  <>
                    <Spinner />
                    Проверяю…
                  </>
                ) : (
                  <>
                    Проверить
                    <kbd>Enter</kbd>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <>
            <Feedback sentence={sentence} attempt={attempt} points={attemptPoints(sentence, attempt)} verdictId="verdict" showHint />
            <div className="exercise__actions">
              <SaveButton sentence={sentence} />
              <button ref={nextRef} type="button" className="button button--primary" aria-describedby="verdict" onClick={onNext}>
                {isLast ? 'Посмотреть итог' : 'Дальше'}
                <kbd>Enter</kbd>
              </button>
            </div>
          </>
        )}
      </div>
    </article>
  );
}
