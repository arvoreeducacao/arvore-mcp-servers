import { Queryable } from "./database.js";
import { ClassStatus, SchoolStatus, SchoolSummary, TeacherStatus } from "./types.js";

const US_SCHOOL_YEAR_START_MONTH = 8;

const IS_US_WRITING_SCHOOL = `EXISTS (
  SELECT 1
    FROM contract_module_entities cme
    JOIN contract_modules cm ON cm.id = cme.contract_module_id
    JOIN modules m ON m.id = cm.module_id
    JOIN contracts ct ON ct.id = cm.contract_id
   WHERE cme.entity_id = s.id
     AND m.name = 'ESCRITA'
     AND ct.active = 1
     AND ct.market = 'US'
)`;

const SCHOOL_OF_CLASS = "CAST(SUBSTRING_INDEX(c.ancestry, '/', -1) AS UNSIGNED)";

export function currentUSSchoolYear(today: Date = new Date()): number {
  const month = today.getUTCMonth() + 1;
  return month >= US_SCHOOL_YEAR_START_MONTH ? today.getUTCFullYear() + 1 : today.getUTCFullYear();
}

export interface ProjectRow {
  project_id: number;
  status: string;
  class_id: number;
  class_name: string | null;
  school_id: number;
  legacy_teacher_profile_id: number | null;
}

export interface SchoolRow {
  school_id: number;
  school_name: string;
  network_name: string | null;
  class_projects: number;
  first_deadline: string | null;
  last_deadline: string | null;
}

export interface MilestoneRow {
  project_id: number;
  milestone_key: string;
  occurs_on: string;
}

export interface SignerRow {
  project_id: number;
  teacher_profile_id: number;
}

export interface TeacherRow {
  teacher_profile_id: number;
  name: string | null;
  email: string | null;
  profile_complete: number;
}

export interface CountRow {
  class_id: number;
  students: number;
}

export interface ActivityRow {
  project_id: number;
  activity_key: string;
}

export class ProgramReport {
  constructor(private db: Queryable) {}

  async listSchools(schoolYear: number, search?: string): Promise<SchoolSummary[]> {
    const rows = await this.db.query<SchoolRow>(
      `SELECT s.id AS school_id,
              s.name AS school_name,
              n.name AS network_name,
              COUNT(DISTINCT wp.id) AS class_projects,
              DATE_FORMAT(MIN(ms.occurs_on), '%Y-%m-%d') AS first_deadline,
              DATE_FORMAT(MAX(ms.occurs_on), '%Y-%m-%d') AS last_deadline
         FROM writing_projects wp
         JOIN entities c ON c.id = wp.entity_id
         JOIN entities s ON s.id = ${SCHOOL_OF_CLASS}
         LEFT JOIN entities n ON n.id = wp.root_id
         LEFT JOIN writing_project_milestones ms
                ON ms.project_id = wp.id AND ms.milestone_key = 'contentDeadline'
        WHERE wp.deleted = 0
          AND wp.school_year = ?
          AND wp.status <> 'cancelled'
          AND ${IS_US_WRITING_SCHOOL}
        GROUP BY s.id, s.name, n.name
        ORDER BY s.name`,
      [schoolYear]
    );

    const needle = search?.trim().toLowerCase();
    return rows
      .filter(
        (row) =>
          !needle ||
          row.school_name.toLowerCase().includes(needle) ||
          (row.network_name || "").toLowerCase().includes(needle)
      )
      .map((row) => ({
        schoolId: Number(row.school_id),
        name: row.school_name,
        network: row.network_name,
        classProjects: Number(row.class_projects),
        firstContentDeadline: row.first_deadline,
        lastContentDeadline: row.last_deadline,
      }));
  }

  async schoolStatus(
    schoolIds: number[],
    schoolYear: number,
    includeCancelled: boolean
  ): Promise<SchoolStatus[]> {
    if (schoolIds.length === 0) return [];

    const schools = await this.db.query<SchoolRow>(
      `SELECT s.id AS school_id, s.name AS school_name, NULL AS network_name,
              0 AS class_projects, NULL AS first_deadline, NULL AS last_deadline
         FROM entities s
        WHERE s.id IN (?) AND ${IS_US_WRITING_SCHOOL}`,
      [schoolIds]
    );
    const allowedIds = schools.map((row) => Number(row.school_id));
    if (allowedIds.length === 0) return [];

    const projects = await this.db.query<ProjectRow & { network_name: string | null }>(
      `SELECT wp.id AS project_id,
              wp.status,
              c.id AS class_id,
              c.name AS class_name,
              ${SCHOOL_OF_CLASS} AS school_id,
              wp.book_teacher_profile_id AS legacy_teacher_profile_id,
              n.name AS network_name
         FROM writing_projects wp
         JOIN entities c ON c.id = wp.entity_id
         LEFT JOIN entities n ON n.id = wp.root_id
        WHERE wp.deleted = 0
          AND wp.school_year = ?
          AND ${SCHOOL_OF_CLASS} IN (?)
          ${includeCancelled ? "" : "AND wp.status <> 'cancelled'"}`,
      [schoolYear, allowedIds]
    );

    const projectIds = projects.map((row) => row.project_id);
    const classIds = [...new Set(projects.map((row) => row.class_id))];

    const [milestones, signers, counts, activities] = projectIds.length
      ? await Promise.all([
          this.db.query<MilestoneRow>(
            `SELECT project_id, milestone_key, DATE_FORMAT(occurs_on, '%Y-%m-%d') AS occurs_on
               FROM writing_project_milestones
              WHERE project_id IN (?)
                AND milestone_key IN ('projectStart', 'contentDeadline', 'autographEvent')`,
            [projectIds]
          ),
          this.db.query<SignerRow>(
            `SELECT project_id, teacher_profile_id
               FROM writing_project_book_teachers
              WHERE project_id IN (?)
              ORDER BY position`,
            [projectIds]
          ),
          this.db.query<CountRow>(
            `SELECT entity_id AS class_id, COUNT(*) AS students
               FROM subscription_reader_profiles
              WHERE entity_id IN (?) AND deleted = 0 AND desativated = 0
              GROUP BY entity_id`,
            [classIds]
          ),
          this.db.query<ActivityRow>(
            `SELECT project_id, activity_key
               FROM writing_project_activities
              WHERE project_id IN (?)
                AND completed_at IS NOT NULL
                AND activity_key IN ('printPages', 'uploadPages')`,
            [projectIds]
          ),
        ])
      : [[], [], [], []];

    const teacherIds = [
      ...new Set([
        ...signers.map((row) => row.teacher_profile_id),
        ...projects
          .map((row) => row.legacy_teacher_profile_id)
          .filter((id): id is number => id !== null),
      ]),
    ];

    const teachers = teacherIds.length
      ? await this.db.query<TeacherRow>(
          `SELECT gp.id AS teacher_profile_id,
                  u.name,
                  u.email,
                  (tp.photo_url IS NOT NULL AND tp.photo_url <> ''
                   AND tp.bio IS NOT NULL AND TRIM(tp.bio) <> '') AS profile_complete
             FROM subscription_group_admin_profiles gp
             JOIN users u ON u.id = gp.user_id
             LEFT JOIN writing_teacher_profiles tp ON tp.teacher_profile_id = gp.id
            WHERE gp.id IN (?)`,
          [teacherIds]
        )
      : [];

    const networkBySchool = new Map<number, string | null>();
    for (const row of projects) networkBySchool.set(Number(row.school_id), row.network_name);

    return assembleSchoolStatus({
      schools: schools.map((row) => ({
        ...row,
        network_name: networkBySchool.get(Number(row.school_id)) ?? null,
      })),
      projects,
      milestones,
      signers,
      teachers,
      counts,
      activities,
    });
  }
}

export function assembleSchoolStatus(input: {
  schools: SchoolRow[];
  projects: ProjectRow[];
  milestones: MilestoneRow[];
  signers: SignerRow[];
  teachers: TeacherRow[];
  counts: CountRow[];
  activities: ActivityRow[];
}): SchoolStatus[] {
  const milestonesByProject = new Map<number, Map<string, string>>();
  for (const row of input.milestones) {
    const byKey = milestonesByProject.get(row.project_id) ?? new Map<string, string>();
    byKey.set(row.milestone_key, row.occurs_on);
    milestonesByProject.set(row.project_id, byKey);
  }

  const signersByProject = new Map<number, number[]>();
  for (const row of input.signers) {
    signersByProject.set(row.project_id, [
      ...(signersByProject.get(row.project_id) ?? []),
      row.teacher_profile_id,
    ]);
  }

  const teacherById = new Map(input.teachers.map((row) => [Number(row.teacher_profile_id), row]));
  const studentsByClass = new Map(input.counts.map((row) => [Number(row.class_id), Number(row.students)]));
  const activitiesByProject = new Map<number, Set<string>>();
  for (const row of input.activities) {
    const keys = activitiesByProject.get(row.project_id) ?? new Set<string>();
    keys.add(row.activity_key);
    activitiesByProject.set(row.project_id, keys);
  }

  return input.schools
    .map((school) => {
      const schoolId = Number(school.school_id);
      const projects = input.projects.filter((row) => Number(row.school_id) === schoolId);
      const teachers = new Map<number, TeacherStatus>();
      const withoutTeacher: ClassStatus[] = [];
      const studentsByClassInSchool = new Map<number, number>();

      for (const project of projects) {
        const dates = milestonesByProject.get(project.project_id) ?? new Map<string, string>();
        const acts = activitiesByProject.get(project.project_id) ?? new Set<string>();
        const students = studentsByClass.get(Number(project.class_id)) ?? 0;
        if (project.status !== "cancelled") {
          studentsByClassInSchool.set(Number(project.class_id), students);
        }

        const classStatus: ClassStatus = {
          projectId: project.project_id,
          classId: Number(project.class_id),
          className: project.class_name ?? "",
          status: project.status,
          students,
          startDate: dates.get("projectStart") ?? null,
          contentDeadline: dates.get("contentDeadline") ?? null,
          partyDate: dates.get("autographEvent") ?? null,
          pagesPrinted: acts.has("printPages"),
          pagesUploaded: acts.has("uploadPages"),
        };

        const signerIds = signersByProject.get(project.project_id) ??
          (project.legacy_teacher_profile_id !== null ? [Number(project.legacy_teacher_profile_id)] : []);
        const known = signerIds.filter((id) => teacherById.has(id));

        if (known.length === 0) {
          withoutTeacher.push(classStatus);
          continue;
        }

        for (const id of known) {
          const row = teacherById.get(id)!;
          const teacher = teachers.get(id) ?? {
            teacherProfileId: id,
            name: row.name ?? "",
            email: row.email,
            profileComplete: Boolean(Number(row.profile_complete)),
            classes: [],
          };
          teacher.classes.push(classStatus);
          teachers.set(id, teacher);
        }
      }

      const active = projects.filter((row) => row.status !== "cancelled");
      const pick = (key: string) =>
        uniqueSorted(
          active
            .map((row) => milestonesByProject.get(row.project_id)?.get(key))
            .filter((value): value is string => Boolean(value))
        );
      const starts = pick("projectStart");
      const deadlines = pick("contentDeadline");
      const parties = pick("autographEvent");

      return {
        schoolId,
        name: school.school_name,
        network: school.network_name,
        startDate: starts[0] ?? null,
        contentDeadline: deadlines[0] ?? null,
        contentDeadlines: deadlines,
        partyDate: parties[0] ?? null,
        partyDates: parties,
        students: [...studentsByClassInSchool.values()].reduce((sum, value) => sum + value, 0),
        teachers: [...teachers.values()]
          .map((teacher) => ({
            ...teacher,
            classes: teacher.classes.sort((a, b) => a.className.localeCompare(b.className)),
          }))
          .sort((a, b) => a.name.localeCompare(b.name)),
        classesWithoutTeacher: withoutTeacher,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}
