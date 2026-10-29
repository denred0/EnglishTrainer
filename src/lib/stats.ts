// The statistics page's numbers: the history cut into a period, split into days, weeks or months, and summed up.
import { recordPoints } from './progress';
import { LEVELS, type Level, type LessonRecord, type Verdict } from '../types';

export type Period = 'week' | 'month' | 'all';
export type Unit = 'day' | 'week' | 'month';

export interface Bucket {
  start: Date;
  /** Exclusive. */
  end: Date;
  verdicts: Record<Verdict, number>;
  count: number;
  lessons: number;
}

const noVerdicts = (): Record<Verdict, number> => ({ correct: 0, almost: 0, wrong: 0 });

function startOfDay(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Monday of the date's week, the way Russian calendars start it. */
function startOfWeek(date: Date) {
  return addDays(startOfDay(date), -((date.getDay() + 6) % 7));
}

function next(date: Date, unit: Unit) {
  if (unit === 'day') return addDays(date, 1);
  if (unit === 'week') return addDays(date, 7);
  return new Date(date.getFullYear(), date.getMonth() + 1, 1);
}

/** Where the period starts and how finely it is split: days for up to a month, then weeks, then months. */
export function periodRange(records: LessonRecord[], period: Period, now = new Date()) {
  const end = addDays(startOfDay(now), 1);
  if (period !== 'all') return { start: addDays(end, period === 'week' ? -7 : -30), end, unit: 'day' as Unit };
  const first = records.length ? startOfDay(new Date(records.at(-1)!.addedAt)) : startOfDay(now);
  const days = Math.round((end.getTime() - first.getTime()) / 86_400_000);
  if (days <= 31) return { start: days < 7 ? addDays(end, -7) : first, end, unit: 'day' as Unit };
  if (days <= 26 * 7) return { start: startOfWeek(first), end, unit: 'week' as Unit };
  return { start: new Date(first.getFullYear(), first.getMonth(), 1), end, unit: 'month' as Unit };
}

/** The same length of time right before the period, to compare with; null for "all time". */
export function previousRange(period: Period, start: Date) {
  if (period === 'all') return null;
  return { start: addDays(start, period === 'week' ? -7 : -30), end: start };
}

export function inRange(records: LessonRecord[], start: Date, end: Date) {
  return records.filter((r) => {
    const at = new Date(r.addedAt);
    return at >= start && at < end;
  });
}

export function buckets(records: LessonRecord[], start: Date, end: Date, unit: Unit): Bucket[] {
  const list: Bucket[] = [];
  for (let at = start; at < end; at = next(at, unit)) {
    list.push({ start: at, end: next(at, unit), verdicts: noVerdicts(), count: 0, lessons: 0 });
  }
  for (const r of records) {
    const at = new Date(r.addedAt);
    const bucket = list.find((b) => at >= b.start && at < b.end);
    if (!bucket) continue;
    bucket.verdicts.correct += r.correct;
    bucket.verdicts.almost += r.almost;
    bucket.verdicts.wrong += r.wrong;
    bucket.count += r.answered;
    bucket.lessons++;
  }
  return list;
}

export interface Summary {
  lessons: number;
  answered: number;
  verdicts: Record<Verdict, number>;
  /** Null without lessons. */
  average: number | null;
  points: number;
  /** Answers given after looking up a word, among those kept one by one. */
  hinted: number;
  /** The longest run of correct answers, counted the way the class counts it: "Почти" and hints are skipped. */
  bestRun: number;
}

export function summary(records: LessonRecord[]): Summary {
  const verdicts = noVerdicts();
  let answered = 0;
  let hinted = 0;
  for (const r of records) {
    verdicts.correct += r.correct;
    verdicts.almost += r.almost;
    verdicts.wrong += r.wrong;
    answered += r.answered;
    hinted += r.answers?.filter((a) => a.hinted).length ?? 0;
  }
  let run = 0;
  let bestRun = 0;
  for (const answer of [...records].reverse().flatMap((r) => r.answers ?? [])) {
    if (answer.verdict === 'almost' || (answer.verdict === 'correct' && answer.hinted)) continue;
    run = answer.verdict === 'correct' ? run + 1 : 0;
    bestRun = Math.max(bestRun, run);
  }
  return {
    lessons: records.length,
    answered,
    verdicts,
    average: records.length ? records.reduce((sum, r) => sum + r.grade, 0) / records.length : null,
    points: records.reduce((sum, r) => sum + recordPoints(r), 0),
    hinted,
    bestRun,
  };
}

/** How many lessons got each grade, best first. */
export function gradeCounts(records: LessonRecord[]) {
  return [5, 4, 3, 2].map((grade) => ({ grade, count: records.filter((r) => r.grade === grade).length }));
}

/** Answers by sentence level, from the lessons that keep them one by one; levels without answers are left out. */
export function levelVerdicts(records: LessonRecord[]) {
  const counts = new Map<Level, Record<Verdict, number>>();
  for (const answer of records.flatMap((r) => r.answers ?? [])) {
    const verdicts = counts.get(answer.level) ?? noVerdicts();
    verdicts[answer.verdict]++;
    counts.set(answer.level, verdicts);
  }
  return LEVELS.filter((l) => counts.has(l)).map((level) => ({ level, verdicts: counts.get(level)! }));
}
