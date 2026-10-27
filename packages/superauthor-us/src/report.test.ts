import { describe, expect, it } from "vitest";
import { assembleSchoolStatus, currentUSSchoolYear, ProgramReport } from "./report.js";
import { Queryable } from "./database.js";

describe("currentUSSchoolYear", () => {
  it("rolls over in August", () => {
    expect(currentUSSchoolYear(new Date("2026-07-31T12:00:00Z"))).toBe(2026);
    expect(currentUSSchoolYear(new Date("2026-08-01T12:00:00Z"))).toBe(2027);
    expect(currentUSSchoolYear(new Date("2027-03-10T12:00:00Z"))).toBe(2027);
  });
});

describe("assembleSchoolStatus", () => {
  const status = assembleSchoolStatus({
    schools: [
      {
        school_id: 10,
        school_name: "Test School",
        network_name: "Test Network",
        class_projects: 0,
        first_deadline: null,
        last_deadline: null,
      },
    ],
    projects: [
      { project_id: 1, status: "in_progress", class_id: 100, class_name: "B class", school_id: 10, legacy_teacher_profile_id: 50 },
      { project_id: 2, status: "in_progress", class_id: 101, class_name: "A class", school_id: 10, legacy_teacher_profile_id: null },
      { project_id: 3, status: "cancelled", class_id: 102, class_name: "Old class", school_id: 10, legacy_teacher_profile_id: 51 },
      { project_id: 4, status: "in_progress", class_id: 103, class_name: "Orphan", school_id: 10, legacy_teacher_profile_id: null },
    ],
    milestones: [
      { project_id: 1, milestone_key: "contentDeadline", occurs_on: "2027-02-23" },
      { project_id: 2, milestone_key: "contentDeadline", occurs_on: "2027-03-16" },
      { project_id: 3, milestone_key: "contentDeadline", occurs_on: "2027-01-01" },
      { project_id: 1, milestone_key: "projectStart", occurs_on: "2026-09-09" },
      { project_id: 1, milestone_key: "autographEvent", occurs_on: "2027-04-09" },
    ],
    signers: [
      { project_id: 2, teacher_profile_id: 50 },
      { project_id: 2, teacher_profile_id: 51 },
    ],
    teachers: [
      { teacher_profile_id: 50, name: "Zoe Teacher", email: "zoe@school.org", profile_complete: 1 },
      { teacher_profile_id: 51, name: "Ann Teacher", email: "ann@school.org", profile_complete: 0 },
    ],
    counts: [
      { class_id: 100, students: 20 },
      { class_id: 101, students: 18 },
      { class_id: 102, students: 7 },
    ],
    activities: [
      { project_id: 1, activity_key: "printPages" },
      { project_id: 2, activity_key: "uploadPages" },
    ],
  });

  const [school] = status;

  it("uses the earliest date of active classes and lists the others", () => {
    expect(school.contentDeadline).toBe("2027-02-23");
    expect(school.contentDeadlines).toEqual(["2027-02-23", "2027-03-16"]);
    expect(school.startDate).toBe("2026-09-09");
    expect(school.partyDate).toBe("2027-04-09");
  });

  it("counts students of active classes only", () => {
    expect(school.students).toBe(38);
  });

  it("groups classes by teacher, co-teachers included, sorted by name", () => {
    expect(school.teachers.map((teacher) => teacher.name)).toEqual(["Ann Teacher", "Zoe Teacher"]);
    const zoe = school.teachers[1];
    expect(zoe.profileComplete).toBe(true);
    expect(zoe.classes.map((item) => item.className)).toEqual(["A class", "B class"]);
    expect(zoe.classes[1]).toMatchObject({ students: 20, pagesPrinted: true, pagesUploaded: false });
  });

  it("keeps classes nobody signs apart", () => {
    expect(school.classesWithoutTeacher.map((item) => item.className)).toEqual(["Orphan"]);
  });
});

describe("ProgramReport.schoolStatus", () => {
  it("stops before touching projects when no school is a US writing school", async () => {
    const calls: string[] = [];
    const db: Queryable = {
      async query<T>(sql: string): Promise<T[]> {
        calls.push(sql);
        return [];
      },
    };
    const result = await new ProgramReport(db).schoolStatus([1, 2], 2027, false);
    expect(result).toEqual([]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toContain("ct.market = 'US'");
  });
});
