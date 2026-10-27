const CONTRACTIONS: [RegExp, string][] = [
  [/\bcan't\b/g, 'cannot'],
  [/\bcan not\b/g, 'cannot'],
  [/\bwon't\b/g, 'will not'],
  [/\bshan't\b/g, 'shall not'],
  [/n't\b/g, ' not'],
  [/\bi'm\b/g, 'i am'],
  [/'re\b/g, ' are'],
  [/'ve\b/g, ' have'],
  [/'ll\b/g, ' will'],
  [/'d\b/g, ' would'],
  [/\b(it|he|she|that|what|there|here|who|where|how|when|why|this)'s\b/g, '$1 is'],
];

/** Reduces a sentence to what matters for a strict match: no case, punctuation or contraction differences. */
export function normalize(sentence: string): string {
  let s = sentence.toLowerCase().replace(/[’‘`´]/g, "'");
  for (const [pattern, replacement] of CONTRACTIONS) s = s.replace(pattern, replacement);
  return s
    .replace(/[^a-z0-9'\s]/g, ' ')
    .replace(/'/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function matchesAny(answer: string, references: string[]): boolean {
  const target = normalize(answer);
  return references.some((reference) => normalize(reference) === target);
}

export type DiffPart = { kind: 'same' | 'removed' | 'added'; text: string };

/** Word-level diff from the learner's answer to its corrected version, removals before additions. */
export function diffWords(from: string, to: string): DiffPart[] {
  const a = from.trim().split(/\s+/).filter(Boolean);
  const b = to.trim().split(/\s+/).filter(Boolean);
  const key = (word: string) => word.toLowerCase().replace(/[’‘]/g, "'").replace(/[^\p{L}\p{N}']/gu, '');
  const ka = a.map(key);
  const kb = b.map(key);

  const lcs = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      lcs[i][j] = ka[i] === kb[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }

  const parts: DiffPart[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (ka[i] === kb[j]) {
      parts.push({ kind: 'same', text: a[i] });
      i++;
      j++;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      parts.push({ kind: 'removed', text: a[i++] });
    } else {
      parts.push({ kind: 'added', text: b[j++] });
    }
  }
  while (i < a.length) parts.push({ kind: 'removed', text: a[i++] });
  while (j < b.length) parts.push({ kind: 'added', text: b[j++] });
  return parts;
}

export type Token = { word: boolean; text: string };

const ENGLISH_WORD = /[A-Za-z]+(?:['’-][A-Za-z]+)*/g;
/** Any letters, so Russian words ("кто-нибудь") and the odd Latin name both count. */
export const ANY_WORD = /\p{L}+(?:['’-]\p{L}+)*/gu;

/** Splits a sentence into words and the spaces/punctuation between them; English words by default. */
export function tokenize(sentence: string, words: RegExp = ENGLISH_WORD): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of sentence.matchAll(words)) {
    if (match.index > last) tokens.push({ word: false, text: sentence.slice(last, match.index) });
    tokens.push({ word: true, text: match[0] });
    last = match.index + match[0].length;
  }
  if (last < sentence.length) tokens.push({ word: false, text: sentence.slice(last) });
  return tokens;
}

/** Russian plural form: plural(5, ['слово', 'слова', 'слов']) → 'слов'. */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}
