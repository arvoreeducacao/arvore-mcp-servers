import { z } from "zod";

export const ListSchoolsParamsSchema = z.object({
  schoolYear: z
    .number()
    .int()
    .min(2026)
    .max(2100)
    .optional()
    .describe("School year by its ending year (2027 = 2026–27). Defaults to the current US school year."),
  search: z
    .string()
    .max(200)
    .optional()
    .describe("Only schools whose name or network contains this text."),
});

export const SchoolStatusParamsSchema = z.object({
  schools: z
    .array(z.union([z.number().int().positive(), z.string().min(1).max(200)]))
    .min(1)
    .max(60)
    .describe(
      "Schools to report, by id (preferred, from list_us_schools or an earlier answer) or by name. Names are matched loosely: 'Goldenrod' finds 'Renaissance Charter School at Goldenrod'."
    ),
  schoolYear: z.number().int().min(2026).max(2100).optional(),
  includeCancelled: z
    .boolean()
    .optional()
    .describe("Also return cancelled class projects. Off by default."),
});

export type ListSchoolsParams = z.infer<typeof ListSchoolsParamsSchema>;
export type SchoolStatusParams = z.infer<typeof SchoolStatusParamsSchema>;

export interface SchoolSummary {
  schoolId: number;
  name: string;
  network: string | null;
  classProjects: number;
  firstContentDeadline: string | null;
  lastContentDeadline: string | null;
}

export interface ClassStatus {
  projectId: number;
  classId: number;
  className: string;
  status: string;
  students: number;
  startDate: string | null;
  contentDeadline: string | null;
  partyDate: string | null;
  pagesPrinted: boolean;
  pagesUploaded: boolean;
}

export interface TeacherStatus {
  teacherProfileId: number;
  name: string;
  email: string | null;
  profileComplete: boolean;
  classes: ClassStatus[];
}

export interface SchoolStatus {
  schoolId: number;
  name: string;
  network: string | null;
  startDate: string | null;
  contentDeadline: string | null;
  contentDeadlines: string[];
  partyDate: string | null;
  partyDates: string[];
  students: number;
  teachers: TeacherStatus[];
  classesWithoutTeacher: ClassStatus[];
}

export interface SchoolMatch {
  query: string | number;
  schoolId: number | null;
  candidates: { schoolId: number; name: string }[];
}

export interface McpToolResult {
  [key: string]: unknown;
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
}

export class SuperAuthorUSError extends Error {
  constructor(
    message: string,
    public readonly code: string
  ) {
    super(message);
    this.name = "SuperAuthorUSError";
  }
}
