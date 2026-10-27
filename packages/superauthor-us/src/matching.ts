import { SchoolMatch } from "./types.js";

const STOPWORDS = new Set(["at", "the", "of", "and", "in", "school", "schools", "charter"]);

export function nameTokens(name: string): string[] {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/['’`]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((token) => token && !STOPWORDS.has(token));
}

export function matchSchools(
  queries: Array<string | number>,
  schools: { schoolId: number; name: string }[]
): SchoolMatch[] {
  const indexed = schools.map((school) => ({ ...school, tokens: new Set(nameTokens(school.name)) }));

  return queries.map((query) => {
    if (typeof query === "number" || /^\d+$/.test(query.trim())) {
      const id = Number(query);
      const found = indexed.find((school) => school.schoolId === id);
      return {
        query,
        schoolId: found ? found.schoolId : null,
        candidates: found ? [{ schoolId: found.schoolId, name: found.name }] : [],
      };
    }

    const wanted = nameTokens(query);
    if (wanted.length === 0) return { query, schoolId: null, candidates: [] };

    const scored = indexed
      .map((school) => {
        const shared = wanted.filter((token) => school.tokens.has(token)).length;
        return {
          school,
          complete: shared === wanted.length,
          score: shared / Math.max(school.tokens.size, wanted.length),
        };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => Number(b.complete) - Number(a.complete) || b.score - a.score);

    const complete = scored.filter((entry) => entry.complete);
    const best = complete[0];
    const unique = best && (complete.length === 1 || complete[1].score < best.score);

    return {
      query,
      schoolId: unique ? best.school.schoolId : null,
      candidates: (complete.length ? complete : scored)
        .slice(0, 3)
        .map((entry) => ({ schoolId: entry.school.schoolId, name: entry.school.name })),
    };
  });
}
