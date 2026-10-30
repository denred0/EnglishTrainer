// Measures how natural the generated sentences are, so a change to the generation prompt can be judged by numbers
// rather than by reading a handful of sentences. Generates a few lessons per level the way the app does (each lesson
// sees the sentences of the previous ones), then a second model call grades every sentence.
//
//   npm run eval -- [--levels A1,A2,B1,B2] [--lessons 3] [--effort low] [--out results.json]
//   npm run eval -- --calibrate     grades a fixed set of known good and bad sentences, to check the judge itself
//
// Uses the OpenAI key from .env and costs a few dozen requests; nothing is written to data/.
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import OpenAI from 'openai';
import { createAi } from '../server/ai.js';

const { values: args } = parseArgs({
  options: {
    levels: { type: 'string', default: 'A1,A2,B1,B2' },
    lessons: { type: 'string', default: '3' },
    effort: { type: 'string' },
    out: { type: 'string' },
    calibrate: { type: 'boolean', default: false },
  },
});

const model = process.env.OPENAI_MODEL || 'gpt-6-luna';
const LESSON_SIZE = 10;
const JUDGE_BATCH = 10;
// The judge reasons more than the generator: it has to notice what the generator missed.
const JUDGE_EFFORT = 'medium';
// A sentence counts as natural from this score up.
const NATURAL = 4;

const JUDGE_PROMPT = `You review Russian→English translation drills written for a Russian speaker learning English. Each drill is a Russian sentence (ru) the learner translates and the expected English (en). You are a native Russian speaker with a good ear, and strict: the drills must sound like real speech, not like a textbook.

For each item return:
- situation: in Russian, one short sentence: who says these exact words to whom, when and why. Grammar being correct is not enough: imagine the moment. If no ordinary moment comes to mind where someone would say exactly this, write "нет".
- natural: how natural ru is, 1–5, following from the situation.
  5: people say exactly this all the time; it sounds like a real line from a conversation or a message.
  4: natural; someone could well say this in a real situation.
  3: grammatical, but nobody would quite put it this way: it sounds like a textbook example or built to show a grammar point.
  2: odd: no real situation, a strange combination of things, a detail nobody would mention (a date for a school subject, saying where something is NOT), "этот / эти" pointing at nothing in the situation, a negative or a fact nobody would bother to say.
  1: nonsense, or a mistake in the Russian.
  Short and simple is fine at A1–A2: judge whether a simple sentence is a natural thing to say, not whether it is interesting. Be strict: a drill that only sounds plausible on paper is a 3 at most.
- enOk: true if en is a correct, natural English translation that keeps the meaning of ru; false if it has a grammar mistake, sounds unnatural to a native speaker, or changes the meaning.
- problem: in Russian, one short sentence on what is wrong with ru or en; empty string if natural is 4–5 and enOk is true. For natural 2–3, say what a person would actually say instead.`;

const JUDGE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['situation', 'natural', 'enOk', 'problem'],
        properties: {
          situation: { type: 'string' },
          natural: { type: 'integer', enum: [1, 2, 3, 4, 5] },
          enOk: { type: 'boolean' },
          problem: { type: 'string' },
        },
      },
    },
  },
};

// Sentences whose verdict is known: bad ones the generator really produced, good ones people really say.
const CALIBRATION = [
  ['A1', 'Который час на этих часах?', 'What time is it on this clock?', 'bad'],
  ['A1', 'У нас химия первого мая.', 'We have chemistry on the first of May.', 'bad'],
  ['A1', 'Моя сестра не сидит рядом с дедушкой.', 'My sister doesn’t sit next to Grandpa.', 'bad'],
  ['A1', 'Зимой мой велосипед не стоит на балконе.', "In winter, my bicycle isn't on the balcony.", 'bad'],
  ['A1', 'Где сидит водитель, у двери?', 'Where is the driver sitting, by the door?', 'bad'],
  ['A2', 'Ты включил музыку, чтобы поблагодарить её за комплимент?', 'Did you turn on the music to thank her for the compliment?', 'bad'],
  ['B1', 'Вы сдаёте макулатуру в пункт, который зависит от городского графика вывоза.', "You take your waste paper to a collection point that depends on the city's pickup schedule.", 'bad'],
  ['A1', 'Сколько сейчас стоит этот билет?', 'How much is this ticket costing right now?', 'bad'],
  ['A1', 'Ты не знаешь, который час?', 'Do you know what time it is?', 'good'],
  ['A1', 'На улице сейчас идёт дождь?', 'Is it raining outside now?', 'good'],
  ['A1', 'Я не знаю, где здесь касса.', 'I don’t know where the checkout is.', 'good'],
  ['A2', 'Я опоздаю минут на десять.', "I'll be about ten minutes late.", 'good'],
  ['A2', 'Можешь подождать? Я скоро починю велосипед.', 'Can you wait? I’ll fix the bike soon.', 'good'],
  ['A2', 'Почему твои друзья не позвонили тебе вчера?', 'Why didn’t your friends call you yesterday?', 'good'],
  ['B1', 'Не подскажете, с какой платформы отправляется поезд до Казани?', 'Could you tell me which platform the train to Kazan leaves from?', 'good'],
  ['B1', 'Я нигде не могу найти свои записи к экзамену.', 'I can’t find my exam notes anywhere.', 'good'],
];

const client = new OpenAI();

async function judge(sentences) {
  const results = [];
  for (let i = 0; i < sentences.length; i += JUDGE_BATCH) results.push(judgeBatch(sentences.slice(i, i + JUDGE_BATCH)));
  return (await Promise.all(results)).flat();
}

async function judgeBatch(batch) {
  const response = await client.responses.create({
    model,
    instructions: JUDGE_PROMPT,
    input: `Review exactly ${batch.length} items, in this order:\n` + batch.map((s, i) => `${i + 1}. ${s.level}\nru: ${s.ru}\nen: ${s.en}`).join('\n'),
    reasoning: { effort: JUDGE_EFFORT },
    text: { format: { type: 'json_schema', name: 'review', schema: JUDGE_SCHEMA, strict: true } },
  });
  const { items } = JSON.parse(response.output_text);
  return batch.map((s, i) => ({ ...s, ...items[i] }));
}

/** Lessons of one level in a row, each seeing the sentences of the previous ones, as in the app. */
async function generateLevel(ai, level, lessons) {
  const recent = [];
  const out = [];
  for (let i = 0; i < lessons; i++) {
    const { sentences, plan } = await ai.generateSentences({ count: LESSON_SIZE, levels: [level], recent });
    const lesson = sentences.map((s, j) => ({ ...s, grammarPoint: plan[j].grammar, topic: plan[j].topic, kind: plan[j].kind }));
    recent.unshift(...lesson.map((s) => ({ ru: s.ru, level: s.level, grammar: s.grammarPoint, topic: s.topic })).reverse());
    out.push(...lesson);
  }
  return out;
}

const percent = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
const average = (list) => (list.length ? (list.reduce((sum, s) => sum + s.natural, 0) / list.length).toFixed(2) : '—');

function report(judged) {
  const rows = [...new Set(judged.map((s) => s.level))].map((level) => {
    const list = judged.filter((s) => s.level === level);
    return {
      level,
      sentences: list.length,
      natural: percent(list.filter((s) => s.natural >= NATURAL).length, list.length),
      score: average(list),
      enOk: percent(list.filter((s) => s.enOk).length, list.length),
    };
  });
  const flagged = judged.filter((s) => s.natural < NATURAL || !s.enOk);
  rows.push({
    level: 'всего',
    sentences: judged.length,
    natural: percent(judged.filter((s) => s.natural >= NATURAL).length, judged.length),
    score: average(judged),
    enOk: percent(judged.filter((s) => s.enOk).length, judged.length),
  });
  console.table(rows);
  console.log(`\nСтранные или с ошибкой в эталоне: ${flagged.length} из ${judged.length}\n`);
  for (const s of flagged.sort((a, b) => a.natural - b.natural)) {
    console.log(`${s.natural}${s.enOk ? ' ' : '✗'} ${s.level} ${s.ru} | ${s.en}`);
    if (s.grammarPoint) console.log(`     [${s.grammarPoint}; ${s.topic}; ${s.kind}]`);
    if (s.problem) console.log(`     ${s.problem}`);
  }
}

if (!process.env.OPENAI_API_KEY) {
  console.error('Нет OPENAI_API_KEY: запусти через npm run eval, чтобы подхватился .env.');
  process.exit(1);
}

if (args.calibrate) {
  const judged = await judge(CALIBRATION.map(([level, ru, en, expected]) => ({ level, ru, en, expected })));
  for (const s of judged) {
    const agrees = (s.natural >= NATURAL && s.enOk) === (s.expected === 'good');
    console.log(`${agrees ? 'ok  ' : 'MISS'} ${s.expected.padEnd(4)} ${s.natural}${s.enOk ? ' ' : '✗'} ${s.ru}${s.problem ? `\n          ${s.problem}` : ''}`);
  }
  const misses = judged.filter((s) => (s.natural >= NATURAL && s.enOk) !== (s.expected === 'good')).length;
  console.log(`\nСудья согласен с известной оценкой в ${judged.length - misses} из ${judged.length}`);
} else {
  const levels = args.levels.split(',').map((l) => l.trim().toUpperCase());
  const lessons = Number(args.lessons) || 3;
  const ai = createAi({ model, ...(args.effort ? { generateEffort: args.effort } : {}) });
  const started = performance.now();
  const generated = (await Promise.all(levels.map((level) => generateLevel(ai, level, lessons)))).flat();
  console.log(`\nСгенерировано ${generated.length} предложений за ${((performance.now() - started) / 1000).toFixed(0)} с, оцениваю…\n`);
  const judged = await judge(generated);
  report(judged);
  if (args.out) writeFileSync(args.out, JSON.stringify(judged, null, 2));
}
