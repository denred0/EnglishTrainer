import { useState, type CSSProperties } from 'react';
import { PLOT_HEIGHT, SEGMENTS, segmentHeights, useDevicePixelRatio, wholeShares } from '../lib/chart';
import { loadSettings } from '../lib/session';
import {
  buckets,
  gradeCounts,
  inRange,
  levelVerdicts,
  periodRange,
  previousRange,
  summary,
  type Bucket,
  type Period,
  type Summary,
  type Unit,
} from '../lib/stats';
import { plural } from '../lib/text';
import type { LessonRecord, Verdict } from '../types';

const PERIODS: { id: Period; label: string; compare: string }[] = [
  { id: 'week', label: '7 дней', compare: 'с предыдущими 7 днями' },
  { id: 'month', label: '30 дней', compare: 'с предыдущими 30 днями' },
  { id: 'all', label: 'Всё время', compare: '' },
];

const weekday = new Intl.DateTimeFormat('ru-RU', { weekday: 'short' });
const shortDay = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
const longDay = new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });
const dayMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' });
const shortMonth = new Intl.DateTimeFormat('ru-RU', { month: 'short' });
const longMonth = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' });

const sentenceWord = (n: number) => plural(n, ['предложение', 'предложения', 'предложений']);
const number = (n: number, digits = 0) => n.toLocaleString('ru-RU', { maximumFractionDigits: digits });
const totalOf = (v: Record<Verdict, number>) => v.correct + v.almost + v.wrong;

function isToday(date: Date) {
  return date.toDateString() === new Date().toDateString();
}

/** Under the axis: weekdays for a week, otherwise dates or months, thinned out so they never touch. */
function axisLabel(bucket: Bucket, unit: Unit, columns: number) {
  if (unit === 'day' && isToday(bucket.start)) return 'сегодня';
  if (unit === 'day') return columns <= 7 ? weekday.format(bucket.start) : shortDay.format(bucket.start);
  if (unit === 'week') return shortDay.format(bucket.start);
  return shortMonth.format(bucket.start);
}

function longLabel(bucket: Bucket, unit: Unit) {
  if (unit === 'day') return longDay.format(bucket.start);
  if (unit === 'week') return `неделя с ${dayMonth.format(bucket.start)}`;
  return longMonth.format(bucket.start);
}

/**
 * Dates under the columns: all of up to 8, otherwise every few and always the newest. Every other one of those is
 * "minor" and hidden on phones; the outermost ones lean inwards so they stay inside the chart.
 */
function AxisLabels({ list, unit, className = '' }: { list: Bucket[]; unit: Unit; className?: string }) {
  const columns = list.length;
  const step = Math.ceil(columns / 6);
  const shown =
    columns <= 8
      ? list.map((_, i) => i)
      : list.map((_, i) => i).filter((i) => i === columns - 1 || (i % step === 0 && columns - 1 - i >= step / 2));
  return (
    <ol className={`week__labels ${className}`} aria-hidden="true">
      {list.map((b, i) => {
        const position = shown.indexOf(i);
        const edge = columns > 8 && i === 0 ? 'start' : columns > 8 && i === columns - 1 ? 'end' : undefined;
        return (
          <li
            key={b.start.toISOString()}
            data-today={(unit === 'day' && isToday(b.start)) || undefined}
            data-minor={(columns > 8 && (shown.length - 1 - position) % 2 === 1) || undefined}
            data-edge={edge}
          >
            {position >= 0 ? axisLabel(b, unit, columns) : ''}
          </li>
        );
      })}
    </ol>
  );
}

/** Tooltips near the edges open inwards so they stay on screen. */
function tipAlign(i: number, columns: number) {
  if (i < columns / 3) return 'start';
  if (i >= (columns * 2) / 3) return 'end';
  return undefined;
}

/** Detailed statistics for a period: totals against the previous period, answers over time, grades and levels. */
export function Stats({ records }: { records: LessonRecord[] }) {
  const [period, setPeriod] = useState<Period>('week');
  const [goal] = useState(() => loadSettings().dailyGoal);
  const { start, end, unit } = periodRange(records, period);
  const current = inRange(records, start, end);
  const previousDates = previousRange(period, start);
  const previous = previousDates ? inRange(records, previousDates.start, previousDates.end) : [];
  const now = summary(current);
  const before = previous.length ? summary(previous) : null;
  const list = buckets(current, start, end, unit);
  const compare = PERIODS.find((p) => p.id === period)!.compare;

  return (
    <div className="stats">
      <div className="tabs tabs--small" role="group" aria-label="Период">
        {PERIODS.map((p) => (
          <button
            key={p.id}
            type="button"
            className="tabs__link"
            aria-pressed={period === p.id}
            onClick={() => setPeriod(p.id)}
          >
            {p.label}
          </button>
        ))}
      </div>

      {current.length === 0 ? (
        <p className="home__hint">
          {period === 'all' ? 'Занятий пока не было.' : `За последние ${period === 'week' ? '7' : '30'} дней занятий не было.`}
        </p>
      ) : (
        <>
          <Figures now={now} before={before} compare={compare} />
          <AnswersChart list={list} unit={unit} goal={unit === 'day' ? goal : null} />
          <ShareChart list={list} unit={unit} />
          <Grades records={current} />
          <Levels records={current} />
        </>
      )}
    </div>
  );
}

const percentOf = (s: Summary) => (s.answered ? (s.verdicts.correct / s.answered) * 100 : 0);

/** "▲ 8 п.п.": the change against the previous period, or nothing when there is none to compare with. */
function Delta({ value, unit = '', digits = 0 }: { value: number | null; unit?: string; digits?: number }) {
  if (value === null) return null;
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return <span className="stats__delta">без изменений</span>;
  return (
    <span className="stats__delta">
      <span aria-hidden="true">{rounded > 0 ? '▲' : '▼'}</span> {rounded > 0 ? '+' : '−'}
      {number(Math.abs(rounded), digits)}
      {unit}
    </span>
  );
}

function Figures({ now, before, compare }: { now: Summary; before: Summary | null; compare: string }) {
  const share = percentOf(now);
  const hintShare = now.answered ? (now.hinted / now.answered) * 100 : 0;
  const figures = [
    {
      value: number(now.answered),
      label: `${sentenceWord(now.answered)} переведено`,
      delta: before && <Delta value={now.answered - before.answered} />,
    },
    {
      value: `${Math.round(share)}%`,
      label: 'без ошибок',
      delta: before && <Delta value={share - percentOf(before)} unit=" п.п." />,
    },
    {
      value: now.average === null ? '—' : number(now.average, 1),
      label: 'средняя оценка',
      delta: before && now.average !== null && before.average !== null && (
        <Delta value={now.average - before.average} digits={1} />
      ),
    },
    {
      value: number(now.lessons),
      label: plural(now.lessons, ['занятие', 'занятия', 'занятий']),
      delta: before && <Delta value={now.lessons - before.lessons} />,
    },
    {
      value: number(now.points),
      label: plural(now.points, ['очко', 'очка', 'очков']),
      delta: before && <Delta value={now.points - before.points} />,
    },
    { value: number(now.bestRun), label: 'лучшая серия верных подряд', delta: null },
    { value: `${Math.round(hintShare)}%`, label: 'с подсказкой', delta: null },
    {
      value: number(now.verdicts.almost),
      label: `${plural(now.verdicts.almost, ['ответ', 'ответа', 'ответов'])} «почти»`,
      delta: null,
    },
  ];

  return (
    <section className="home__section" aria-labelledby="figures-title">
      <div className="home__section-head">
        <h2 className="home__title" id="figures-title">Итоги</h2>
        {compare && before && <p className="home__hint">Стрелки — сравнение {compare}</p>}
      </div>
      <dl className="totals stats__figures">
        {figures.map((f) => (
          <div key={f.label} className="totals__item">
            <dt className="totals__label">
              {f.label}
              {f.delta}
            </dt>
            <dd className="totals__value">{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Answers in each day, week or month, split by how they went: the same bars as on the home page, over a longer time. */
function AnswersChart({ list, unit, goal }: { list: Bucket[]; unit: Unit; goal: number | null }) {
  const ratio = useDevicePixelRatio();
  const columns = list.length;
  const scale = Math.max(goal ?? 0, ...list.map((b) => b.count)) * 1.2 || 1;
  // Numbers above every bar only while they fit side by side.
  const values = columns <= 14;

  return (
    <section className="home__section" aria-labelledby="answers-title">
      <div className="home__section-head">
        <h2 className="home__title" id="answers-title">Ответы</h2>
        <p className="home__hint">по {unit === 'day' ? 'дням' : unit === 'week' ? 'неделям' : 'месяцам'}</p>
      </div>
      <figure className="week stats__wide" style={{ '--columns': columns } as CSSProperties}>
        <div className="week__plot">
          {goal !== null && <div className="week__goal" style={{ bottom: `${(goal / scale) * 100}%` }} />}
          <ol className="week__days">
            {list.map((b, i) => {
              const parts = SEGMENTS.filter((s) => b.verdicts[s.verdict] > 0);
              const shares = wholeShares(b.verdicts);
              const breakdown = parts.map((s) => `${s.label} ${b.verdicts[s.verdict]} (${shares![s.verdict]}%)`).join(', ');
              const bar = segmentHeights(
                parts.map((s) => b.verdicts[s.verdict]),
                (b.count / scale) * PLOT_HEIGHT,
                ratio,
              );
              return (
                <li
                  key={b.start.toISOString()}
                  className="week__day"
                  tabIndex={0}
                  data-align={tipAlign(i, columns)}
                  aria-label={`${longLabel(b, unit)}: ${b.count} ${sentenceWord(b.count)}${breakdown ? `: ${breakdown}` : ''}`}
                >
                  <span className="week__tip" aria-hidden="true">
                    <span className="week__tip-total">
                      {longLabel(b, unit)}: {b.count} {sentenceWord(b.count)}
                    </span>
                    {parts.map((s) => (
                      <span key={s.verdict} className="week__tip-row">
                        <span className="week__swatch" data-verdict={s.verdict} />
                        {s.label}
                        <span className="week__tip-num">{b.verdicts[s.verdict]}</span>
                        <span className="week__tip-share">{shares![s.verdict]}%</span>
                      </span>
                    ))}
                  </span>
                  {b.count > 0 && (
                    <span className="week__bar" style={{ gap: bar.gap }}>
                      {parts.map((s, j) => (
                        <span key={s.verdict} className="week__segment" data-verdict={s.verdict} style={{ height: bar.heights[j] }} />
                      ))}
                    </span>
                  )}
                  {values && b.count > 0 && (
                    <span className="week__value" style={{ bottom: `${(b.count / scale) * 100}%` }} aria-hidden="true">
                      {b.count}
                    </span>
                  )}
                </li>
              );
            })}
          </ol>
        </div>
        <AxisLabels list={list} unit={unit} />
        <ul className="week__legend" aria-hidden="true">
          {SEGMENTS.map((s) => (
            <li key={s.verdict}>
              <span className="week__swatch" data-verdict={s.verdict} />
              {s.label}
            </li>
          ))}
          {goal !== null && (
            <li>
              <span className="week__goal-swatch" />
              цель {goal}
            </li>
          )}
        </ul>
      </figure>
    </section>
  );
}

/**
 * The share of answers without mistakes in each column: whether the right ones grow from day to day. One line only:
 * a red line for mistakes next to it would be indistinguishable from the green one for red-green colour blindness,
 * so the other shares are in the tooltip.
 */
function ShareChart({ list, unit }: { list: Bucket[]; unit: Unit }) {
  const columns = list.length;
  const x = (i: number) => ((i + 0.5) / columns) * 100;
  const points = list
    .map((b, i) => ({ i, share: wholeShares(b.verdicts)?.correct ?? null }))
    .filter((p): p is { i: number; share: number } => p.share !== null);
  const last = points.at(-1);

  return (
    <section className="home__section" aria-labelledby="share-title">
      <div className="home__section-head">
        <h2 className="home__title" id="share-title">Доля ответов без ошибок</h2>
        <p className="home__hint">{unit === 'day' ? 'за день' : unit === 'week' ? 'за неделю' : 'за месяц'}</p>
      </div>
      <figure className="share stats__wide" style={{ '--columns': columns } as CSSProperties}>
        <div className="share__plot">
          <ol className="share__axis" aria-hidden="true">
            {[100, 50, 0].map((v) => (
              <li key={v} style={{ bottom: `${v}%` }}>
                {v}%
              </li>
            ))}
          </ol>
          <div className="share__area">
            {[100, 50, 0].map((v) => (
              <span key={v} className="share__grid" style={{ bottom: `${v}%` }} />
            ))}
            <svg className="share__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <polyline points={points.map((p) => `${x(p.i)},${100 - p.share}`).join(' ')} />
            </svg>
            {points.map((p) => (
              <span key={p.i} className="share__dot" style={{ left: `${x(p.i)}%`, bottom: `${p.share}%` }} />
            ))}
            {last && (
              <span className="share__value" style={{ left: `${x(last.i)}%`, bottom: `${last.share}%` }} aria-hidden="true">
                {last.share}%
              </span>
            )}
            <ol className="share__columns">
              {list.map((b, i) => {
                const shares = wholeShares(b.verdicts);
                const total = totalOf(b.verdicts);
                const text = shares
                  ? `без ошибок ${shares.correct}%, почти ${shares.almost}%, с ошибками ${shares.wrong}%`
                  : 'занятий не было';
                return (
                  <li
                    key={b.start.toISOString()}
                    className="share__column"
                    tabIndex={shares ? 0 : -1}
                    data-align={tipAlign(i, columns)}
                    aria-label={`${longLabel(b, unit)}: ${text}`}
                  >
                    {shares && (
                      <span className="week__tip" aria-hidden="true">
                        <span className="week__tip-total">
                          {longLabel(b, unit)}: {total} {sentenceWord(total)}
                        </span>
                        {SEGMENTS.map((s) => (
                          <span key={s.verdict} className="week__tip-row">
                            <span className="week__swatch" data-verdict={s.verdict} />
                            {s.label}
                            <span className="week__tip-num">{shares[s.verdict]}%</span>
                          </span>
                        ))}
                      </span>
                    )}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        <AxisLabels list={list} unit={unit} className="share__labels" />
      </figure>
    </section>
  );
}

/** How many lessons got each grade. */
function Grades({ records }: { records: LessonRecord[] }) {
  const counts = gradeCounts(records);
  const most = Math.max(...counts.map((c) => c.count), 1);

  return (
    <section className="home__section" aria-labelledby="grades-title">
      <div className="home__section-head">
        <h2 className="home__title" id="grades-title">Оценки</h2>
        <p className="home__hint">
          {records.length} {plural(records.length, ['занятие', 'занятия', 'занятий'])}
        </p>
      </div>
      <ul className="rows">
        {counts.map(({ grade, count }) => (
          <li key={grade} className="rows__item" data-grade={grade}>
            <span className="rows__grade">
              <span className="visually-hidden">Оценка </span>
              {grade}
            </span>
            <span className="rows__track">
              {count > 0 && <span className="rows__bar" style={{ width: `${(count / most) * 100}%` }} />}
            </span>
            <span className="rows__value">
              {count} <span className="rows__muted">{Math.round((count / records.length) * 100)}%</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Answers by sentence level: how the harder sentences go compared with the easier ones. */
function Levels({ records }: { records: LessonRecord[] }) {
  const levels = levelVerdicts(records);
  const without = records.filter((r) => !r.answers).length;
  if (levels.length === 0) return null;

  return (
    <section className="home__section" aria-labelledby="levels-title">
      <div className="home__section-head">
        <h2 className="home__title" id="levels-title">По уровням</h2>
        {without > 0 && (
          <p className="home__hint">
            Без {without} старых {plural(without, ['занятия', 'занятий', 'занятий'])}: в них нет разбивки по
            предложениям.
          </p>
        )}
      </div>
      <ul className="rows">
        {levels.map(({ level, verdicts }) => {
          const total = totalOf(verdicts);
          const shares = wholeShares(verdicts)!;
          const parts = SEGMENTS.filter((s) => verdicts[s.verdict] > 0);
          return (
            <li
              key={level}
              className="rows__item"
              aria-label={`${level}: ${total} ${sentenceWord(total)}, ${parts.map((s) => `${s.label} ${shares[s.verdict]}%`).join(', ')}`}
            >
              <span className="rows__level" aria-hidden="true">{level}</span>
              <span className="rows__track rows__track--split" aria-hidden="true">
                {parts.map((s) => (
                  <span key={s.verdict} className="week__segment" data-verdict={s.verdict} style={{ flexGrow: verdicts[s.verdict] }} />
                ))}
              </span>
              <span className="rows__value" aria-hidden="true">
                {shares.correct}% <span className="rows__muted">из {total}</span>
              </span>
            </li>
          );
        })}
      </ul>
      <ul className="week__legend" aria-hidden="true">
        {SEGMENTS.map((s) => (
          <li key={s.verdict}>
            <span className="week__swatch" data-verdict={s.verdict} />
            {s.label}
          </li>
        ))}
        <li>% справа — доля без ошибок</li>
      </ul>
    </section>
  );
}
