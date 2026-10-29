// Offline stand-in for the OpenAI calls, for trying the interface without a key: `npm run demo`.
const SENTENCES = [
  { ru: 'Мой брат работает в больнице.', en: 'My brother works in a hospital.', alternatives: ['My brother works at a hospital.'], level: 'A1', grammar: ['Present Simple', 'Articles'] },
  { ru: 'Вчера мы ходили в кино с друзьями.', en: 'Yesterday we went to the cinema with friends.', alternatives: ['We went to the movies with friends yesterday.'], level: 'A2', grammar: ['Past Simple'] },
  { ru: 'Я уже прочитал эту книгу.', en: 'I have already read this book.', alternatives: ["I've already read this book."], level: 'B1', grammar: ['Present Perfect'] },
  { ru: 'Если завтра будет дождь, мы останемся дома.', en: 'If it rains tomorrow, we will stay at home.', alternatives: ["If it rains tomorrow, we'll stay home."], level: 'B1', grammar: ['First Conditional'] },
  { ru: 'Сколько стоит билет до Лондона?', en: 'How much is a ticket to London?', alternatives: ['How much does a ticket to London cost?'], level: 'A2', grammar: ['Questions'] },
  { ru: 'Жаль, что я не выучил английский раньше.', en: 'I wish I had learned English earlier.', alternatives: ['I wish I had learnt English earlier.'], level: 'B2', grammar: ['Wish + Past Perfect'] },
  { ru: 'Она сказала, что опоздает на встречу.', en: 'She said that she would be late for the meeting.', alternatives: ["She said she'd be late for the meeting."], level: 'B2', grammar: ['Reported Speech'] },
  { ru: 'Не успел я войти, как зазвонил телефон.', en: 'No sooner had I come in than the phone rang.', alternatives: ['Hardly had I come in when the phone rang.'], level: 'C1', grammar: ['Inversion', 'Past Perfect'] },
  { ru: 'Мы живём в этом городе уже десять лет.', en: 'We have been living in this city for ten years.', alternatives: ['We have lived in this city for ten years.'], level: 'B1', grammar: ['Present Perfect Continuous'] },
  { ru: 'Можно мне стакан воды, пожалуйста?', en: 'Can I have a glass of water, please?', alternatives: ['Could I have a glass of water, please?'], level: 'A1', grammar: ['Modal Verbs', 'Requests'] },
  { ru: 'Будь у меня больше времени, я бы занялся музыкой.', en: 'If I had more time, I would take up music.', alternatives: ['Had I more time, I would take up music.'], level: 'C1', grammar: ['Second Conditional', 'Phrasal Verbs'] },
  { ru: 'Этот мост построили в прошлом веке.', en: 'This bridge was built in the last century.', alternatives: [], level: 'B1', grammar: ['Passive Voice', 'Past Simple'] },
];

export function createDemoAi() {
  return {
    async generateSentences({ count, levels }) {
      await pause(600);
      const pool = levels.length ? SENTENCES.filter((s) => levels.includes(s.level)) : SENTENCES;
      const source = pool.length ? pool : SENTENCES;
      return { sentences: Array.from({ length: count }, (_, i) => source[i % source.length]), plan: [] };
    },

    async checkAnswer({ references, answer }) {
      await pause(500);
      return {
        verdict: 'wrong',
        corrected: references[0],
        notes: [
          {
            wrong: answer,
            right: references[0],
            why: 'Демо-режим без OpenAI: проверяется только точное совпадение, поэтому объяснения нет.',
          },
        ],
      };
    },

    async translateWord({ word }) {
      await pause(300);
      return { word: word.toLowerCase(), transcription: '', partOfSpeech: '', translation: 'перевод появится с ключом OpenAI' };
    },

    async hintWord() {
      await pause(300);
      return { word: '', form: '', note: 'Подсказки по словам появятся с ключом OpenAI.' };
    },

    async chatStarters() {
      await pause(300);
      return ['Какое время здесь нужно?', 'Как тут построить порядок слов?', 'Нужен ли здесь артикль?'];
    },

    async chat() {
      await pause(400);
      const answer =
        'В демо-режиме помощник не подключён, ответы появятся с ключом OpenAI.\n\nА так выглядит ответ с разметкой:\n\n' +
        '- **I have a new phone** — нейтрально, подходит везде.\n- **I’ve got a new phone** — то же самое, разговорнее, чаще в британском английском.' +
        '\n%%follow-ups%%\n- А как задать вопрос с have got?\n- Можно ли сказать I’ve a new phone?';
      return (async function* () {
        for (const word of answer.split(/(?<= )/)) {
          await pause(30);
          yield word;
        }
      })();
    },

    async describeTypedWord({ text }) {
      await pause(300);
      const word = text.toLowerCase();
      return {
        word,
        transcription: '',
        partOfSpeech: '',
        translation: 'перевод появится с ключом OpenAI',
        example: `This is an example with ${word}.`,
        exampleForm: word,
        exampleRu: 'Пример появится с ключом OpenAI.',
      };
    },
  };
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
