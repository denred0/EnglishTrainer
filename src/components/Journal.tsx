import { useEffect, useState } from 'react';
import {
  answeredOn,
  classOf,
  classProgress,
  openLevels,
  PROMOTION_STREAK,
  streakOf,
  totalPoints,
  type ClassState,
} from '../lib/progress';
import { plural } from '../lib/text';
import { useHistory } from '../state/history';
import type { LessonAnswer, LessonRecord } from '../types';


const dayWord = (n: number) => plural(n, ['день', 'дня', 'дней']);
const sentenceWord = (n: number) => plural(n, ['предложение', 'предложения', 'предложений']);

function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="meter" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <span className="meter__fill" style={{ width: `${value * 100}%` }} />
    </div>
  );
}

const pointsText = (n: number) => `${n} ${plural(n, ['очко', 'очка', 'очков'])}`;

/** "До «2 класс»: 3 из 20 верных подряд." */
function untilNext(state: ClassState) {
  if (!state.next) return 'Это высший класс.';
  return `До «${state.next}»: ${state.streak} из ${PROMOTION_STREAK} верных подряд.`;
}

/** Which sentences count towards the next class, and what starts the run again. */
function countedLevels(state: ClassState) {
  const levels = state.level === 'C2' ? 'C2' : `${state.level} и выше`;
  return `Засчитываются предложения ${levels}. «Почти» и ответ с подсказкой не идут в счёт, но и не сбивают его. Ошибка начинает счёт заново.`;
}

/** The start screen's strip: class and points, today's goal, the streak. */
export function Journal({ goal }: { goal: number }) {
  const { records } = useHistory();
  if (!records) return null;

  const points = totalPoints(records);
  const state = classOf(records);
  const today = answeredOn(records, new Date());
  const streak = streakOf(records);

  let streakNote = 'Позанимайся сегодня, чтобы продолжить.';
  if (streak.days === 0) streakNote = 'Позанимайся сегодня, чтобы начать серию.';
  else if (streak.doneToday) streakNote = 'Сегодня занятие уже есть.';
  else if (streak.skippedYesterday) streakNote = 'Вчера был пропуск. Позанимайся сегодня, иначе серия прервётся.';

  return (
    <section className="journal" aria-label="Твой прогресс">
      <div className="journal__item">
        <p className="journal__value">{state.name}</p>
        <Meter value={classProgress(state)} label="Путь до следующего класса" />
        <p className="journal__note">{untilNext(state)}</p>
        <p className="journal__note">
          {state.next && `${countedLevels(state)} `}
          Набрано за уроки: {pointsText(points)}.
        </p>
      </div>

      <div className="journal__item">
        <p className="journal__value">
          Сегодня {today} из {goal}
        </p>
        <GoalCells done={today} goal={goal} />
        <a className="link-button journal__link" href="#/settings">
          Изменить цель
        </a>
      </div>

      <div className="journal__item journal__item--streak">
        <p className="journal__streak">
          <span className="journal__streak-days">{streak.days}</span> {dayWord(streak.days)} подряд
        </p>
        <p className="journal__note">{streakNote}</p>
      </div>
    </section>
  );
}

function GoalCells({ done, goal }: { done: number; goal: number }) {
  return (
    <ol className="goal-cells" aria-hidden="true">
      {Array.from({ length: goal }, (_, i) => (
        <li key={i} className="goal-cells__cell" data-done={i < done ? '' : undefined} />
      ))}
    </ol>
  );
}

interface RewardProps {
  sessionId: string;
  points: number;
  /** What the answers would have earned, lost because the lesson was graded 2. */
  forfeited: number;
  /** This lesson's answers, which may move the learner up a class. */
  answers: LessonAnswer[];
  answered: number;
  goal: number;
}

/** What the lesson earned, shown under the grade: points, class progress, the daily goal and the streak. */
export function LessonReward({ sessionId, points, forfeited, answers, answered, goal }: RewardProps) {
  const { records } = useHistory();
  const others = (records ?? []).filter((r) => r.sessionId !== sessionId);
  const totalAfter = totalPoints(others) + points;
  const before = classOf(others);
  const after = classOf(others, answers);
  const promoted = after.number > before.number;
  const opened = openLevels(after).filter((l) => !openLevels(before).includes(l));
  const todayBefore = answeredOn(others, new Date());
  const todayAfter = todayBefore + answered;
  const streak = streakOf([...others, { addedAt: new Date().toISOString() } as LessonRecord]);

  // The bar fills from where it was before the lesson to where it is now: the one moment that moves.
  const [shown, setShown] = useState(promoted ? 0 : classProgress(before));
  const target = classProgress(after);
  useEffect(() => {
    // A timer rather than requestAnimationFrame: frames don't run in a background tab, and the bar would stay put.
    const timer = setTimeout(() => setShown(target), 60);
    return () => clearTimeout(timer);
  }, [target]);

  if (!records) return null;

  let goalText = `До цели на сегодня ещё ${goal - todayAfter} ${sentenceWord(goal - todayAfter)}.`;
  if (todayAfter >= goal) goalText = todayBefore < goal ? 'Цель на сегодня выполнена!' : `Сегодня уже ${todayAfter}, цель выполнена.`;

  return (
    <div className="reward">
      <p className="reward__points" data-none={points === 0 ? '' : undefined}>
        +{points} {plural(points, ['очко', 'очка', 'очков'])}
      </p>
      {forfeited > 0 && (
        <p className="reward__line">
          За двойку очки не начисляются. С тройкой за этот урок было бы {forfeited}{' '}
          {plural(forfeited, ['очко', 'очка', 'очков'])}.
        </p>
      )}
      {promoted && (
        <p className="reward__promoted">
          {after.name.endsWith('класс')
            ? `Ты перешёл ${after.number === 2 ? 'во' : 'в'} ${after.name}!`
            : `Теперь ты ${after.name.toLowerCase()}!`}
        </p>
      )}
      {opened.length > 0 && (
        <p className="reward__promoted">Открыт уровень {opened.join(', ')}: предложения станут сложнее.</p>
      )}
      <div className="reward__rank">
        <span className="reward__class">{after.name}</span>
        <Meter value={shown} label="Путь до следующего класса" />
      </div>
      <p className="reward__line">{untilNext(after)}</p>
      <p className="reward__line">Всего {pointsText(totalAfter)}.</p>
      <p className="reward__line" data-done={todayAfter >= goal ? '' : undefined}>{goalText}</p>
      <p className="reward__line">
        {streak.days} {dayWord(streak.days)} подряд
      </p>
    </div>
  );
}
