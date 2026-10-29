import { useState } from 'react';
import { PLOT_HEIGHT, SEGMENTS, segmentHeights, useDevicePixelRatio, wholeShares } from '../lib/chart';
import { answeredOn, verdictsOn } from '../lib/progress';
import { loadSession, loadSettings } from '../lib/session';
import { plural } from '../lib/text';
import { useDictionary } from '../state/dictionary';
import { useHistory } from '../state/history';
import { useSaved } from '../state/saved';
import type { LessonRecord, Verdict } from '../types';
import { HistoryRow } from './History';
import { Journal } from './Journal';
import { Loading } from './Marks';

const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const longDay = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const sentenceWord = (n: number) => plural(n, ['предложение', 'предложения', 'предложений']);

/** The landing page: progress, a way into practice, the last week and the totals. */
export function HomePage() {
  const { records } = useHistory();
  const { entries: words } = useDictionary();
  const { entries: saved } = useSaved();
  const [settings] = useState(loadSettings);
  const session = loadSession();
  const inProgress = session && !session.finished ? session : null;

  return (
    <div className="home">
      <h1 className="visually-hidden">Главная</h1>
      <Journal goal={settings.dailyGoal} />

      <div className="home__start">
        {inProgress ? (
          <>
            <a className="button button--primary button--large" href="#/practice">
              Продолжить урок
            </a>
            <p className="home__hint">
              Предложение {inProgress.index + 1} из {inProgress.sentences.length}
            </p>
          </>
        ) : (
          <a className="button button--primary button--large" href="#/practice">
            Начать занятие
          </a>
        )}
      </div>

      {records ? (
        <>
          <WeekChart records={records} goal={settings.dailyGoal} />
          <Totals records={records} words={words.length} saved={saved.length} />
          <RecentLessons records={records} />
        </>
      ) : (
        <Loading>Загружаю результаты…</Loading>
      )}
    </div>
  );
}

function RecentLessons({ records }: { records: LessonRecord[] }) {
  return (
    <section className="home__section" aria-labelledby="recent-title">
      <div className="home__section-head">
        <h2 className="home__title" id="recent-title">Последние занятия</h2>
        {records.length > 3 && (
          <a className="link-button" href="#/history">
            Вся история
          </a>
        )}
      </div>
      {records.length === 0 ? (
        <p className="home__hint">Здесь появятся оценки за пройденные занятия.</p>
      ) : (
        <ol className="history__list">
          {records.slice(0, 3).map((record) => (
            <HistoryRow key={record.id} record={record} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Sentences answered on each of the last seven days, split by how they went, against the daily goal. */
function WeekChart({ records, goal }: { records: LessonRecord[]; goal: number }) {
  const ratio = useDevicePixelRatio();
  const now = new Date();
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (6 - i));
    return { date, count: answeredOn(records, date), verdicts: verdictsOn(records, date), today: i === 6 };
  });
  /** Share of the day's answers, in whole percent; null on a day without answers. */
  const percent = (verdicts: Record<Verdict, number>, verdict: Verdict) => wholeShares(verdicts)?.[verdict] ?? null;
  // Headroom above the tallest bar or the goal line, so today's value label never meets the top edge.
  const scale = Math.max(goal, ...days.map((d) => d.count)) * 1.2;
  const weekTotal = days.reduce((sum, d) => sum + d.count, 0);
  const goalDays = days.filter((d) => d.count >= goal).length;

  return (
    <section className="home__section" aria-labelledby="week-title">
      <div className="home__section-head">
        <h2 className="home__title" id="week-title">Последние 7 дней</h2>
        <p className="home__hint">
          {weekTotal} {sentenceWord(weekTotal)}, цель выполнена {goalDays} из 7 дней
        </p>
      </div>
      <figure className="week">
        <div className="week__plot">
          <div className="week__goal" style={{ bottom: `${(goal / scale) * 100}%` }} />
          <ol className="week__days">
            {days.map((day) => {
              const parts = SEGMENTS.filter((s) => day.verdicts[s.verdict] > 0);
              const breakdown = parts.map((s) => `${s.label} ${day.verdicts[s.verdict]} (${percent(day.verdicts, s.verdict)}%)`).join(', ');
              const label = `${longDay.format(day.date)}: ${day.count} ${sentenceWord(day.count)}${breakdown ? `: ${breakdown}` : ''}${day.count >= goal ? ', цель выполнена' : ''}`;
              const bar = segmentHeights(
                parts.map((s) => day.verdicts[s.verdict]),
                (day.count / scale) * PLOT_HEIGHT,
                ratio,
              );
              return (
                <li key={day.date.toISOString()} className="week__day" tabIndex={0} aria-label={label} data-today={day.today || undefined}>
                  <span className="week__tip" aria-hidden="true">
                    <span className="week__tip-total">
                      {day.count} {sentenceWord(day.count)}
                    </span>
                    {parts.map((s) => (
                      <span key={s.verdict} className="week__tip-row">
                        <span className="week__swatch" data-verdict={s.verdict} />
                        {s.label}
                        <span className="week__tip-num">{day.verdicts[s.verdict]}</span>
                        <span className="week__tip-share">{percent(day.verdicts, s.verdict)}%</span>
                      </span>
                    ))}
                  </span>
                  <span className="week__bar" style={{ gap: bar.gap }}>
                    {parts.map((s, i) => (
                      <span key={s.verdict} className="week__segment" data-verdict={s.verdict} style={{ height: bar.heights[i] }} />
                    ))}
                  </span>
                  {day.count > 0 && (
                    <span className="week__value" style={{ bottom: `${(day.count / scale) * 100}%` }} aria-hidden="true">
                      {day.count}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <ol className="week__shares" aria-hidden="true">
          {days.map((day) => {
            const share = percent(day.verdicts, 'correct');
            return (
              <li key={day.date.toISOString()} data-today={day.today || undefined}>
                {share === null ? '' : `${share}%`}
              </li>
            );
          })}
        </ol>
        <ol className="week__labels" aria-hidden="true">
          {days.map((day) => (
            <li key={day.date.toISOString()} data-today={day.today || undefined}>
              {day.today ? 'сегодня' : weekday.format(day.date)}
            </li>
          ))}
        </ol>
        <ul className="week__legend" aria-hidden="true">
          {SEGMENTS.map((s) => (
            <li key={s.verdict}>
              <span className="week__swatch" data-verdict={s.verdict} />
              {s.label}
            </li>
          ))}
          <li>
            <span className="week__goal-swatch" />
            цель {goal}
          </li>
          <li>% под столбиком — доля без ошибок</li>
        </ul>
      </figure>
    </section>
  );
}

function Totals({ records, words, saved }: { records: LessonRecord[]; words: number; saved: number }) {
  const answered = records.reduce((sum, r) => sum + r.answered, 0);
  const correct = records.reduce((sum, r) => sum + r.correct, 0);
  const average = records.length ? records.reduce((sum, r) => sum + r.grade, 0) / records.length : 0;
  const stats = [
    { value: records.length, label: plural(records.length, ['занятие', 'занятия', 'занятий']) },
    { value: answered, label: `${sentenceWord(answered)} переведено` },
    { value: answered ? `${Math.round((correct / answered) * 100)}%` : '—', label: 'без ошибок' },
    { value: records.length ? average.toLocaleString('ru-RU', { maximumFractionDigits: 1 }) : '—', label: 'средняя оценка' },
    { value: words, label: `${plural(words, ['слово', 'слова', 'слов'])} в словаре` },
    { value: saved, label: `${sentenceWord(saved)} сохранено` },
  ];

  return (
    <section className="home__section" aria-labelledby="totals-title">
      <div className="home__section-head">
        <h2 className="home__title" id="totals-title">За всё время</h2>
        {records.length > 0 && (
          <a className="link-button" href="#/history/stats">
            Подробная статистика
          </a>
        )}
      </div>
      <dl className="totals">
        {stats.map((s) => (
          <div key={s.label} className="totals__item">
            <dt className="totals__label">{s.label}</dt>
            <dd className="totals__value">{s.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
