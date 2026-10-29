import OpenAI from 'openai';
import { TOPICS } from './topics.js';

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
const rank = (level) => LEVELS.indexOf(level);

const GENERATE_PROMPT = `You write Russian→English translation drills for a native Russian speaker who is learning English.

Each requested item comes with a level, a grammar point and a topic, a vocabulary word or both. Build the sentence so that translating it exercises that grammar point, at that level's length. A grammar point can also be a word area (numbers, irregular verbs, phrasal verbs, idioms): then the English sentence uses words from that area naturally.

When an item names a vocabulary word (with its Russian meaning), the learner is practising that word: en must use it (any grammatical form, in the given meaning) and ru must contain its Russian equivalent, so that a natural translation needs the word. Without a topic, pick one that suits the word; with one, set the sentence in that topic if the word fits it, otherwise keep the word. If the word and the grammar point don't fit together naturally, keep the word and use the closest structure that does.

Above all, en must be a faithful translation of ru: the same meaning, tense and structure. Write ru first, then translate it; never adjust en towards the grammar point without changing ru to match.

For each item:
- ru: one Russian sentence that a real person would actually say in conversation or write in a message to friends, family or colleagues: common spoken phrasing, the words people use every day. No transliteration, brackets or hints.
- en: the most natural English translation, the one a native speaker would say and a learner at that level is expected to produce.
- alternatives: 0–3 other fully correct English translations that differ in wording (not just punctuation or contractions). If ru still allows another reading (general or specific, you singular or plural, he or she, another tense), its translation must be among them: "Официант принёс меню" → en "The waiter brought the menu.", alternatives include "A waiter brought the menu.".
- level: the item's level.
- grammar: 1–3 grammar points that translating this sentence practises, as short standard names in English Title Case ("Present Perfect", "Past Simple", "First Conditional", "Passive Voice", "Comparatives", "Articles", "Modal Verbs"), the item's grammar point first. For a word area, its short name ("Numbers", "Phrasal Verbs", "Idioms"). Name what en actually uses; skip trivial things every sentence has.

Make the Russian clear enough that one meaning is obvious (tense, number, who does what). When Russian leaves the English tense open, add a context word (уже, вчера, сейчас, к тому времени…) so the expected tense is clear.

Russian has no articles, so it often doesn't show whether a noun means something in general or a particular one the speaker has in mind ("Дети едят яйца на завтрак" fits both "Children eat…" and "The children eat…"). Whenever en has "the" or no article where the other reading is possible, make ru show which: for things in general, words like обычно, все, вообще, как правило or a general statement; for particular ones, эти, наши, мои, этот, вчерашний, в нашем классе or a context that points at them. The same goes for ты / вы when en's you could be either, and for он / она when the person matters. Use such words only where people would naturally say them; never add этот / эти just to mark an article ("Который час на этих часах?" — nobody says that). If the natural sentence still allows both readings, keep it as it is and put the other reading in alternatives: either is accepted.

Sentence length by level: A1 4–7 words, A2 6–10, B1 8–14, B2 10–18, C1 12–22, C2 14–26.

Each item also suggests a kind of sentence, only to keep the set varied. The grammar point (and the word, if any) must be there; the topic and the kind are only suggestions. Start from a real moment in the topic where people say something, then say it the way they would. If the grammar point, the topic and the kind together don't give such a sentence, drop the kind first, then take any situation near the topic: never glue them together into something nobody would say ("У нас химия первого мая", "Ты включил музыку, чтобы поблагодарить её за комплимент?"). A request must be one people really make ("Не забудь зонт", "Позвони, когда доедешь"). Never bend Russian grammar to fit the kind. Vary who the sentences are about too: not always я, but also ты, вы, он, она, мы, они, family, friends, colleagues, people by name, things and places.

Make every sentence fresh: no two in the set alike, and none of the textbook sentences everyone writes first ("Я люблю кофе", "У меня есть кошка", "Это моя книга", "Я иду в школу"). Take everyday vocabulary from the whole topic, not only its two most obvious words: different verbs, objects, places, times and details from sentence to sentence. Keep each sentence to one clear, everyday situation at its level's length; variety comes from the situations, not from packing in details.

Before returning, read every ru aloud in your head and ask: would a Russian speaker really say these exact words to someone, in some real situation? If a sentence sounds built to show off a grammar point or a word rather than to say something ("Этот стол стоит в этой комнате", "Моя сестра читает интересную книгу каждый день"), replace it with what people actually say in that situation: a question, a reply, a plan, a complaint, a request, a bit of news ("Ты не знаешь, который час?", "Я опоздаю минут на десять", "Мы вчера весь вечер смотрели сериал").`;

const CHECK_PROMPT = `You grade a learner's English translation of a Russian sentence. The learner is a native Russian speaker.

Verdicts:
- correct: grammatical, natural enough, and conveys the full meaning. Different wording, synonyms, word order variations, contractions, British/American spelling, punctuation and capitalisation differences are all fine.
- almost: the meaning is conveyed but there is a small slip: a typo, a missing or wrong article, a minor preposition, a slightly unnatural word choice.
- wrong: a grammar error that matters (tense, verb form, question word order, agreement), a missing or wrong part of the meaning, or an untranslated word.

Grade against the Russian, not against the reference: the references show one reading, but the learner may take another that the Russian equally allows. Russian has no articles and often leaves open whether a noun is meant in general or a particular one ("Дети едят яйца на завтрак": "Children eat…" and "The children eat…" are both correct), whether ты / вы is one person or several, he or she, or the tense. If the learner's sentence is a correct translation of some reasonable reading of the Russian, it is correct, even if it differs from the references; an article counts as a slip only when the Russian or plain English grammar decides it ("I have dog" lacks "a" whatever the reading). If the Russian clearly points at one reading (эти, обычно, уже, вчера…), the learner has to follow it.

Return:
- verdict.
- corrected: the learner's own sentence with the minimum edits needed to make it correct. Keep their wording wherever it is acceptable; do not rewrite it into the reference. If the verdict is correct, return their sentence unchanged.
- notes: one item per edit you made in corrected, in sentence order. Empty list if the verdict is correct.
  - wrong: the learner's words exactly as they wrote them; empty string if something was missing.
  - right: what replaced them in corrected; empty string if their words had to go.
  - why: in Russian, 2–3 sentences, addressing the learner informally (на «ты»). Say why their choice does not work in this sentence, not only what the rule is, then why the correction is right. When the mistake is a choice between similar words or forms (home / house, make / do, for / since, a / the), explain the difference in meaning or usage and give a short contrasting example of where the learner's word would be correct. Never comment on punctuation or capitalisation. Plain text without Markdown: put English words in «quotes».`;

const WORD_PROMPT = `You are a concise English–Russian learner's dictionary. Given an English word as it appears in a sentence, return:
- word: the dictionary form (infinitive for verbs, singular for nouns, positive degree for adjectives), lowercase unless it is a proper noun.
- transcription: British IPA in slashes, for the dictionary form.
- partOfSpeech: a Russian abbreviation: сущ., гл., прил., нареч., мест., предл., союз, числ., межд., артикль, мод. гл.
- translation: the Russian meaning that fits this sentence first, then up to two other common meanings, comma-separated.`;

const HINT_PROMPT = `A learner is translating a Russian sentence into English and asked for the English for one word, marked with [brackets]. Answer from the reference translation, so the hint matches what the learner is expected to write, but give away only the word, not the grammar. Return:
- word: the English for the marked word, in dictionary form: infinitive without "to" for verbs, singular for nouns, positive degree for adjectives ("прочитал" → "read", "уснула" → "fall asleep", "лестницу" → "ladder"). Use the word the reference uses, not a synonym. Never include tense or aspect forms, auxiliary verbs, articles or words that translate other parts of the sentence. Empty string if English has no separate word for it here.
- form: the same English word or words exactly as written in the reference translation ("read", "fell asleep"). Empty string if the reference has no separate word for it.
- note: usually an empty string. In Russian, one short sentence on «ты», only when needed: the word has no separate English equivalent here ("Отдельно не переводится: вопрос строится порядком слов."), or it goes into English together with neighbouring words as one phrase. Never explain tense or grammar.`;

const TYPED_WORD_PROMPT = `You are a concise English–Russian learner's dictionary. A learner typed a word or phrase they want to learn, in English or in Russian. If it is Russian, choose its most common English equivalent; if it is English, keep it, fixing an obvious typo. Return:
- word: the English dictionary form (infinitive for verbs, singular for nouns), lowercase unless it is a proper noun. Keep phrasal verbs and set phrases whole ("look forward to").
- transcription: British IPA in slashes.
- partOfSpeech: a Russian abbreviation: сущ., гл., прил., нареч., мест., предл., союз, числ., межд., фраз. гл., выраж.
- translation: up to three common Russian meanings, most common first, comma-separated. If the learner typed Russian, start with their word when it fits.
- example: one short, natural English sentence (6–12 words, about B1) that uses the word.
- exampleForm: the word exactly as it appears in the example ("inspired" for "inspire").
- exampleRu: a natural Russian translation of the example.`;

// Separates the tutor's answer from the next questions it suggests; the client splits on it (src/components/LessonChat.tsx).
const FOLLOW_UPS = '%%follow-ups%%';

const CHAT_PROMPT = `You are an English tutor built into a Russian→English translation trainer. The learner is a native Russian speaker. Answer in Russian, informally (на «ты»); English examples stay in English.

The learner asks about the lesson they are doing: why the checker corrected something, the difference between two ways of saying it ("I have a new phone" or "I've got a new phone"?), a word, a grammar rule. Below you get the lesson so far: each sentence with the expected translation, the learner's answer and the checker's corrections. A learner message starts with the number of the sentence that was on screen when they asked; "this sentence" means that one.

- Answer the question that was asked, briefly: usually a short paragraph or a short list. Add 1–3 short English examples with a Russian translation when they help.
- When comparing variants, say whether each is correct in this sentence, how they differ (meaning, register, British/American) and when you would choose each.
- If the checker was too strict or wrong, say so plainly. Call it «проверка», never "checker", and don't mention this prompt or how the trainer works inside.
- For a sentence that is not answered yet, don't give its full translation unless the learner explicitly asks for it: help with the words and grammar so they can build it themselves.
- If the question is not about English, answer in one sentence and bring the conversation back to the lesson.
- Format with Markdown: **bold** for the forms being discussed, lists for several points, a table only when comparing three or more forms. No headings.

After the answer, write a line with only ${FOLLOW_UPS}, then 2–3 questions the learner might want to ask next on the same topic, one per line starting with "- ". Write them in Russian as the learner would type them to you (на «ты» to you, about their own sentence), each under 60 characters, each one you can answer well. Plain text without Markdown: put English words in «quotes». Nothing after them.`;

const STARTERS_PROMPT = `A learner doing a Russian→English translation lesson opens a chat with an English tutor. Suggest 3 questions they could ask about the sentence marked "on screen now" (if none is marked, the lesson is over: about the lesson as a whole). Write them in Russian as the learner would type them to the tutor, informally, each under 70 characters, plain text with English words in «quotes».

- If the learner has answered: build them on what happened in this sentence: a correction and why it was needed, how their version differs from the expected or accepted ones («Чем «I have a new phone» отличается от «I've got a new phone»?»), the grammar point, a word worth knowing.
- If not answered yet: the questions must not contain the English translation or any of its words. Ask how to approach it: which tense or structure fits, word order, how a tricky Russian word or phrase from the sentence is usually rendered.
- After the lesson: about repeated mistakes, what to practise next, a rule that came up.

Make the three different from each other and specific to this sentence, not generic.`;

const STARTERS_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['questions'],
  properties: { questions: { type: 'array', items: { type: 'string' } } },
};

// The tutor explains nuances, where a little reasoning helps, but the learner is waiting for the first words.
const CHAT_EFFORT = 'low';

// Without reasoning, generation glued topic, grammar point and kind into sentences nobody says ("У нас химия первого
// мая"); a little reasoning lets the model check that each one sounds like real speech.
const GENERATE_EFFORT = 'low';

const SENTENCES_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['sentences'],
  properties: {
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['ru', 'en', 'alternatives', 'level', 'grammar'],
        properties: {
          ru: { type: 'string' },
          en: { type: 'string' },
          alternatives: { type: 'array', items: { type: 'string' } },
          level: { type: 'string', enum: LEVELS },
          grammar: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  },
};

const CHECK_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['verdict', 'corrected', 'notes'],
  properties: {
    verdict: { type: 'string', enum: ['correct', 'almost', 'wrong'] },
    corrected: { type: 'string' },
    notes: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['wrong', 'right', 'why'],
        properties: {
          wrong: { type: 'string' },
          right: { type: 'string' },
          why: { type: 'string' },
        },
      },
    },
  },
};

const WORD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['word', 'transcription', 'partOfSpeech', 'translation'],
  properties: {
    word: { type: 'string' },
    transcription: { type: 'string' },
    partOfSpeech: { type: 'string' },
    translation: { type: 'string' },
  },
};

const TYPED_WORD_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: [...WORD_SCHEMA.required, 'example', 'exampleForm', 'exampleRu'],
  properties: {
    ...WORD_SCHEMA.properties,
    example: { type: 'string' },
    exampleForm: { type: 'string' },
    exampleRu: { type: 'string' },
  },
};

const HINT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['word', 'form', 'note'],
  properties: {
    word: { type: 'string' },
    form: { type: 'string' },
    note: { type: 'string' },
  },
};

// Sentences are generated in parallel batches: one call for 20 items takes ~4× longer than four calls of 5.
const BATCH_SIZE = 5;

// Word lookup and hints are easy for the model and run without reasoning: measured ~2.5× faster with the same quality.
// Generation uses GENERATE_EFFORT; grading, checkEffort (OPENAI_REASONING_EFFORT), or the model's default when unset;
// the chat, CHAT_EFFORT.
const FAST = 'none';

export function createAi({ model, checkEffort }) {
  let client;
  let fastSupported = true;

  function create(request, effort, options) {
    if (!process.env.OPENAI_API_KEY) {
      throw userError(503, 'Не задан ключ OpenAI. Добавьте OPENAI_API_KEY в файл .env и перезапустите сервер.');
    }
    client ??= new OpenAI();
    const useEffort = effort && (effort !== FAST || fastSupported);
    const withEffort = useEffort ? { ...request, reasoning: { effort } } : request;
    return client.responses.create(withEffort, options).catch((err) => {
      // A model without this effort level (or without reasoning at all): drop the setting and retry.
      if (err instanceof OpenAI.BadRequestError && err.param?.startsWith('reasoning') && useEffort) {
        console.warn(`${model} не поддерживает reasoning.effort=${effort}, запрос без этой настройки.`);
        if (effort === FAST) fastSupported = false;
        return client.responses.create(request, options);
      }
      throw err;
    });
  }

  function logUsage(name, started, usage) {
    const { output_tokens: tokens, output_tokens_details: details } = usage ?? {};
    const seconds = ((performance.now() - started) / 1000).toFixed(1);
    console.log(`${name}: ${seconds} с, ${tokens} токенов ответа (из них ${details?.reasoning_tokens ?? 0} на рассуждения)`);
  }

  async function ask(name, schema, instructions, input, effort) {
    const request = {
      model,
      instructions,
      input,
      text: { format: { type: 'json_schema', name, schema, strict: true } },
    };
    const started = performance.now();
    try {
      const response = await create(request, effort);
      logUsage(name, started, response.usage);
      return JSON.parse(response.output_text);
    } catch (err) {
      throw explain(err, model);
    }
  }

  return {
    /**
     * `recent` is what the learner was given before, newest first: its topics and grammar go to the back of the
     * queue, and its sentences of the same levels are shown to the model so it doesn't write them again.
     * Returns the sentences and, in the same order, the plan they were written to.
     */
    async generateSentences({ count, levels = [], words = [], topics = [], recent = [] }) {
      const items = planItems(count, levels, words, topics, recent);
      const batches = [];
      for (let i = 0; i < count; i += BATCH_SIZE) batches.push(items.slice(i, i + BATCH_SIZE));

      const results = await Promise.all(
        batches.map((batch) =>
          ask(
            'sentences',
            SENTENCES_SCHEMA,
            GENERATE_PROMPT,
            `Make exactly ${batch.length} items, in this order:\n` +
              batch
                .map((item, i) => {
                  const word = item.word && `word: ${item.word.word}${item.word.translation ? ` (${item.word.translation})` : ''}`;
                  // With a dictionary word, the topic is only sent when the learner chose it.
                  const focus = word ? (item.topicChosen ? `${word}; topic: ${item.topic}` : word) : `topic: ${item.topic}`;
                  return `${i + 1}. ${item.level}; grammar: ${item.grammar}; ${focus}; kind: ${item.kind}`;
                })
                .join('\n') +
              seenBefore(recent, batch),
            GENERATE_EFFORT,
          ).then(({ sentences }) => sentences.slice(0, batch.length)),
        ),
      );
      return { sentences: results.flat(), plan: items };
    },

    checkAnswer({ ru, references, answer, effort }) {
      return ask(
        'check',
        CHECK_SCHEMA,
        CHECK_PROMPT,
        `Russian: ${ru}\nReference translations:\n${references.map((r) => `- ${r}`).join('\n')}\nLearner's answer: ${answer}`,
        effort ?? checkEffort,
      );
    },

    translateWord({ word, sentence, sentenceRu }) {
      return ask(
        'word',
        WORD_SCHEMA,
        WORD_PROMPT,
        `Word: ${word}\nSentence: ${sentence}${sentenceRu ? `\nRussian original: ${sentenceRu}` : ''}`,
        FAST,
      );
    },

    hintWord({ marked, references }) {
      return ask(
        'hint',
        HINT_SCHEMA,
        HINT_PROMPT,
        `Russian: ${marked}\nReference translations:\n${references.map((r) => `- ${r}`).join('\n')}`,
        FAST,
      );
    },

    describeTypedWord({ text }) {
      return ask('typed_word', TYPED_WORD_SCHEMA, TYPED_WORD_PROMPT, `Learner typed: ${text}`, FAST);
    },

    /** Questions to start the chat with, fitting the sentence on screen. */
    async chatStarters({ lesson, current }) {
      const { questions } = await ask('chat_starters', STARTERS_SCHEMA, STARTERS_PROMPT, lessonText(lesson, current), FAST);
      return questions.map((q) => q.trim()).filter(Boolean).slice(0, 3);
    },

    /**
     * Answers the learner's latest question about the lesson. Resolves once OpenAI has accepted the request (so
     * errors such as a bad key still reach the client as JSON), to the answer's text as it is written, piece by piece.
     */
    async chat({ lesson, current, messages, signal }) {
      const request = {
        model,
        instructions: `${CHAT_PROMPT}\n\nThe lesson so far:\n\n${lessonText(lesson, current)}`,
        input: messages.map((m) => ({
          role: m.role,
          content: m.role === 'user' && m.at != null ? `(sentence ${m.at + 1} on screen) ${m.content}` : m.content,
        })),
        stream: true,
      };
      const started = performance.now();
      let stream;
      try {
        stream = await create(request, CHAT_EFFORT, { signal });
      } catch (err) {
        throw explain(err, model);
      }
      return (async function* () {
        for await (const event of stream) {
          if (event.type === 'response.output_text.delta') yield event.delta;
          else if (event.type === 'response.completed') logUsage('chat', started, event.response.usage);
          else if (event.type === 'response.failed' || event.type === 'error') {
            throw new Error(event.response?.error?.message ?? event.message ?? 'ответ модели оборвался');
          }
        }
      })();
    },
  };
}

/** The lesson as the tutor sees it: every sentence reached so far, with the learner's answer and the corrections. */
function lessonText(lesson, current) {
  return lesson
    .map((s, i) => {
      const lines = [`Sentence ${i + 1} (${s.level}${s.grammar.length ? `; ${s.grammar.join(', ')}` : ''})${i === current ? ', on screen now' : ''}`];
      lines.push(`Russian: ${s.ru}`);
      lines.push(`Expected: ${s.en}${s.alternatives.length ? ` Also accepted: ${s.alternatives.join(' | ')}` : ''}`);
      if (s.answer == null) {
        lines.push('Not answered yet.');
      } else if (!s.answer) {
        lines.push('The learner gave up ("Не знаю").');
      } else {
        lines.push(`Learner's answer: ${s.answer}`);
        lines.push(`Checker: ${s.verdict}${s.verdict !== 'correct' ? `; corrected: ${s.corrected}` : ''}`);
        for (const n of s.notes) lines.push(`- "${n.wrong}" → "${n.right}": ${n.why}`);
      }
      if (s.hints.length) lines.push(`Words looked up before answering: ${s.hints.join(', ')}`);
      return lines.join('\n');
    })
    .join('\n\n');
}

/**
 * One level, grammar point and topic per sentence. Sentences are spread evenly over the chosen levels (all of
 * them when none are chosen), from easy to hard: 10 items over every level → A1 A1 A2 A2 B1 B2 B2 C1 C1 C2,
 * over B1 and C1 → five of each.
 * Topics the learner chose (from topics.js) take turns, in random order; a sentence on a topic is written at the
 * topic's level if its own is lower. What they didn't choose comes from the catalogue: grammar of the sentence's
 * level, a topic of that level or the one below. Nothing repeats until its list runs out, and across lessons the
 * ones used longest ago (in `recent`, newest first) come first, so the same few don't keep coming back.
 * With dictionary words, every sentence practises one of them: a random subset when there are more words
 * than sentences, each word in turn (so some repeat) when there are fewer.
 * Each item also gets a kind of sentence, so a lesson isn't ten statements in a row.
 */
function planItems(count, chosenLevels, words, chosenTopics, recent = []) {
  const pool = chosenLevels.length ? LEVELS.filter((l) => chosenLevels.includes(l)) : LEVELS;
  const levels = Array.from({ length: count }, (_, i) => pool[Math.floor((i * pool.length) / count)]);
  const grammarQueues = Object.fromEntries(
    LEVELS.map((l) => [l, leastRecent(TOPICS.filter((t) => t.kind === 'grammar' && t.level === l), recent, 'grammar', (t) => t.focus)]),
  );
  const topicQueues = Object.fromEntries(
    LEVELS.map((l) => [
      l,
      leastRecent(
        TOPICS.filter((t) => t.kind === 'topic' && rank(t.level) <= rank(l) && rank(t.level) >= rank(l) - 1),
        recent,
        'topic',
        (t) => t.name,
      ),
    ]),
  );
  const picks = shuffle(chosenTopics);
  const wordPool = shuffle(words);
  const kinds = shuffle(KINDS);
  const items = levels.map((planned, i) => {
    const chosen = picks[i % picks.length];
    const level = chosen && rank(chosen.level) > rank(planned) ? chosen.level : planned;
    const grammar = chosen?.kind === 'grammar' ? chosen : take(grammarQueues[level]);
    const topic = chosen?.kind === 'topic' ? chosen : take(topicQueues[level]);
    return {
      level,
      grammar: grammar.focus,
      topic: topic.name,
      topicChosen: chosen?.kind === 'topic',
      word: wordPool[i % wordPool.length],
      kind: kinds[i % kinds.length],
    };
  });
  // Raised levels could break the easy-to-hard order.
  return items.sort((a, b) => rank(a.level) - rank(b.level));
}

// How many earlier sentences of the batch's levels the model sees: enough to steer it off the usual ones, few
// enough to keep the request short (about 10 tokens each).
const SEEN_LIMIT = 80;

/** The learner's earlier sentences at the batch's levels, newest first, for the model to stay away from. */
function seenBefore(recent, batch) {
  const levels = new Set(batch.map((item) => item.level));
  const seen = recent.filter((r) => levels.has(r.level)).slice(0, SEEN_LIMIT);
  if (!seen.length) return '';
  return `\n\nThe learner already had these sentences. Don't repeat any of them, and don't reuse their situations or their subject + verb + object; pick other people, actions, objects and places:\n${seen.map((r) => `- ${r.ru}`).join('\n')}`;
}

// Statements are the default the model falls back to; the other kinds only come up when asked for.
const KINDS = ['statement', 'statement', 'statement', 'question', 'question with a question word', 'request or advice'];

/** A shuffled list with the entries used longest ago (or never) first; `recent` is newest first. */
function leastRecent(list, recent, field, keyOf) {
  const lastUse = new Map();
  recent.forEach((r, i) => {
    if (r[field] && !lastUse.has(r[field])) lastUse.set(r[field], i);
  });
  // Never used sorts as "longest ago"; the shuffle keeps the order random among equals.
  const age = (item) => lastUse.get(keyOf(item)) ?? Infinity;
  return shuffle(list).sort((a, b) => age(b) - age(a));
}

/** The next item of a queue, which goes back to the end. */
function take(queue) {
  const item = queue.shift();
  queue.push(item);
  return item;
}

export function userError(httpStatus, userMessage) {
  return Object.assign(new Error(userMessage), { httpStatus, userMessage });
}

function explain(err, model) {
  if (!(err instanceof OpenAI.APIError)) {
    return err instanceof SyntaxError
      ? userError(502, 'Модель вернула ответ в неожиданном формате. Попробуйте ещё раз.')
      : err;
  }
  console.error(`OpenAI ${err.status}: ${err.message}`);
  switch (err.status) {
    case 401:
      return userError(502, 'OpenAI не принял ключ. Проверьте OPENAI_API_KEY в файле .env.');
    case 404:
      return userError(502, `Модель ${model} недоступна для этого ключа. Укажите другую в OPENAI_MODEL.`);
    case 429:
      return err.code === 'insufficient_quota'
        ? userError(502, 'На счёте OpenAI закончились средства. Пополните баланс на platform.openai.com.')
        : userError(429, 'Слишком много запросов к OpenAI. Подождите минуту и повторите.');
    default:
      return userError(502, `OpenAI вернул ошибку: ${err.message}`);
  }
}

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
