export type MatchableUser = {
  name: string;
  real_name: string;
  display_name: string;
  email: string;
};

export type RankedUser<T extends MatchableUser> = { user: T; score: number };

export const EXACT_SCORE = 100;
export const CONFIDENT_SCORE = 70;
const MIN_SCORE = 20;

export function normalizeText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@.+_-]+/gu, " ")
    .trim();
}

function words(text: string): string[] {
  return text.split(/[\s._-]+/).filter(Boolean);
}

function isPrefixOf(queryWord: string, word: string): boolean {
  return word.startsWith(queryWord);
}

function isNearOf(queryWord: string, word: string): boolean {
  if (isPrefixOf(queryWord, word)) return true;
  if (queryWord.length < 4) return false;
  const allowed = queryWord.length >= 7 ? 2 : 1;
  return Math.abs(queryWord.length - word.length) <= allowed && editDistance(queryWord, word) <= allowed;
}

function editDistance(a: string, b: string): number {
  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i++) {
    const current = [i];
    for (let j = 1; j <= b.length; j++) {
      const substitution = previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1);
      current.push(Math.min(previous[j] + 1, current[j - 1] + 1, substitution));
    }
    previous = current;
  }
  return previous[b.length];
}

function coversEveryWord(
  fieldWords: string[],
  queryWords: string[],
  matches: (queryWord: string, word: string) => boolean
): boolean {
  return queryWords.every((queryWord) => fieldWords.some((word) => matches(queryWord, word)));
}

function fuzzyScore(query: string, target: string): number {
  if (target.length === 0) return 0;

  let qi = 0;
  let matched = 0;
  let consecutive = 0;
  let maxConsecutive = 0;

  for (let ti = 0; ti < target.length && qi < query.length; ti++) {
    if (query[qi] === target[ti]) {
      matched++;
      consecutive++;
      maxConsecutive = Math.max(maxConsecutive, consecutive);
      qi++;
    } else {
      consecutive = 0;
    }
  }

  if (matched === 0) return 0;

  const coverage = matched / query.length;
  const consecutiveBonus = maxConsecutive / query.length;

  return Math.round((coverage * 30 + consecutiveBonus * 20) * (matched >= query.length ? 1 : 0.5));
}

export function scoreUser(user: MatchableUser, rawQuery: string): number {
  const query = normalizeText(rawQuery.trim().replace(/^@/, ""));
  if (!query) return 0;

  const fields = [user.name, user.real_name, user.display_name, user.email].map(normalizeText).filter(Boolean);
  const queryWords = words(query);

  let score = 0;
  for (const field of fields) {
    if (field === query) return EXACT_SCORE;
    if (field.startsWith(query)) score = Math.max(score, 80);
    else if (coversEveryWord(words(field), queryWords, isPrefixOf)) score = Math.max(score, 75);
    else if (field.includes(query)) score = Math.max(score, 60);
  }
  if (score > 0) return score;

  const allWords = fields.flatMap(words);
  if (coversEveryWord(allWords, queryWords, isPrefixOf)) return CONFIDENT_SCORE;
  if (coversEveryWord(allWords, queryWords, isNearOf)) return 50;

  return Math.max(0, ...fields.map((field) => fuzzyScore(query, field)));
}

export function rankUsers<T extends MatchableUser>(users: T[], query: string): RankedUser<T>[] {
  return users
    .map((user) => ({ user, score: scoreUser(user, query) }))
    .filter((ranked) => ranked.score > MIN_SCORE)
    .sort((a, b) => b.score - a.score);
}
