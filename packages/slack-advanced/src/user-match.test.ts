import { describe, it, expect } from "vitest";
import { normalizeText, rankUsers, scoreUser } from "./user-match.js";

const person = (fields: Partial<{ name: string; real_name: string; display_name: string; email: string }>) => ({
  name: "",
  real_name: "",
  display_name: "",
  email: "",
  ...fields,
});

const rivera = person({ name: "support", real_name: "Pat Rivera", display_name: "Pat Rivera (Nimbus)" });

describe("normalizeText", () => {
  it("drops accents, case and punctuation", () => {
    expect(normalizeText("Pât Rivêra (Nimbus)")).toBe("pat rivera nimbus");
  });
});

describe("scoreUser", () => {
  it("finds a person by a nickname inside the display name", () => {
    for (const query of ["nimbus", "Nimbus", "pat (nimbus)", "Pat Rivera", "rivera"]) {
      expect(scoreUser(rivera, query)).toBeGreaterThanOrEqual(70);
    }
  });

  it("ignores accents on either side", () => {
    expect(scoreUser(person({ real_name: "José Álvares" }), "jose alvares")).toBe(100);
    expect(scoreUser(person({ real_name: "Jose Alvares" }), "josé")).toBeGreaterThanOrEqual(70);
  });

  it("matches words spread over real name and display name", () => {
    expect(scoreUser(person({ real_name: "Pat Rivera", display_name: "Nimbus" }), "pat nimbus")).toBe(70);
  });

  it("tolerates a typo but stays below the score that sends a message", () => {
    const score = scoreUser(rivera, "Pat Nimbos");
    expect(score).toBeGreaterThan(20);
    expect(score).toBeLessThan(70);
  });

  it("does not treat a name hidden inside another word as confident", () => {
    expect(scoreUser(person({ name: "fabiana" }), "bia")).toBeLessThan(70);
  });
});

describe("rankUsers", () => {
  it("puts the closest person first", () => {
    const others = [person({ real_name: "Pat Moreno" }), person({ real_name: "Paty Lima" })];
    expect(rankUsers([...others, rivera], "Pat Nimbos")[0].user).toBe(rivera);
  });
});
