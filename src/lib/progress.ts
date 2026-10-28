// Points, school classes, the daily goal and the streak, all derived from the lesson history. Points are the score
// and the reward; the class shows how well the current level is mastered.
// Only type imports here, so the module also runs under plain Node for quick checks.
import type { Attempt, LessonAnswer, Level, LessonRecord, Sentence, Verdict } from '../types';

const VERDICT_POINTS = { correct: 10, almost: 5, wrong: 1 } as const;
const LEVEL_FACTOR: Record<string, number> = { A1: 1, A2: 1.2, B1: 1.4, B2: 1.6, C1: 1.8, C2: 2 };

/**
 * Points for one answer: 10 / 5 / 1 for a correct / almost / wrong answer, times the sentence's level (A1 ×1 …
 * C2 ×2), so harder sentences pay more and a mistake still beats not trying. Half with a hint; "Не знаю" earns nothing.
 */
export function sentencePoints(level: string, verdict: Verdict, hinted: boolean): number {
  return Math.round(VERDICT_POINTS[verdict] * (LEVEL_FACTOR[level] ?? 1) * (hinted ? 0.5 : 1));
}

export function attemptPoints(sentence: Sentence | undefined, attempt: Attempt): number {
  if (attempt.answer === '') return 0;
  return sentencePoints(sentence?.level ?? 'A1', attempt.result.verdict, Boolean(attempt.hints?.length));
}

/** The lowest grade that earns points: a lesson graded 2 gives nothing, so failed lessons can't add up to a new class. */
export const PASSING_GRADE = 3;

/** The sum of the points shown for each answer, whatever the grade. */
export function answerPoints(sentences: Sentence[], attempts: Attempt[]): number {
  return attempts.reduce((sum, attempt, i) => sum + attemptPoints(sentences[i], attempt), 0);
}

/** What the lesson earns: its answers' points, or nothing for a 2. */
export function lessonPoints(sentences: Sentence[], attempts: Attempt[], grade: number): number {
  return grade < PASSING_GRADE ? 0 : answerPoints(sentences, attempts);
}

/** Lessons graded 2 count for nothing, including ones recorded before that rule; lessons recorded before points
 * existed get the base points, without the level bonus. */
export function recordPoints(record: LessonRecord): number {
  if (record.grade < PASSING_GRADE) return 0;
  return record.points ?? record.correct * 10 + record.almost * 5 + record.wrong;
}

export function totalPoints(records: LessonRecord[]): number {
  return records.reduce((sum, r) => sum + recordPoints(r), 0);
}

const CLASS_NAMES = [...Array.from({ length: 11 }, (_, i) => `${i + 1} класс`), 'Студент', 'Выпускник'];

/** The class that opens each level: A1 from the start, then a new level every two classes. */
const LEVEL_CLASS: Record<Level, number> = { A1: 1, A2: 2, B1: 4, B2: 6, C1: 8, C2: 10 };
const LEVEL_ORDER = Object.keys(LEVEL_CLASS) as Level[];

/** To move up: this many correct answers in a row at the class's level or above. */
export const PROMOTION_STREAK = 20;

/** The answers of a finished lesson, as the history keeps them. "Не знаю" counts as wrong. */
export function lessonAnswers(sentences: Sentence[], attempts: Attempt[]): LessonAnswer[] {
  return attempts.map((attempt, i) => ({
    level: sentences[i]?.level ?? 'A1',
    verdict: attempt.answer === '' ? 'wrong' : attempt.result.verdict,
    ...(attempt.hints?.length ? { hinted: true } : {}),
  }));
}

/** The newest level open in a class (1-based): the one the class is passed on. */
function classLevel(classNumber: number): Level {
  return LEVEL_ORDER.filter((l) => LEVEL_CLASS[l] <= classNumber).at(-1)!;
}

export interface ClassState {
  /** 1-based: 1 for "1 класс", 12 for "Студент". */
  number: number;
  name: string;
  /** Answers at this level or harder count towards the next class. */
  level: Level;
  /** The next class, or null at the top. */
  next: string | null;
  /** Correct answers in a row so far, towards PROMOTION_STREAK. */
  streak: number;
}

/**
 * The class follows from the history: replaying the answers oldest first, each counted one either carries the run
 * of correct answers on or starts it again from zero (a mistake or "Не знаю"); once the run reaches PROMOTION_STREAK,
 * the learner moves up and the next run starts. Easier sentences than the class's level, "Почти" and correct answers
 * given with a hint are skipped: they neither count nor break it. Lessons recorded before answers were kept one by
 * one don't count.
 */
export function classOf(records: LessonRecord[], extra: LessonAnswer[] = []): ClassState {
  const answers = [...records].reverse().flatMap((r) => r.answers ?? []).concat(extra);
  let number = 1;
  let streak = 0;
  for (const answer of answers) {
    if (number >= CLASS_NAMES.length) break;
    if (LEVEL_ORDER.indexOf(answer.level) < LEVEL_ORDER.indexOf(classLevel(number))) continue;
    if (answer.verdict === 'almost' || (answer.verdict === 'correct' && answer.hinted)) continue;
    streak = answer.verdict === 'correct' ? streak + 1 : 0;
    if (streak >= PROMOTION_STREAK) {
      number++;
      streak = 0;
    }
  }
  return {
    number,
    name: CLASS_NAMES[number - 1],
    level: classLevel(number),
    next: CLASS_NAMES[number] ?? null,
    streak,
  };
}

/** Share of the way to the next class, 0…1: the run so far out of PROMOTION_STREAK. */
export function classProgress(state: ClassState): number {
  return state.next ? Math.min(1, state.streak / PROMOTION_STREAK) : 1;
}

/** Where a level opens: its class number. */
export function levelOpening(level: Level) {
  return { classNumber: LEVEL_CLASS[level] };
}

/** Levels open in a class, easiest first; always at least A1. */
export function openLevels(state: ClassState): Level[] {
  return LEVEL_ORDER.filter((level) => LEVEL_CLASS[level] <= state.number);
}

/** "во 2 классе", "в 4 классе". */
export function inClass(classNumber: number): string {
  return `${classNumber === 2 ? 'во' : 'в'} ${classNumber} классе`;
}

/** Local calendar day, so a lesson at 23:30 counts for that evening, not for UTC. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function daysBefore(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() - days);
}

export function answeredOn(records: LessonRecord[], day: Date): number {
  const key = dayKey(day);
  return records.filter((r) => dayKey(new Date(r.addedAt)) === key).reduce((sum, r) => sum + r.answered, 0);
}

/** How the day's answers went; "Не знаю" counts among the wrong ones. */
export function verdictsOn(records: LessonRecord[], day: Date): Record<Verdict, number> {
  const key = dayKey(day);
  const counts = { correct: 0, almost: 0, wrong: 0 };
  for (const r of records) {
    if (dayKey(new Date(r.addedAt)) !== key) continue;
    counts.correct += r.correct;
    counts.almost += r.almost;
    counts.wrong += r.wrong;
  }
  return counts;
}

export interface Streak {
  /** Days with at least one finished lesson, counted back without a break. */
  days: number;
  doneToday: boolean;
  /** Yesterday was missed and forgiven: today has to count, or the streak ends. */
  skippedYesterday: boolean;
}

/**
 * Days in a row with a finished lesson. Today not being done yet doesn't end the streak, and one missed day
 * per 7 is forgiven, so a single busy evening doesn't wipe out weeks of practice.
 */
export function streakOf(records: LessonRecord[], now = new Date()): Streak {
  const days = new Set(records.map((r) => dayKey(new Date(r.addedAt))));
  const practised = (offset: number) => days.has(dayKey(daysBefore(now, offset)));
  const doneToday = practised(0);

  let count = 0;
  let offset = doneToday ? 0 : 1;
  let lastSkip: number | null = null;
  let skippedYesterday = false;
  for (;;) {
    if (practised(offset)) {
      count++;
      offset++;
    } else if ((lastSkip === null || offset - lastSkip >= 7) && practised(offset + 1)) {
      if (offset === 1) skippedYesterday = true;
      lastSkip = offset;
      offset++;
    } else {
      break;
    }
  }
  return { days: count, doneToday, skippedYesterday: skippedYesterday && !doneToday && count > 0 };
}
