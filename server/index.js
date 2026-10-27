import express from 'express';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createAi } from './ai.js';
import { createDemoAi } from './demo.js';
import { JsonStore } from './store.js';
import { TOPIC_GROUPS, topicById } from './topics.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const demo = process.argv.includes('--demo') || process.env.DEMO === '1';
const port = Number(process.env.API_PORT) || 3001;
const model = process.env.OPENAI_MODEL || 'gpt-6-luna';

const checkEffort = process.env.OPENAI_REASONING_EFFORT || null;
const ai = demo ? createDemoAi() : createAi({ model, checkEffort: checkEffort ?? undefined });
// The learner's dictionary, saved sentences and history: data/ unless DATA_DIR points elsewhere.
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(root, 'data');
const dictionary = new JsonStore(path.join(dataDir, 'dictionary.json'), (e) => e.word.toLowerCase());
const saved = new JsonStore(path.join(dataDir, 'sentences.json'), (s) => s.ru.trim());
const history = new JsonStore(path.join(dataDir, 'history.json'), (h) => h.sessionId);

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
// Reasoning levels the settings page offers for answer checking.
const EFFORTS = ['none', 'low', 'medium', 'high', 'xhigh', 'max'];

const app = express();
// The chat sends its whole conversation with every question.
app.use(express.json({ limit: '1mb' }));

app.get('/api/status', (_req, res) => {
  res.json({ model, demo, hasKey: demo || Boolean(process.env.OPENAI_API_KEY), checkEffort, efforts: EFFORTS });
});

app.post('/api/sentences', async (req, res) => {
  const count = clamp(Number(req.body?.count) || 10, 1, 30);
  // No levels means any level.
  const levels = (Array.isArray(req.body?.levels) ? req.body.levels : []).filter((l) => LEVELS.includes(l));
  const words = (Array.isArray(req.body?.words) ? req.body.words : [])
    .filter((w) => text(w?.word) && w.word.length <= 80)
    .slice(0, 500)
    .map((w) => ({ word: w.word.trim(), translation: typeof w.translation === 'string' ? w.translation.slice(0, 120) : '' }));
  // Only topics the lesson's levels reach: a B1 topic can't go into an A1 lesson.
  const highest = levels.length ? Math.max(...levels.map((l) => LEVELS.indexOf(l))) : LEVELS.length - 1;
  const topics = (Array.isArray(req.body?.topics) ? req.body.topics : [])
    .map(topicById)
    .filter((t) => t && LEVELS.indexOf(t.level) <= highest);
  res.json({ sentences: await ai.generateSentences({ count, levels, words, topics }) });
});

// What lessons can be about, for the topic picker.
app.get('/api/topics', (_req, res) => {
  res.json({
    groups: TOPIC_GROUPS.map(({ id, name, kind, topics }) => ({
      id,
      name,
      kind,
      topics: topics.map(({ id, name, level }) => ({ id, name, level })),
    })),
  });
});

app.post('/api/check', async (req, res) => {
  const { ru, references, answer, effort } = req.body ?? {};
  if (!text(ru) || !Array.isArray(references) || !references.every(text) || !text(answer)) {
    return res.status(400).json({ error: 'Нужны поля ru, references и answer.' });
  }
  // From the settings page; without it the check uses OPENAI_REASONING_EFFORT.
  const chosen = EFFORTS.includes(effort) ? effort : undefined;
  res.json(await ai.checkAnswer({ ru, references, answer, effort: chosen }));
});

// The English for one Russian word while the learner is still translating; `marked` has that word in [brackets].
app.post('/api/hint', async (req, res) => {
  const { marked, references } = req.body ?? {};
  if (!text(marked) || !/\[[^\]]+\]/.test(marked) || !Array.isArray(references) || !references.every(text)) {
    return res.status(400).json({ error: 'Нужны поля marked (слово в квадратных скобках) и references.' });
  }
  res.json(await ai.hintWord({ marked, references: references.slice(0, 5) }));
});

// Questions to offer when the chat opens empty, about the sentence on screen.
app.post('/api/chat/starters', async (req, res) => {
  const { lesson, current } = req.body ?? {};
  if (!validLesson(lesson, current) || lesson.length === 0) return res.status(400).json({ error: 'Нужен урок.' });
  res.json({ questions: await ai.chatStarters({ lesson, current }) });
});

// The lesson's chat with the tutor. The client keeps the conversation and sends all of it, with the lesson so far;
// the answer comes back as plain text, written out as the model produces it.
app.post('/api/chat', async (req, res) => {
  const { lesson, current, messages } = req.body ?? {};
  const valid =
    validLesson(lesson, current) &&
    Array.isArray(messages) && messages.length > 0 && messages.length <= 80 && messages.every(validChatMessage) &&
    messages.at(-1).role === 'user';
  if (!valid) return res.status(400).json({ error: 'Нужны урок и вопрос.' });

  const aborted = new AbortController();
  res.on('close', () => aborted.abort());
  const answer = await ai.chat({ lesson, current, messages, signal: aborted.signal });
  res.type('text/plain; charset=utf-8').set('Cache-Control', 'no-cache');
  try {
    for await (const piece of answer) res.write(piece);
    res.end();
  } catch (err) {
    // Too late for an error status: cutting the connection tells the client the answer is incomplete.
    if (!aborted.signal.aborted) console.error(`chat: ${err.message}`);
    res.destroy();
  }
});

app.get('/api/dictionary', (_req, res) => {
  res.json({ entries: dictionary.list() });
});

app.post('/api/dictionary', async (req, res) => {
  const { form, sentence, sentenceRu, typed } = req.body ?? {};

  // Typed on the dictionary page: no sentence to take context from, so the model writes an example.
  if (typed !== undefined) {
    if (!text(typed) || typed.length > 80) {
      return res.status(400).json({ error: 'Введи слово или фразу до 80 символов.' });
    }
    const { exampleForm, ...word } = await ai.describeTypedWord({ text: typed.trim() });
    const entry = await dictionary.add({ ...word, form: exampleForm || word.word });
    return res.json({ entry });
  }

  if (!text(form) || !text(sentence)) {
    return res.status(400).json({ error: 'Нужны поля form и sentence.' });
  }
  const word = await ai.translateWord({ word: form, sentence, sentenceRu: sentenceRu ?? '' });
  const entry = await dictionary.add({ ...word, form, example: sentence, exampleRu: sentenceRu ?? '' });
  res.json({ entry });
});

app.post('/api/dictionary/restore', async (req, res) => {
  const entry = req.body?.entry;
  if (!entry || !text(entry.id) || !text(entry.word)) {
    return res.status(400).json({ error: 'Нет записи для восстановления.' });
  }
  res.json({ entry: await dictionary.restore(entry) });
});

app.delete('/api/dictionary/:id', async (req, res) => {
  await dictionary.remove(req.params.id);
  res.json({ ok: true });
});

// Sentences the learner saved from a lesson, to practise again later.
app.get('/api/saved', (_req, res) => {
  res.json({ entries: saved.list() });
});

app.post('/api/saved', async (req, res) => {
  const { ru, en, alternatives, level, grammar } = req.body?.sentence ?? {};
  if (!text(ru) || !text(en) || !LEVELS.includes(level)) {
    return res.status(400).json({ error: 'Нужно предложение с полями ru, en и level.' });
  }
  const alts = (Array.isArray(alternatives) ? alternatives : []).filter(text).slice(0, 5);
  const points = (Array.isArray(grammar) ? grammar : []).filter((g) => text(g) && g.length <= 60).slice(0, 5);
  res.json({ entry: await saved.add({ ru: ru.trim(), en: en.trim(), alternatives: alts, level, grammar: points }) });
});

app.post('/api/saved/restore', async (req, res) => {
  const entry = req.body?.entry;
  if (!entry || !text(entry.id) || !text(entry.ru) || !text(entry.en) || !text(entry.addedAt)) {
    return res.status(400).json({ error: 'Нет записи для восстановления.' });
  }
  res.json({ entry: await saved.restore(entry) });
});

app.delete('/api/saved/:id', async (req, res) => {
  await saved.remove(req.params.id);
  res.json({ ok: true });
});

// Finished lessons, newest first. A lesson is recorded once per session id, so a repeat request replaces it.
app.get('/api/history', (_req, res) => {
  res.json({ entries: history.list() });
});

app.post('/api/history', async (req, res) => {
  const r = req.body?.record ?? {};
  const counts = ['total', 'answered', 'correct', 'almost', 'wrong'];
  const valid =
    text(r.sessionId) &&
    [2, 3, 4, 5].includes(r.grade) &&
    counts.every((k) => Number.isInteger(r[k]) && r[k] >= 0 && r[k] <= 100) &&
    Array.isArray(r.levels) && r.levels.every((l) => LEVELS.includes(l)) &&
    Number.isInteger(r.points) && r.points >= 0 && r.points <= 10000 &&
    (r.answers === undefined || (Array.isArray(r.answers) && r.answers.length <= 100 && r.answers.every(validAnswer)));
  if (!valid) return res.status(400).json({ error: 'Неполная запись о занятии.' });
  const entry = await history.add({
    sessionId: r.sessionId,
    grade: r.grade,
    points: r.points,
    ...Object.fromEntries(counts.map((k) => [k, r[k]])),
    levels: r.levels,
    withWords: Boolean(r.withWords),
    withSaved: Boolean(r.withSaved),
    ...(r.answers ? { answers: r.answers.map(({ level, verdict, hinted }) => ({ level, verdict, ...(hinted ? { hinted: true } : {}) })) } : {}),
  });
  res.json({ entry });
});

// Starts the progress over: every lesson goes, a copy stays in history.backup.json next to it.
app.delete('/api/history', async (_req, res) => {
  await history.clear(path.join(dataDir, 'history.backup.json'));
  res.json({ ok: true });
});

const dist = path.join(root, 'dist');
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^(?!\/api\/).*/, (_req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.use((err, _req, res, _next) => {
  if (err.userMessage) console.warn(err.userMessage);
  else console.error(err);
  res.status(err.httpStatus ?? 500).json({ error: err.userMessage ?? 'Что-то пошло не так на сервере. Подробности в консоли.' });
});

await Promise.all([dictionary.load(), saved.load(), history.load()]);
app.listen(port, '127.0.0.1', () => {
  const mode = demo ? 'демо-режим, без OpenAI' : `модель ${model}`;
  console.log(`API: http://localhost:${port} (${mode})`);
  if (!demo && !process.env.OPENAI_API_KEY) {
    console.warn('OPENAI_API_KEY не задан. Добавьте его в файл .env (см. .env.example).');
  }
});

// One answered sentence of a lesson: its level and how it went.
function validAnswer(a) {
  return LEVELS.includes(a?.level) && ['correct', 'almost', 'wrong'].includes(a.verdict) && (a.hinted === undefined || typeof a.hinted === 'boolean');
}

// The lesson so far as the chat gets it, and the sentence on screen (null after the lesson).
function validLesson(lesson, current) {
  return (
    Array.isArray(lesson) && lesson.length <= 40 && lesson.every(validLessonSentence) &&
    (current === null || (Number.isInteger(current) && current >= 0 && current < lesson.length))
  );
}

// A sentence of the lesson as the chat gets it; `answer` is null until answered and empty after "Не знаю".
function validLessonSentence(s) {
  const strings = (list, max) => Array.isArray(list) && list.length <= max && list.every((v) => typeof v === 'string' && v.length < 2000);
  return (
    text(s?.ru) && text(s.en) && LEVELS.includes(s.level) && strings(s.alternatives, 5) && strings(s.grammar, 5) && strings(s.hints, 30) &&
    (s.answer === null ||
      (typeof s.answer === 'string' && s.answer.length < 2000 &&
        ['correct', 'almost', 'wrong'].includes(s.verdict) && typeof s.corrected === 'string' &&
        Array.isArray(s.notes) && s.notes.length <= 20 &&
        s.notes.every((n) => typeof n?.wrong === 'string' && typeof n.right === 'string' && typeof n.why === 'string')))
  );
}

function validChatMessage(m) {
  return (
    ['user', 'assistant'].includes(m?.role) &&
    typeof m.content === 'string' && m.content.trim().length > 0 && m.content.length <= 12000 &&
    (m.at === undefined || m.at === null || Number.isInteger(m.at))
  );
}

function clamp(n, min, max) {
  return Math.min(max, Math.max(min, Math.round(n)));
}

function text(value) {
  return typeof value === 'string' && value.trim().length > 0 && value.length < 2000;
}
