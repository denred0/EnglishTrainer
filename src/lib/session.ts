// Lesson settings and the lesson in progress, kept in the browser so a reload or a trip to another page
// doesn't lose them. Shared by the practice page and the home page.
import { LEVELS, type Attempt, type ChatMessage, type Hint, type Level, type Sentence, type Settings } from '../types';
import { load } from './storage';

export interface Session {
  id: string;
  settings: Settings;
  /** Levels the new sentences were written for: the chosen open ones. Missing in lessons from before levels opened by class. */
  levels?: Level[];
  sentences: Sentence[];
  attempts: Attempt[];
  /** The sentence on screen. */
  index: number;
  /** The furthest sentence opened, which `index` may go back from; missing in lessons from before going back existed. */
  reached?: number;
  finished: boolean;
  /** Words looked up in the current sentence before it was answered; they move into its attempt. */
  hints?: Hint[];
  /** Names of the chosen topics that went into the lesson, for its summary line. */
  topicNames?: string[];
  /** The conversation with the tutor; each lesson starts a new one. */
  chat?: ChatMessage[];
  withWords?: boolean;
  withSaved?: boolean;
  /** The finished lesson is in the history. */
  recorded?: boolean;
}

const DEFAULT_SETTINGS: Settings = {
  count: 10,
  levels: [],
  useWords: false,
  excludedWords: [],
  useSaved: false,
  topics: [],
  dailyGoal: 10,
  checkEffort: null,
};

/** Fills in defaults; settings saved before several levels could be chosen have a single `level` instead. */
function withDefaults(stored: Partial<Settings> & { level?: string }): Settings {
  const { level, ...rest } = stored;
  const levels = rest.levels ?? (LEVELS.includes(level as Level) ? [level as Level] : []);
  return { ...DEFAULT_SETTINGS, ...rest, levels };
}

export function loadSettings(): Settings {
  return withDefaults(load('settings', {}));
}

/** The stored lesson, or null; a finished one already in the history is done with. */
export function loadSession(): Session | null {
  const session = load<Session | null>('session', null);
  if (!session || (session.finished && session.recorded)) return null;
  return { ...session, id: session.id ?? crypto.randomUUID(), settings: withDefaults(session.settings) };
}
