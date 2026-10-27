import { describe, expect, it } from "vitest";
import { matchSchools, nameTokens } from "./matching.js";

const DIRECTORY = [
  { schoolId: 1, name: "Renaissance Charter School at Goldenrod" },
  { schoolId: 2, name: "Renaissance Charter School at Hunters Creek" },
  { schoolId: 3, name: "Duval Charter School Baymeadows" },
  { schoolId: 4, name: "Renaissance Charter at Crown Point" },
  { schoolId: 5, name: "Duval Charter School at Mandarin" },
  { schoolId: 6, name: "Duval Charter Scholars Academy" },
  { schoolId: 7, name: "Renaissance Charter School at Poinciana" },
];

describe("nameTokens", () => {
  it("drops filler words, accents and apostrophes", () => {
    expect(nameTokens("Renaissance Charter School at Hunter’s Creek")).toEqual([
      "renaissance",
      "hunters",
      "creek",
    ]);
  });
});

describe("matchSchools", () => {
  it("matches the names the CS team writes to the platform names", () => {
    const result = matchSchools(
      [
        "Goldenrod",
        "Renaissance Charter School at Hunter’s Creek",
        "Duval Charter School at Baymeadows",
        "Renaissance Charter School at Crown Point",
      ],
      DIRECTORY
    );
    expect(result.map((match) => match.schoolId)).toEqual([1, 2, 3, 4]);
  });

  it("accepts ids, as numbers or digit strings", () => {
    expect(matchSchools([5, "7"], DIRECTORY).map((match) => match.schoolId)).toEqual([5, 7]);
  });

  it("returns candidates instead of guessing when the name is ambiguous", () => {
    const [match] = matchSchools(["Duval"], DIRECTORY);
    expect(match.schoolId).toBeNull();
    expect(match.candidates.map((candidate) => candidate.schoolId)).toEqual(
      expect.arrayContaining([3, 5, 6])
    );
  });

  it("returns nothing for an unknown school", () => {
    const [match] = matchSchools(["Freedomland Christian Academy"], DIRECTORY);
    expect(match.schoolId).toBeNull();
  });

  it("returns null for an id outside the directory", () => {
    expect(matchSchools([999], DIRECTORY)[0].schoolId).toBeNull();
  });
});
