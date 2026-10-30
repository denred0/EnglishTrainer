import type { ChatMessage, ChatSentence, CheckResult, DictionaryEntry, Hint, LessonRecord, Level, PracticeWord, SavedSentence, Sentence, Status, TopicGroup } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: init?.body ? { 'Content-Type': 'application/json' } : undefined,
    });
  } catch {
    throw new Error('Сервер не отвечает. Проверь, что запущен npm run dev.');
  }
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(data?.error ?? `Сервер ответил ошибкой ${response.status}.`);
  }
  return data as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

// The API server may still be starting when the page first loads (npm run dev starts both at once).
async function get<T>(url: string, attempts = 4): Promise<T> {
  for (let i = 1; ; i++) {
    try {
      return await request<T>(url);
    } catch (err) {
      if (i >= attempts) throw err;
      await new Promise((resolve) => setTimeout(resolve, 600 * i));
    }
  }
}

export const api = {
  status: () => get<Status>('/api/status'),

  sentences: (count: number, levels: Level[], words: PracticeWord[], topics: string[], signal?: AbortSignal) =>
    request<{ sentences: Sentence[] }>('/api/sentences', { ...post({ count, levels, words, topics }), signal }).then(
      (r) => r.sentences,
    ),

  topics: () => get<{ groups: TopicGroup[] }>('/api/topics').then((r) => r.groups),

  check: (ru: string, references: string[], answer: string, effort: string | null) =>
    request<CheckResult>('/api/check', post({ ru, references, answer, effort: effort ?? undefined })),

  /** `marked` is the Russian sentence with the asked-about word in [brackets]. */
  hint: (marked: string, references: string[]) =>
    request<Pick<Hint, 'word' | 'form' | 'note'>>('/api/hint', post({ marked, references })),

  /** Questions to start the chat with, about the sentence on screen. */
  chatStarters: (body: { lesson: ChatSentence[]; current: number | null }) =>
    request<{ questions: string[] }>('/api/chat/starters', post(body)).then((r) => r.questions),

  /**
   * Asks the tutor; `onText` gets the answer so far each time more of it arrives. Resolves to the whole answer.
   * An abort through `signal` resolves to what had arrived by then.
   */
  async chat(
    body: { lesson: ChatSentence[]; current: number | null; messages: ChatMessage[] },
    onText: (text: string) => void,
    signal: AbortSignal,
  ): Promise<string> {
    let response: Response;
    try {
      response = await fetch('/api/chat', { ...post(body), headers: { 'Content-Type': 'application/json' }, signal });
    } catch (err) {
      if (signal.aborted) return '';
      throw new Error('Сервер не отвечает. Проверь, что запущен npm run dev.', { cause: err });
    }
    if (!response.ok || !response.body) {
      const data = await response.json().catch(() => null);
      throw new Error(data?.error ?? `Сервер ответил ошибкой ${response.status}.`);
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let text = '';
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) return text;
        text += value;
        onText(text);
      }
    } catch (err) {
      if (signal.aborted) return text;
      throw new Error('Ответ оборвался на середине.', { cause: err });
    }
  },

  dictionary: () => get<{ entries: DictionaryEntry[] }>('/api/dictionary').then((r) => r.entries),

  addWord: (form: string, sentence: string, sentenceRu: string) =>
    request<{ entry: DictionaryEntry }>('/api/dictionary', post({ form, sentence, sentenceRu })).then((r) => r.entry),

  addTypedWord: (typed: string) =>
    request<{ entry: DictionaryEntry }>('/api/dictionary', post({ typed })).then((r) => r.entry),

  restoreWord: (entry: DictionaryEntry) =>
    request<{ entry: DictionaryEntry }>('/api/dictionary/restore', post({ entry })).then((r) => r.entry),

  removeWord: (id: string) => request<{ ok: true }>(`/api/dictionary/${id}`, { method: 'DELETE' }),

  saved: () => get<{ entries: SavedSentence[] }>('/api/saved').then((r) => r.entries),

  saveSentence: ({ ru, en, alternatives, level, grammar }: Sentence) =>
    request<{ entry: SavedSentence }>('/api/saved', post({ sentence: { ru, en, alternatives, level, grammar } })).then((r) => r.entry),

  restoreSaved: (entry: SavedSentence) =>
    request<{ entry: SavedSentence }>('/api/saved/restore', post({ entry })).then((r) => r.entry),

  removeSaved: (id: string) => request<{ ok: true }>(`/api/saved/${id}`, { method: 'DELETE' }),

  history: () => get<{ entries: LessonRecord[] }>('/api/history').then((r) => r.entries),

  resetHistory: () => request<{ ok: true }>('/api/history', { method: 'DELETE' }),

  recordLesson: (record: Omit<LessonRecord, 'id' | 'addedAt'> & { points: number }) =>
    request<{ entry: LessonRecord }>('/api/history', post({ record })).then((r) => r.entry),
};
