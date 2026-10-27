import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import Markdown, { type Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { api } from '../api';
import type { Session } from '../lib/session';
import type { ChatMessage, ChatSentence } from '../types';
import { CloseIcon, Spinner } from './Marks';

interface Props {
  session: Session;
  open: boolean;
  onClose: () => void;
  /** Changes the lesson's conversation, which lives in the session. */
  onChat: (change: (messages: ChatMessage[]) => ChatMessage[]) => void;
}

/** The sentences reached so far, with how each went: what the tutor knows about the lesson. */
function lessonForChat(session: Session): { lesson: ChatSentence[]; current: number | null } {
  const current = session.finished ? null : session.index;
  const reached = session.finished ? session.attempts.length : session.index + 1;
  const lesson = session.sentences.slice(0, reached).map((s, i): ChatSentence => {
    const attempt = session.attempts[i];
    const hints = (attempt ? attempt.hints : i === current ? session.hints : undefined) ?? [];
    return {
      ru: s.ru,
      en: s.en,
      alternatives: s.alternatives,
      level: s.level,
      grammar: s.grammar ?? [],
      hints: hints.filter((h) => h.word).map((h) => `${h.ru} → ${h.word}`),
      answer: attempt ? attempt.answer : null,
      ...(attempt && { verdict: attempt.result.verdict, corrected: attempt.result.corrected, notes: attempt.result.notes ?? [] }),
    };
  });
  return { lesson, current };
}

/** Questions to start with when the model can't suggest its own: general ones, fitting what is on screen. */
function fallbackStarters(session: Session): string[] {
  if (session.finished) return ['Какие ошибки у меня повторялись?', 'Что повторить после этого урока?'];
  const sentence = session.sentences[session.index];
  const attempt = session.attempts[session.index];
  const list: string[] = [];
  if (!attempt) list.push('С чего начать перевод этого предложения?');
  else if (attempt.answer && attempt.result.verdict !== 'correct') list.push('Почему мой вариант не подходит?');
  else list.push('Как ещё можно это перевести?');
  if (sentence.grammar?.[0]) list.push(`Объясни ${sentence.grammar[0]} на примерах`);
  return list;
}

// After its answer the tutor writes this line and the questions it suggests next (CHAT_PROMPT in server/ai.js).
const FOLLOW_UPS = '%%follow-ups%%';

/**
 * Splits the tutor's text into the answer and the suggested questions. While the text is still coming (`done`
 * false), a half-written marker at the end is held back, so it never flashes on screen.
 */
function splitAnswer(text: string, done: boolean): { answer: string; followUps: string[] } {
  const at = text.indexOf(FOLLOW_UPS);
  if (at === -1) {
    if (!done) {
      for (let n = Math.min(FOLLOW_UPS.length - 1, text.length); n > 0; n--) {
        if (FOLLOW_UPS.startsWith(text.slice(-n))) return { answer: text.slice(0, -n), followUps: [] };
      }
    }
    return { answer: text, followUps: [] };
  }
  const followUps = text
    .slice(at + FOLLOW_UPS.length)
    .split('\n')
    // Buttons show plain text: list markers and any stray Markdown emphasis go.
    .map((line) => line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/\*\*|__|`/g, '').trim())
    .filter(Boolean)
    .slice(0, 3);
  return { answer: text.slice(0, at).trimEnd(), followUps: done ? followUps : [] };
}

const MARKDOWN: Components = {
  a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noreferrer" />,
};

function Answer({ text }: { text: string }) {
  return (
    <div className="chat__msg chat__msg--tutor markdown">
      <Markdown remarkPlugins={[remarkGfm]} components={MARKDOWN}>
        {text}
      </Markdown>
    </div>
  );
}

/** The lesson's chat with the tutor, in a panel beside the lesson. Stays mounted while closed, so an answer keeps coming. */
export function LessonChat({ session, open, onClose, onChat }: Props) {
  const messages = session.chat ?? [];
  const [draft, setDraft] = useState('');
  /** The answer being written: null when nothing is asked, '' before the first words arrive. */
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const controller = useRef<AbortController | null>(null);
  // Follow the answer down as it grows, unless the learner has scrolled up to read something.
  const stick = useRef(true);

  useEffect(() => () => controller.current?.abort(), []);

  // While the chat is empty, the model suggests questions about the sentence on screen: asked when the chat is
  // opened, and again once the sentence is answered or the next one comes, since the questions differ.
  const startersFor = session.finished ? 'end' : `${session.index}:${session.attempts[session.index] ? 'answered' : 'open'}`;
  const [starters, setStarters] = useState<{ for: string; questions: string[] | null } | null>(null);
  useEffect(() => {
    if (!open || messages.length > 0 || starters?.for === startersFor) return;
    setStarters({ for: startersFor, questions: null });
    const settle = (questions: string[]) =>
      setStarters((s) => (s?.for === startersFor ? { for: startersFor, questions: questions.length ? questions : fallbackStarters(session) } : s));
    api.chatStarters(lessonForChat(session)).then(settle, () => settle([]));
    // Not on `session`: it changes with every hint and message, and what matters here is captured by startersFor.
  }, [open, messages.length, startersFor]);

  useEffect(() => {
    if (open) inputRef.current?.focus({ preventScroll: true });
  }, [open]);

  useEffect(() => {
    const list = listRef.current;
    if (list && stick.current) list.scrollTop = list.scrollHeight;
  }, [messages.length, pending, open]);

  async function send(text: string) {
    const content = text.trim();
    if (!content || pending !== null) return;
    const question: ChatMessage = { role: 'user', content, at: session.finished ? null : session.index };
    const { lesson, current } = lessonForChat(session);
    const abort = new AbortController();
    controller.current = abort;
    stick.current = true;
    onChat((m) => [...m, question]);
    setDraft('');
    setError(null);
    setPending('');
    try {
      const text = await api.chat({ lesson, current, messages: [...messages, question] }, setPending, abort.signal);
      // A stopped answer may end mid-question, so its suggestions are dropped.
      const { answer, followUps } = splitAnswer(text, !abort.signal.aborted);
      if (answer.trim()) {
        onChat((m) => [...m, { role: 'assistant', content: answer, ...(followUps.length > 0 && { followUps }) }]);
      } else if (abort.signal.aborted) {
        // Stopped before a word came: as if the question was never sent.
        onChat((m) => m.filter((x) => x !== question));
        setDraft(content);
      }
    } catch (err) {
      onChat((m) => m.filter((x) => x !== question));
      setDraft(content);
      setError((err as Error).message);
    } finally {
      if (controller.current === abort) controller.current = null;
      setPending(null);
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    if (pending !== null) controller.current?.abort();
    else void send(draft);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void send(draft);
    }
  }

  function onPanelKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
    }
  }

  const busy = pending !== null;
  const shownPending = pending && splitAnswer(pending, false).answer;
  // Only the latest answer offers its next questions.
  const last = messages.at(-1);
  const lastFollowUps = (last?.role === 'assistant' && last.followUps) || [];
  let shownAt: number | null | undefined;

  return (
    <aside className="chat" id="lesson-chat" aria-labelledby="chat-title" hidden={!open} onKeyDown={onPanelKeyDown}>
      <header className="chat__header">
        <div>
          <h2 className="chat__title" id="chat-title">Помощник</h2>
          <p className="chat__subtitle">Спроси про этот урок. Новый урок — новый разговор.</p>
        </div>
        <button type="button" className="icon-button" onClick={onClose} aria-label="Закрыть помощника">
          <CloseIcon />
        </button>
      </header>

      <div
        className="chat__list"
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {messages.length === 0 && !busy && (
          <div className="chat__empty">
            <p>
              {session.finished
                ? 'Спроси что угодно про этот урок. Например:'
                : `Спроси что угодно про предложение ${session.index + 1}. Например:`}
            </p>
            {starters?.for === startersFor && starters.questions ? (
              <div className="chat__suggestions">
                {starters.questions.map((s) => (
                  <button key={s} type="button" className="chat__suggestion" onClick={() => void send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            ) : (
              <p className="chat__thinking">
                <Spinner />
                Подбираю вопросы…
              </p>
            )}
          </div>
        )}

        {messages.map((m, i) => {
          if (m.role === 'assistant') return <Answer key={i} text={m.content} />;
          // Which sentence the question was about, whenever that changes.
          const label = m.at !== shownAt;
          shownAt = m.at;
          return (
            <div key={i} className="chat__question">
              {label && <p className="chat__at">{m.at == null ? 'После урока' : `Предложение ${m.at + 1}`}</p>}
              <p className="chat__msg chat__msg--user">{m.content}</p>
            </div>
          );
        })}

        {!busy && lastFollowUps.length > 0 && (
          <div className="chat__suggestions chat__follow-ups" role="group" aria-label="Что ещё спросить">
            {lastFollowUps.map((s) => (
              <button key={s} type="button" className="chat__suggestion" onClick={() => void send(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {busy &&
          (shownPending ? (
            <Answer text={shownPending} />
          ) : (
            <p className="chat__thinking">
              <Spinner />
              Думаю…
            </p>
          ))}
      </div>

      <p className="visually-hidden" role="status">
        {busy ? 'Помощник отвечает' : ''}
      </p>

      <form className="chat__form" onSubmit={submit}>
        {error && (
          <p className="form-error chat__error" role="alert">
            {error}
          </p>
        )}
        <label className="visually-hidden" htmlFor="chat-input">
          Вопрос помощнику
        </label>
        <textarea
          ref={inputRef}
          id="chat-input"
          className="chat__input"
          rows={1}
          placeholder="Твой вопрос"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="button button--primary chat__send" disabled={!busy && !draft.trim()}>
          {busy ? 'Стоп' : 'Спросить'}
        </button>
      </form>
    </aside>
  );
}
