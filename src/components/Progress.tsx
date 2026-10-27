import type { Attempt } from '../types';

interface Props {
  total: number;
  current: number;
  attempts: Attempt[];
  /** The furthest sentence opened so far: cells up to it lead back to their sentence, later ones stay closed. */
  reached: number;
  onGo: (index: number) => void;
}

const VERDICT_TEXT = { correct: 'верно', almost: 'почти', wrong: 'ошибка' } as const;

export function Progress({ total, current, attempts, reached, onGo }: Props) {
  return (
    <div className="progress">
      <p className="progress__text">
        Предложение <span className="progress__num">{Math.min(current + 1, total)}</span> из {total}
      </p>
      <ol className="progress__cells" aria-label="Предложения урока">
        {Array.from({ length: total }, (_, i) => {
          const verdict = attempts[i]?.result.verdict;
          const cell = (
            <span
              className="progress__cell"
              data-verdict={verdict}
              data-current={i === current ? '' : undefined}
              data-open={i <= reached && !verdict ? '' : undefined}
            />
          );
          return (
            <li key={i}>
              {i <= reached ? (
                <button
                  type="button"
                  className="progress__go"
                  aria-label={`Предложение ${i + 1}: ${verdict ? VERDICT_TEXT[verdict] : 'без ответа'}`}
                  aria-current={i === current ? 'step' : undefined}
                  onClick={() => onGo(i)}
                >
                  {cell}
                </button>
              ) : (
                cell
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
