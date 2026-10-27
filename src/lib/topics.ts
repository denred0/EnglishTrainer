import { useEffect, useState } from 'react';
import { api } from '../api';
import { LEVELS, type Level, type Topic, type TopicGroup } from '../types';

// The catalogue doesn't change while the app runs: loaded once, shared by the setup and the lesson.
let loading: Promise<TopicGroup[]> | null = null;

export function useTopics(): { groups: TopicGroup[] | null; error: string | null } {
  const [groups, setGroups] = useState<TopicGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    loading ??= api.topics();
    loading.then(
      (g) => current && setGroups(g),
      (err: Error) => {
        loading = null;
        if (current) setError(err.message);
      },
    );
    return () => {
      current = false;
    };
  }, []);
  return { groups, error };
}

/** Whether a topic fits a lesson of these levels: its level must not be above the highest of them. */
export function fitsLevels(topic: Topic, levels: Level[]): boolean {
  return LEVELS.indexOf(topic.level) <= Math.max(...levels.map((l) => LEVELS.indexOf(l)));
}

/** The chosen topics, in catalogue order, split by whether a lesson of these levels can have them. */
export function chosenTopics(ids: string[], groups: TopicGroup[], levels: Level[]): { fit: Topic[]; tooHard: Topic[] } {
  const chosen = groups.flatMap((g) => g.topics).filter((t) => ids.includes(t.id));
  return { fit: chosen.filter((t) => fitsLevels(t, levels)), tooHard: chosen.filter((t) => !fitsLevels(t, levels)) };
}

/** "Погода", "Погода и Офис", "Погода, Офис и ещё 3". */
export function topicsText(names: string[]): string {
  if (names.length <= 2) return names.join(' и ');
  return `${names.slice(0, 2).join(', ')} и ещё ${names.length - 2}`;
}
