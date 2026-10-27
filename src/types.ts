export const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'] as const;
export type Level = (typeof LEVELS)[number];
export interface Settings {
  count: number;
  /** Levels to mix in the lesson; empty means any level. */
  levels: Level[];
  /** Build every sentence around a word from the dictionary. */
  useWords: boolean;
  /** Dictionary entries the learner unticked; words added later start out selected. */
  excludedWords: string[];
  /** Mix saved sentences into the lesson. */
  useSaved: boolean;
  /** Ids of the topics the lesson is about; empty means any. Ones above the lesson's levels are left out. */
  topics: string[];
  /** Sentences a day to aim for. */
  dailyGoal: number;
  /** How hard the model thinks when checking answers; null keeps OPENAI_REASONING_EFFORT from .env. */
  checkEffort: string | null;
}

/** Something a lesson can be about; `level` is the lowest level it can be picked for. */
export interface Topic {
  id: string;
  name: string;
  level: Level;
}

/** A group in the topic picker. `topic` is what sentences talk about, `grammar` what they practise. */
export interface TopicGroup {
  id: string;
  name: string;
  kind: 'topic' | 'grammar';
  topics: Topic[];
}

export interface PracticeWord {
  word: string;
  translation: string;
}

export interface Sentence {
  ru: string;
  en: string;
  alternatives: string[];
  level: Level;
  /** Grammar the translation practises ("Present Perfect"); missing on sentences from before it was asked for. */
  grammar?: string[];
}

export interface SavedSentence extends Sentence {
  id: string;
  addedAt: string;
}

export type Verdict = 'correct' | 'almost' | 'wrong';

/** One correction in the learner's answer and the reason for it. */
export interface CorrectionNote {
  /** The learner's words; empty when something was missing. */
  wrong: string;
  /** What replaced them; empty when the words had to go. */
  right: string;
  why: string;
}

export interface CheckResult {
  verdict: Verdict;
  corrected: string;
  notes: CorrectionNote[];
  /** Single-line explanation from checks made before `notes` existed (lessons saved in the browser). */
  explanation?: string;
}

/** The English for a Russian word, looked up while translating. */
export interface Hint {
  /** Position of the word among the sentence's words, so a repeated word is marked where it was clicked. */
  at: number;
  ru: string;
  /** Dictionary form ("fall asleep"); empty when English has no separate word for it. */
  word: string;
  /** As written in the reference translation ("fell asleep"). */
  form: string;
  /** A remark in Russian, usually empty. */
  note: string;
}

export interface Attempt {
  answer: string;
  result: CheckResult;
  /** The answer matched a reference translation without asking the model. */
  exact: boolean;
  /** Words looked up before answering; the sentence then earns half the points. */
  hints?: Hint[];
}

/** One message in the lesson's chat with the tutor. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  /** For the learner's messages: the sentence on screen when they asked; null on the results page. */
  at?: number | null;
  /** For the tutor's: questions it suggests asking next. */
  followUps?: string[];
}

/** A sentence of the lesson as the tutor gets it; `answer` is null until answered and empty after "Не знаю". */
export interface ChatSentence {
  ru: string;
  en: string;
  alternatives: string[];
  level: Level;
  grammar: string[];
  hints: string[];
  answer: string | null;
  verdict?: Verdict;
  corrected?: string;
  notes?: CorrectionNote[];
}

export interface DictionaryEntry {
  id: string;
  word: string;
  form: string;
  transcription: string;
  partOfSpeech: string;
  translation: string;
  example: string;
  exampleRu: string;
  addedAt: string;
}

/** One answered sentence of a finished lesson, for working out the class. */
export interface LessonAnswer {
  level: Level;
  /** "Не знаю" is stored as wrong. */
  verdict: Verdict;
  hinted?: boolean;
}

/** A finished lesson, as shown in the history. */
export interface LessonRecord {
  id: string;
  sessionId: string;
  addedAt: string;
  grade: number;
  /** Missing on lessons recorded before points existed. */
  points?: number;
  /** Sentences in the lesson; more than `answered` when it was finished early. */
  total: number;
  answered: number;
  correct: number;
  almost: number;
  wrong: number;
  levels: Level[];
  withWords: boolean;
  withSaved: boolean;
  /** Missing on lessons recorded before answers were kept one by one; those don't count towards the class. */
  answers?: LessonAnswer[];
}

export interface Status {
  model: string;
  demo: boolean;
  hasKey: boolean;
  /** OPENAI_REASONING_EFFORT, or null for the model's own default. */
  checkEffort: string | null;
  efforts: string[];
}
