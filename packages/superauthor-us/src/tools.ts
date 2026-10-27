import { matchSchools } from "./matching.js";
import { currentUSSchoolYear, ProgramReport } from "./report.js";
import { ListSchoolsParams, McpToolResult, SchoolStatusParams } from "./types.js";

export class SuperAuthorUSTools {
  constructor(private report: ProgramReport) {}

  async listSchools(params: ListSchoolsParams): Promise<McpToolResult> {
    return guard(async () => {
      const schoolYear = params.schoolYear ?? currentUSSchoolYear();
      const schools = await this.report.listSchools(schoolYear, params.search);
      return json({ schoolYear, count: schools.length, schools });
    });
  }

  async schoolStatus(params: SchoolStatusParams): Promise<McpToolResult> {
    return guard(async () => {
      const schoolYear = params.schoolYear ?? currentUSSchoolYear();
      const directory = await this.report.listSchools(schoolYear);
      const matches = matchSchools(params.schools, directory);
      const ids = [...new Set(matches.map((match) => match.schoolId).filter((id): id is number => id !== null))];
      const schools = await this.report.schoolStatus(ids, schoolYear, params.includeCancelled ?? false);

      return json({
        schoolYear,
        generatedAt: new Date().toISOString(),
        matches: matches.map((match) => ({
          query: match.query,
          schoolId: match.schoolId,
          ...(match.schoolId === null ? { candidates: match.candidates } : {}),
        })),
        schools,
      });
    });
  }
}

function json(payload: unknown): McpToolResult {
  return { content: [{ type: "text", text: JSON.stringify(payload) }] };
}

async function guard(run: () => Promise<McpToolResult>): Promise<McpToolResult> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[superauthor-us-mcp] tool error: ${message}`);
    return {
      content: [{ type: "text", text: JSON.stringify({ error: "The platform database did not answer. Try again in a minute." }) }],
      isError: true,
    };
  }
}
