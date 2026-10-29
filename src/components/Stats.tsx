import { useState, type CSSProperties, type ReactNode } from 'react';
import { PROMOTION_STREAK } from '../lib/progress';
import { PLOT_HEIGHT, SEGMENTS, segmentHeights, useDevicePixelRatio, wholeShares } from '../lib/chart';
import { loadSettings } from '../lib/session';
import {
  buckets,
  gradeCounts,
  inRange,
  levelVerdicts,
  periodRange,
  previousRange,
  runs,
  summary,
  weekdayCounts,
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
          <CountChart list={list} unit={unit} goal={unit === 'day' ? goal : null} />
          <ShareChart list={list} unit={unit} />
          <AnswersChart list={list} unit={unit} />
          <GradeChart list={list} unit={unit} />
          <RunChart records={records} list={list} unit={unit} />
          {period !== 'week' && <WeekdayChart records={current} />}
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
function AnswersChart({ list, unit }: { list: Bucket[]; unit: Unit }) {
  const ratio = useDevicePixelRatio();
  const columns = list.length;
  const scale = Math.max(...list.map((b) => b.count)) * 1.2 || 1;

  return (
    <section className="home__section" aria-labelledby="answers-title">
      <div className="home__section-head">
        <h2 className="home__title" id="answers-title">Как прошли ответы</h2>
        <p className="home__hint">{perUnit(unit)}</p>
      </div>
      <figure className="week stats__wide" style={{ '--columns': columns } as CSSProperties}>
        <div className="week__plot">
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
                  style={{ '--i': i } as CSSProperties}
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
        </ul>
      </figure>
    </section>
  );
}

interface Tip {
  title: string;
  rows: { label: string; value: string; verdict?: Verdict }[];
}

/** The tooltip over a column: a title and a row per figure, with a colour key where the figure has one. */
function TipBox({ tip }: { tip: Tip }) {
  return (
    <span className="week__tip" aria-hidden="true">
      <span className="week__tip-total">{tip.title}</span>
      {tip.rows.map((row) => (
        <span key={row.label} className="week__tip-row">
          {row.verdict && <span className="week__swatch" data-verdict={row.verdict} />}
          {row.label}
          <span className="week__tip-num">{row.value}</span>
        </span>
      ))}
    </span>
  );
}

const tipText = (tip: Tip) => `${tip.title}: ${tip.rows.map((r) => `${r.label} ${r.value}`).join(', ')}`;

interface LineChartProps {
  id: string;
  title: string;
  hint: string;
  list: Bucket[];
  unit: Unit;
  /** One per column; null where there is nothing to show. */
  values: (number | null)[];
  min: number;
  max: number;
  ticks: number[];
  format: (value: number) => string;
  tip: (i: number) => Tip | null;
  /** The line's colour: green for the share without mistakes, neutral for grades, pink for the run. */
  tone: 'correct' | 'grade' | 'run';
  /** A colour per dot, when the value itself has one (a grade's pen); the line's own colour otherwise. */
  dotColor?: (value: number) => string;
  threshold?: { value: number; label: string };
}

/**
 * One series over time: a 2px line through the columns that have a value, a dot on each, the newest value written
 * next to its dot, and a tooltip per column. One series only, so its colour never has to be told apart from another.
 */
function LineChart(props: LineChartProps) {
  const { id, title, hint, list, unit, values, min, max, ticks, format, tip, tone, dotColor, threshold } = props;
  const columns = list.length;
  const x = (i: number) => ((i + 0.5) / columns) * 100;
  const y = (v: number) => ((v - min) / (max - min)) * 100;
  const points = values.map((v, i) => ({ i, v })).filter((p): p is { i: number; v: number } => p.v !== null);
  const last = points.at(-1);

  return (
    <section className="home__section" aria-labelledby={id}>
      <div className="home__section-head">
        <h2 className="home__title" id={id}>{title}</h2>
        <p className="home__hint">{hint}</p>
      </div>
      <figure className="share stats__wide" data-tone={tone} style={{ '--columns': columns } as CSSProperties}>
        <div className="share__plot">
          <ol className="share__axis" aria-hidden="true">
            {ticks.map((v) => (
              <li key={v} style={{ bottom: `${y(v)}%` }}>
                {format(v)}
              </li>
            ))}
          </ol>
          <div className="share__area">
            {ticks.map((v) => (
              <span key={v} className="share__grid" data-base={v === min || undefined} style={{ bottom: `${y(v)}%` }} />
            ))}
            {threshold && <span className="share__threshold" style={{ bottom: `${y(threshold.value)}%` }} />}
            <svg className="share__lines" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <defs>
                <linearGradient id={`${id}-fill`} x1="0" y1="0" x2="0" y2="1">
                  <stop className="share__fill" offset="0" stopOpacity="0.28" />
                  <stop className="share__fill" offset="1" stopOpacity="0" />
                </linearGradient>
              </defs>
              {points.length > 1 && (
                <polygon
                  fill={`url(#${id}-fill)`}
                  points={[
                    `${x(points[0].i)},100`,
                    ...points.map((p) => `${x(p.i)},${100 - y(p.v)}`),
                    `${x(points.at(-1)!.i)},100`,
                  ].join(' ')}
                />
              )}
              <polyline points={points.map((p) => `${x(p.i)},${100 - y(p.v)}`).join(' ')} />
            </svg>
            {points.map((p) => (
              <span
                key={p.i}
                className="share__dot"
                style={{ left: `${x(p.i)}%`, bottom: `${y(p.v)}%`, background: dotColor?.(p.v) }}
              />
            ))}
            {last && (
              <span className="share__value" style={{ left: `${x(last.i)}%`, bottom: `${y(last.v)}%` }} aria-hidden="true">
                {format(last.v)}
              </span>
            )}
            <ol className="share__columns">
              {list.map((b, i) => {
                const content = tip(i);
                return (
                  <li
                    key={b.start.toISOString()}
                    className="share__column"
                    style={{ '--i': i } as CSSProperties}
                    tabIndex={content ? 0 : -1}
                    data-align={tipAlign(i, columns)}
                    aria-label={content ? tipText(content) : `${longLabel(b, unit)}: нет данных`}
                  >
                    {content && <TipBox tip={content} />}
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
        <AxisLabels list={list} unit={unit} className="share__labels" />
        {threshold && (
          <ul className="week__legend share__legend" aria-hidden="true">
            <li>
              <span className="week__goal-swatch" />
              {threshold.label}
            </li>
          </ul>
        )}
      </figure>
    </section>
  );
}

const perUnit = (unit: Unit) => (unit === 'day' ? 'за день' : unit === 'week' ? 'за неделю' : 'за месяц');

/**
 * The share of answers without mistakes in each column: whether the right ones grow from day to day. One line only:
 * a red line for mistakes next to it would be indistinguishable from the green one for red-green colour blindness,
 * so the other shares are in the tooltip.
 */
function ShareChart({ list, unit }: { list: Bucket[]; unit: Unit }) {
  return (
    <LineChart
      id="share-title"
      title="Доля ответов без ошибок"
      hint={perUnit(unit)}
      list={list}
      unit={unit}
      values={list.map((b) => wholeShares(b.verdicts)?.correct ?? null)}
      min={0}
      max={100}
      ticks={[0, 50, 100]}
      format={(v) => `${v}%`}
      tone="correct"
      tip={(i) => {
        const shares = wholeShares(list[i].verdicts);
        if (!shares) return null;
        const total = totalOf(list[i].verdicts);
        return {
          title: `${longLabel(list[i], unit)}: ${total} ${sentenceWord(total)}`,
          rows: SEGMENTS.map((s) => ({ label: s.label, value: `${shares[s.verdict]}%`, verdict: s.verdict })),
        };
      }}
    />
  );
}

// The pens the grades are written in, so a dot on the average grade line reads like the grade it's nearest to.
const GRADE_PENS: Record<number, string> = {
  2: 'var(--pen-red)',
  3: 'var(--pen-amber)',
  4: 'var(--pen-blue)',
  5: 'var(--pen-green)',
};

/** The average grade of each column's lessons, on the 2–5 scale. */
function GradeChart({ list, unit }: { list: Bucket[]; unit: Unit }) {
  const averages = list.map((b) => (b.grades.length ? b.grades.reduce((sum, g) => sum + g, 0) / b.grades.length : null));
  return (
    <LineChart
      id="grade-title"
      title="Средняя оценка"
      hint={perUnit(unit)}
      list={list}
      unit={unit}
      values={averages}
      min={2}
      max={5}
      ticks={[2, 3, 4, 5]}
      format={(v) => number(v, 1)}
      tone="grade"
      dotColor={(v) => GRADE_PENS[Math.min(5, Math.max(2, Math.round(v)))]}
      tip={(i) =>
        averages[i] === null
          ? null
          : {
              title: longLabel(list[i], unit),
              rows: [
                { label: 'средняя оценка', value: number(averages[i]!, 1) },
                { label: 'оценки', value: list[i].grades.join(', ') },
              ],
            }
      }
    />
  );
}

/** How the run of correct answers towards the next class went: where it grew and where a mistake reset it. */
function RunChart({ records, list, unit }: { records: LessonRecord[]; list: Bucket[]; unit: Unit }) {
  const states = runs(records, list);
  return (
    <LineChart
      id="run-title"
      title="Путь к следующему классу"
      hint={`верных подряд на конец ${unit === 'day' ? 'дня' : unit === 'week' ? 'недели' : 'месяца'}`}
      list={list}
      unit={unit}
      values={states.map((s) => (s && !s.top ? s.streak : null))}
      min={0}
      max={PROMOTION_STREAK}
      ticks={[0, PROMOTION_STREAK / 2, PROMOTION_STREAK]}
      format={(v) => number(v)}
      tone="run"
      threshold={{ value: PROMOTION_STREAK, label: `${PROMOTION_STREAK} подряд — переход в следующий класс` }}
      tip={(i) => {
        const state = states[i];
        if (!state) return null;
        const moved = i > 0 && states[i - 1] && states[i - 1]!.classNumber < state.classNumber;
        return {
          title: longLabel(list[i], unit),
          rows: [
            { label: 'верных подряд', value: state.top ? '—' : `${state.streak} из ${PROMOTION_STREAK}` },
            { label: moved ? 'переход в' : 'класс', value: state.className },
          ],
        };
      }}
    />
  );
}

interface BarItem {
  key: string;
  value: number;
  tip: Tip;
}

/** One series of bars with its value on top: how much, not how it went. */
function BarsChart({
  id,
  title,
  hint,
  items,
  axis,
  goal,
  tone,
}: {
  id: string;
  title: string;
  hint: string;
  items: BarItem[];
  axis: ReactNode;
  goal?: number | null;
  /** Blue for how many, teal for weekdays. */
  tone: 'count' | 'weekday';
}) {
  const ratio = useDevicePixelRatio();
  const columns = items.length;
  const scale = Math.max(goal ?? 0, ...items.map((item) => item.value)) * 1.2 || 1;
  const most = Math.max(...items.map((item) => item.value));
  // Every value while they fit side by side; past that, only the highest and the newest.
  const labelled = (item: BarItem, i: number) =>
    item.value > 0 && (columns <= 14 || item.value === most || i === columns - 1);

  return (
    <section className="home__section" aria-labelledby={id}>
      <div className="home__section-head">
        <h2 className="home__title" id={id}>{title}</h2>
        <p className="home__hint">{hint}</p>
      </div>
      <figure className="week stats__wide" style={{ '--columns': columns } as CSSProperties}>
        <div className="week__plot">
          {goal != null && <div className="week__goal" style={{ bottom: `${(goal / scale) * 100}%` }} />}
          <ol className="week__days">
            {items.map((item, i) => (
              <li
                key={item.key}
                className="week__day"
                tabIndex={0}
                style={{ '--i': i } as CSSProperties}
                data-align={tipAlign(i, columns)}
                aria-label={tipText(item.tip)}
              >
                <TipBox tip={item.tip} />
                {item.value > 0 && (
                  <span className="week__bar">
                    <span
                      className="week__segment"
                      data-verdict={tone}
                      style={{ height: segmentHeights([item.value], (item.value / scale) * PLOT_HEIGHT, ratio).heights[0] }}
                    />
                  </span>
                )}
                {labelled(item, i) && (
                  <span className="week__value" style={{ bottom: `${(item.value / scale) * 100}%` }} aria-hidden="true">
                    {item.value}
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
        {axis}
        {goal != null && (
          <ul className="week__legend" aria-hidden="true">
            <li>
              <span className="week__goal-swatch" />
              цель {goal}
            </li>
          </ul>
        )}
      </figure>
    </section>
  );
}

/** Sentences translated in each column, against the daily goal. */
function CountChart({ list, unit, goal }: { list: Bucket[]; unit: Unit; goal: number | null }) {
  return (
    <BarsChart
      id="count-title"
      tone="count"
      title={`Предложений ${perUnit(unit)}`}
      hint={`${list.filter((b) => b.count > 0).length} из ${list.length} ${unit === 'day' ? 'дней' : unit === 'week' ? 'недель' : 'месяцев'} с занятиями`}
      goal={goal}
      axis={<AxisLabels list={list} unit={unit} />}
      items={list.map((b) => ({
        key: b.start.toISOString(),
        value: b.count,
        tip: {
          title: longLabel(b, unit),
          rows: [
            { label: 'предложений', value: String(b.count) },
            { label: 'занятий', value: String(b.lessons) },
          ],
        },
      }))}
    />
  );
}

const WEEKDAYS = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
const WEEKDAY_NAMES = ['понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота', 'воскресенье'];

/** Which days of the week the practice falls on, over the whole period. */
function WeekdayChart({ records }: { records: LessonRecord[] }) {
  const counts = weekdayCounts(records);
  return (
    <BarsChart
      id="weekday-title"
      tone="weekday"
      title="По дням недели"
      hint="сколько предложений за период пришлось на каждый день"
      axis={
        <ol className="week__labels" aria-hidden="true">
          {WEEKDAYS.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ol>
      }
      items={counts.map((value, i) => ({
        key: WEEKDAYS[i],
        value,
        tip: { title: WEEKDAY_NAMES[i], rows: [{ label: 'предложений', value: String(value) }] },
      }))}
    />
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
