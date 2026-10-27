import type { Attempt, Level } from '../types';
import { plural } from './text';

/** Counts by verdict and the school grade: "almost" counts as half a correct answer. */
export function lessonStats(attempts: Attempt[]) {
  const correct = attempts.filter((a) => a.result.verdict === 'correct').length;
  const almost = attempts.filter((a) => a.result.verdict === 'almost').length;
  const wrong = attempts.length - correct - almost;
  const share = attempts.length ? (correct + almost / 2) / attempts.length : 0;
  const grade = share >= 0.9 ? 5 : share >= 0.75 ? 4 : share >= 0.5 ? 3 : 2;
  return { correct, almost, wrong, grade };
}

export function levelsText(levels: Level[]) {
  if (levels.length === 0) return 'любой уровень';
  return `${plural(levels.length, ['уровень', 'уровни', 'уровни'])} ${levels.join(', ')}`;
}
