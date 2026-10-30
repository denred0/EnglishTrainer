import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '../api';
import { lessonStats, levelsText } from '../lib/lesson';
import { classOf, lessonAnswers, lessonPoints, openLevels } from '../lib/progress';
import { loadSession, loadSettings, type Session } from '../lib/session';
import { save } from '../lib/storage';
import { plural } from '../lib/text';
import { chosenTopics, topicsText, useTopics } from '../lib/topics';
import { useDictionary } from '../state/dictionary';
import { useHistory } from '../state/history';
import { useSaved } from '../state/saved';
import { useToast } from '../state/toast';
import type { Sentence, Settings, Status } from '../types';
import { Exercise } from './Exercise';
import { ChoppingScreen } from './Lumberjack';
import { LessonChat } from './LessonChat';
import { ChatIcon } from './Marks';
import { Progress } from './Progress';
import { Results } from './Results';
import { lessonLevels, Setup } from './Setup';

function shuffle<T>(list: T[]): T[] {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/** Drops saved sentences into random places among the new ones, which keep their easy-to-hard order. */
function mixIn(fresh: Sentence[], saved: Sentence[]): Sentence[] {
  const result = [...fresh];
  for (const sentence of saved) result.splice(Math.floor(Math.random() * (result.length + 1)), 0, sentence);
  return result;
}

export function Practice({ status }: { status: Status | null }) {
  const notify = useToast();
  const { records, put: putRecord } = useHistory();
  const { entries } = useDictionary();
  const { entries: savedEntries } = useSaved();
  const [settings, setSettings] = useState<Settings>(loadSettings);
  const [session, setSession] = useState<Session | null>(loadSession);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set synchronously, unlike `loading`, so a second click before the re-render can't start another request.
  const starting = useRef(false);
  // The sentence request in flight, so the chopping screen can cancel it.
  const generation = useRef<AbortController | null>(null);
  const { groups: topicGroups } = useTopics();
  const [chatOpen, setChatOpen] = useState(false);
  const chatToggleRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    save('settings', settings);
  }, [settings]);
  useEffect(() => {
    save('session', session);
  }, [session]);

  // Put a finished lesson into the history. The server keeps one record per session id, so sending it twice
  // (StrictMode, a reload before the reply) is harmless.
  useEffect(() => {
    if (!session?.finished || session.recorded || session.attempts.length === 0) return;
    const { correct, almost, wrong, grade } = lessonStats(session.attempts);
    api
      .recordLesson({
        sessionId: session.id,
        grade,
        points: lessonPoints(session.sentences, session.attempts, grade),
        total: session.sentences.length,
        answered: session.attempts.length,
        correct,
        almost,
        wrong,
        levels: session.levels ?? session.settings.levels,
        withWords: Boolean(session.withWords),
        withSaved: Boolean(session.withSaved),
        answers: lessonAnswers(session.sentences, session.attempts),
      })
      .then((entry) => {
        putRecord(entry);
        setSession((s) => (s && s.id === session.id ? { ...s, recorded: true } : s));
      })
      .catch((err: Error) => notify({ message: `Занятие не попало в историю: ${err.message}`, tone: 'error' }));
  }, [session, notify, putRecord]);

  async function start(next: Settings) {
    if (starting.current) return;
    starting.current = true;
    const words = next.useWords
      ? entries.filter((e) => !next.excludedWords.includes(e.id)).map((e) => ({ word: e.word, translation: e.translation }))
      : [];
    const fromSaved: Sentence[] = next.useSaved
      ? shuffle(savedEntries)
          .slice(0, next.count)
          .map(({ ru, en, alternatives, level, grammar }) => ({ ru, en, alternatives, level, grammar }))
      : [];
    const freshCount = next.count - fromSaved.length;
    // Only levels opened by the class; the settings keep the choice, so a level opened later joins "Любой" by itself.
    const levels = lessonLevels(next.levels, openLevels(classOf(records ?? [])));
    // The server leaves out topics above the lesson's levels too; here they're dropped for the summary line.
    const topics = topicGroups ? chosenTopics(next.topics, topicGroups, levels).fit : [];
    const controller = new AbortController();
    generation.current = controller;
    setLoading(true);
    setError(null);
    try {
      // Without the catalogue (it failed to load) the ids go as they are, and the server sorts them out.
      const topicIds = topicGroups ? topics.map((t) => t.id) : next.topics;
      const fresh = freshCount > 0 ? await api.sentences(freshCount, levels, words, topicIds, controller.signal) : [];
      const sentences = mixIn(fresh, fromSaved);
      if (sentences.length === 0) throw new Error('Модель не вернула ни одного предложения. Попробуй ещё раз.');
      setSession({
        id: crypto.randomUUID(),
        settings: next,
        levels,
        sentences,
        attempts: [],
        index: 0,
        finished: false,
        ...(fresh.length > 0 && topics.length > 0 && { topicNames: topics.map((t) => t.name) }),
        withWords: fresh.length > 0 && words.length > 0,
        withSaved: fromSaved.length > 0,
      });
      window.scrollTo({ top: 0 });
    } catch (err) {
      if (!controller.signal.aborted) setError((err as Error).message);
    } finally {
      generation.current = null;
      starting.current = false;
      setLoading(false);
    }
  }

  const cancelGeneration = useCallback(() => generation.current?.abort(), []);
  const chopping = loading && <ChoppingScreen onCancel={cancelGeneration} />;

  if (!session) {
    return (
      <>
        {chopping}
        <Setup
          settings={settings}
          status={status}
          loading={loading}
          error={error}
          onChange={setSettings}
          onStart={() => start(settings)}
        />
      </>
    );
  }

  const { sentences, attempts, index } = session;
  const total = sentences.length;
  const levelText = levelsText(session.levels ?? session.settings.levels);

  // Functional updates: a check that resolves after the lesson was finished must not reopen it.
  const update = (change: (current: Session) => Session) =>
    setSession((current) => (current && !current.finished ? change(current) : current));

  return (
    <div className="session">
      {chopping}
      <div className="session__bar">
        <p className="session__summary">
          {total} {plural(total, ['предложение', 'предложения', 'предложений'])}, {levelText}
          {session.topicNames &&
            `, ${session.topicNames.length === 1 ? 'тема' : 'темы'}: ${topicsText(session.topicNames)}`}
          {session.withSaved && ', с сохранёнными'}
          {session.withWords && ', со словами из словаря'}
        </p>
        <div className="session__actions">
          <button
            ref={chatToggleRef}
            type="button"
            className="button button--quiet"
            aria-expanded={chatOpen}
            aria-controls="lesson-chat"
            onClick={() => setChatOpen((o) => !o)}
          >
            <ChatIcon />
            Спросить
          </button>
          {!session.finished && (
            <button
              type="button"
              className="button button--quiet"
              onClick={() => update((s) => ({ ...s, finished: true }))}
              disabled={loading || attempts.length === 0}
              title={attempts.length === 0 ? 'Сначала ответь хотя бы на одно предложение' : undefined}
            >
              Закончить урок
            </button>
          )}
          <button type="button" className="button button--quiet" onClick={() => setSession(null)} disabled={loading}>
            Новое занятие
          </button>
        </div>
      </div>

      {session.finished ? (
        <Results
          key="results"
          sessionId={session.id}
          dailyGoal={settings.dailyGoal}
          sentences={sentences}
          attempts={attempts}
          repeatCount={session.settings.count}
          loading={loading}
          error={error}
          onRepeat={() => start(session.settings)}
          onChangeSettings={() => setSession(null)}
        />
      ) : (
        <div className="sheet" key="sheet">
          <Progress
            total={total}
            current={index}
            attempts={attempts}
            reached={Math.max(session.reached ?? 0, index)}
            onGo={(i) => update((s) => (i <= Math.max(s.reached ?? 0, s.index) ? { ...s, index: i } : s))}
          />
          <Exercise
            key={index}
            sentence={sentences[index]}
            attempt={attempts[index]}
            hints={attempts[index]?.hints ?? session.hints ?? []}
            effort={settings.checkEffort}
            isLast={index === total - 1}
            onAnswer={(attempt) =>
              update((s) => {
                const hints = s.hints?.length ? { hints: s.hints } : {};
                return { ...s, attempts: [...s.attempts.slice(0, s.index), { ...attempt, ...hints }], hints: [] };
              })
            }
            onHint={(hint) =>
              update((s) =>
                s.index === index && !s.attempts[index]
                  ? { ...s, hints: [...(s.hints ?? []).filter((h) => h.at !== hint.at), hint] }
                  : s,
              )
            }
            onNext={() =>
              update((s) =>
                s.index === total - 1
                  ? { ...s, finished: true }
                  : { ...s, index: s.index + 1, reached: Math.max(s.reached ?? 0, s.index + 1) },
              )
            }
          />
        </div>
      )}

      <LessonChat
        key={session.id}
        session={session}
        open={chatOpen}
        onClose={() => {
          setChatOpen(false);
          chatToggleRef.current?.focus();
        }}
        onChat={(change) =>
          setSession((s) => (s && s.id === session.id ? { ...s, chat: change(s.chat ?? []) } : s))
        }
      />
    </div>
  );
}
