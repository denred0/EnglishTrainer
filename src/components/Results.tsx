import { useEffect, useRef } from 'react';
import { lessonStats } from '../lib/lesson';
import { answerPoints, lessonAnswers, lessonPoints, PASSING_GRADE } from '../lib/progress';
import { plural } from '../lib/text';
import { useDictionary } from '../state/dictionary';
import { useSaved } from '../state/saved';
import type { Attempt, Hint, Sentence } from '../types';
import { Feedback } from './Feedback';
import { dictionaryForm } from './HintSentence';
import { LessonReward } from './Journal';
import { GrammarTags, Spinner } from './Marks';
import { SaveButton } from './SaveButton';

const COMMENTS: Record<number, string> = {
  5: 'Отлично!',
  4: 'Хорошо!',
  3: 'Можно лучше',
  2: 'Повтори и попробуй ещё',
};

interface Props {
  sessionId: string;
  dailyGoal: number;
  sentences: Sentence[];
  /** Fewer than sentences when the lesson was finished early; the grade covers only these. */
  attempts: Attempt[];
  repeatCount: number;
  /** New sentences for the next lesson are being generated. */
  loading: boolean;
  error: string | null;
  onRepeat: () => void;
  onChangeSettings: () => void;
}

export function Results({ sessionId, dailyGoal, sentences, attempts, repeatCount, loading, error, onRepeat, onChangeSettings }: Props) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { find, saveAll } = useSaved();
  const { correct, almost, wrong, grade } = lessonStats(attempts);
  const mistakes = attempts.map((attempt, i) => ({ attempt, sentence: sentences[i], n: i + 1 })).filter((m) => m.attempt.result.verdict !== 'correct');
  const hinted = attempts.filter((a) => a.hints?.length).length;

  useEffect(() => {
    headingRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <section className="results" aria-labelledby="results-title">
      <div className="results__head">
        <div className="grade" data-grade={grade}>
          <span className="grade__digit">{grade}</span>
          <svg className="grade__stroke" viewBox="0 0 160 24" aria-hidden="true">
            <path d="M6 15c30-6 70-9 104-7 15 1 28 3 44 6" pathLength={1} />
          </svg>
        </div>
        <div className="results__summary">
          <h2 className="results__title" id="results-title" tabIndex={-1} ref={headingRef}>
            <span className="visually-hidden">Оценка {grade}. </span>
            {COMMENTS[grade]}
          </h2>
          <p className="results__line">
            {correct} из {attempts.length} без ошибок
          </p>
          {(almost > 0 || wrong > 0) && (
            <p className="results__line results__line--secondary">
              {[
                almost > 0 && `${almost} почти верно`,
                wrong > 0 && `${wrong} ${plural(wrong, ['с ошибкой', 'с ошибками', 'с ошибками'])}`,
              ]
                .filter(Boolean)
                .join(', ')}
            </p>
          )}
          {hinted > 0 && (
            <p className="results__line results__line--secondary">
              {hinted} {plural(hinted, ['предложение', 'предложения', 'предложений'])} с подсказкой, за{' '}
              {hinted === 1 ? 'него' : 'них'} половина очков
            </p>
          )}
          {attempts.length < sentences.length && (
            <p className="results__line results__line--secondary">
              Урок закончен досрочно: пройдено {attempts.length} из {sentences.length}
            </p>
          )}
          <LessonReward
            sessionId={sessionId}
            points={lessonPoints(sentences, attempts, grade)}
            forfeited={grade < PASSING_GRADE ? answerPoints(sentences, attempts) : 0}
            answers={lessonAnswers(sentences, attempts)}
            answered={attempts.length}
            goal={dailyGoal}
          />
          <div className="results__actions">
            <button
              type="button"
              className="button button--primary"
              onClick={onRepeat}
              disabled={loading}
              aria-busy={loading || undefined}
            >
              {loading ? (
                <>
                  <Spinner />
                  Готовлю предложения…
                </>
              ) : (
                `Ещё ${repeatCount} ${plural(repeatCount, ['предложение', 'предложения', 'предложений'])}`
              )}
            </button>
            <button type="button" className="button button--secondary" onClick={onChangeSettings} disabled={loading}>
              Изменить настройки
            </button>
          </div>
          {error && <p className="form-error" role="alert">{error}</p>}
        </div>
      </div>

      <PeekedWords sentences={sentences} attempts={attempts} />

      {mistakes.length > 0 && (
        <div className="mistakes">
          <div className="mistakes__head">
            <h3 className="mistakes__title">Работа над ошибками</h3>
            {mistakes.some((m) => !find(m.sentence.ru)) && (
              <button type="button" className="button button--secondary" onClick={() => saveAll(mistakes.map((m) => m.sentence))}>
                Сохранить все предложения
              </button>
            )}
          </div>
          <ol className="mistakes__list">
            {mistakes.map(({ attempt, sentence, n }) => (
              <li key={n} className="mistake">
                <span className="mistake__number">{n}</span>
                <div className="mistake__body">
                  <p className="mistake__prompt" lang="ru">{sentence.ru}</p>
                  <GrammarTags grammar={sentence.grammar} />
                  <Feedback sentence={sentence} attempt={attempt} />
                  <SaveButton sentence={sentence} />
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}

/** Words looked up during the lesson, to put into the dictionary in one go. */
function PeekedWords({ sentences, attempts }: { sentences: Sentence[]; attempts: Attempt[] }) {
  const { find, isPending, toggle, addMany } = useDictionary();
  const seen = new Set<string>();
  const words: { hint: Hint; sentence: Sentence; form: string }[] = [];
  attempts.forEach((attempt, i) => {
    for (const hint of attempt.hints ?? []) {
      const key = hint.word.toLowerCase();
      if (!hint.word || seen.has(key)) continue;
      seen.add(key);
      words.push({ hint, sentence: sentences[i], form: dictionaryForm(hint, sentences[i]) });
    }
  });
  if (words.length === 0) return null;

  const isSaved = (w: (typeof words)[number]) => Boolean(find(w.form) ?? find(w.hint.word));
  const missing = words.filter((w) => !isSaved(w));

  return (
    <div className="peeked">
      <div className="mistakes__head">
        <h3 className="mistakes__title">Подсмотренные слова</h3>
        {missing.length > 0 && (
          <button
            type="button"
            className="button button--secondary"
            onClick={() => void addMany(missing.map((w) => ({ form: w.form, sentence: w.sentence.en, sentenceRu: w.sentence.ru })))}
          >
            {missing.length === words.length ? 'Добавить все в словарь' : 'Добавить остальные в словарь'}
          </button>
        )}
      </div>
      <ul className="peeked__list">
        {words.map((w) => {
          const saved = isSaved(w);
          const pending = isPending(w.form);
          return (
            <li key={w.hint.word} className="peeked__item">
              <span className="peeked__ru" lang="ru">{w.hint.ru}</span>
              <span className="peeked__arrow" aria-hidden="true">→</span>
              <button
                type="button"
                className="word peeked__en"
                lang="en"
                data-state={pending ? 'pending' : saved ? 'saved' : undefined}
                aria-pressed={saved}
                title={saved ? 'Нажми, чтобы убрать из словаря' : 'Добавить в словарь'}
                onClick={() => toggle(w.form, w.sentence.en, w.sentence.ru)}
              >
                {w.hint.word}
              </button>
            </li>
          );
        })}
      </ul>
      <p className="feedback__hint">Нажми на английское слово, чтобы добавить его в словарь или убрать оттуда.</p>
    </div>
  );
}
