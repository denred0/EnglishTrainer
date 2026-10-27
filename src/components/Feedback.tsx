import { diffWords, plural } from '../lib/text';
import type { Attempt, Sentence } from '../types';
import { ClickableSentence } from './ClickableSentence';

const VERDICT_TEXT = {
  correct: 'Верно!',
  almost: 'Почти верно',
  wrong: 'Есть ошибка',
} as const;

/** The checker is asked for plain text, but sometimes marks words with Markdown (*luggage*): show them in quotes. */
function plainNote(text: string) {
  return text.replace(/«?\*{1,2}([^*\n]+)\*{1,2}»?/g, '«$1»');
}

interface Props {
  sentence: Sentence;
  attempt: Attempt;
  /** Points the answer earned, shown next to the verdict. */
  points?: number;
  verdictId?: string;
  showHint?: boolean;
}

export function Feedback({ sentence, attempt, points, verdictId, showHint = false }: Props) {
  const { verdict, corrected, notes = [], explanation } = attempt.result;
  const skipped = attempt.answer === '';
  const referenceLabel = verdict === 'correct' && !attempt.exact ? 'Ещё можно сказать' : 'Правильный ответ';

  return (
    <div className={`feedback feedback--${verdict}`}>
      <p className="feedback__verdict" id={verdictId}>
        {skipped ? 'Без ответа' : VERDICT_TEXT[verdict]}
        {points !== undefined && !skipped && (
          <span className="feedback__points">
            +{points} {plural(points, ['очко', 'очка', 'очков'])}
          </span>
        )}
      </p>

      {!skipped && !attempt.exact && <AnnotatedAnswer answer={attempt.answer} corrected={corrected} />}
      {notes.length > 0 ? (
        <ul className="notes">
          {notes.map((note, i) => (
            <li key={i} className="note">
              <p className="note__change" lang="en">
                {note.wrong ? <del>{note.wrong}</del> : <span className="note__tag">пропущено</span>}
                <span className="note__arrow" aria-hidden="true">→</span>
                {note.right ? <ins>{note.right}</ins> : <span className="note__tag">лишнее</span>}
              </p>
              <p className="note__why">{plainNote(note.why)}</p>
            </li>
          ))}
        </ul>
      ) : (
        explanation && <p className="feedback__explanation">{explanation}</p>
      )}

      <div className="feedback__reference">
        <p className="feedback__label">{referenceLabel}</p>
        <ClickableSentence sentence={sentence.en} sentenceRu={sentence.ru} className="feedback__sentence" />
        {sentence.alternatives.length > 0 && (
          <>
            <p className="feedback__label">Тоже верно</p>
            {sentence.alternatives.map((alt) => (
              <ClickableSentence key={alt} sentence={alt} sentenceRu={sentence.ru} className="feedback__alternative" />
            ))}
          </>
        )}
        {showHint && <p className="feedback__hint">Нажми на слово, чтобы добавить его в словарь.</p>}
      </div>
    </div>
  );
}

/** The learner's answer with teacher-style corrections: wrong words struck out, missing ones written in. */
function AnnotatedAnswer({ answer, corrected }: { answer: string; corrected: string }) {
  const parts = diffWords(answer, corrected || answer);
  return (
    <p className="annotated" lang="en">
      {parts.map((part, i) => {
        const space = i > 0 ? ' ' : '';
        if (part.kind === 'removed') return <span key={i}>{space}<del>{part.text}</del></span>;
        if (part.kind === 'added') return <span key={i}>{space}<ins>{part.text}</ins></span>;
        return <span key={i}>{space}{part.text}</span>;
      })}
    </p>
  );
}
