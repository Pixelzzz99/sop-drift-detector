import axios from "axios";
import { config } from "../config";

export interface JiraIssue {
  key: string;
  summary: string;
  status: string;
  updated: string;
  labels: string[];
  components: string[];
}

export class JiraClient {
  private readonly headers: Record<string, string>;
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = config.jira.url;
    this.headers = {
      Authorization: `Bearer ${config.jira.apiToken}`,
    };
  }

  async getRecentlyClosedIssues(): Promise<JiraIssue[]> {
    const since = new Date();
    since.setDate(since.getDate() - config.daysBack);

    const jql = [
      `project in (${config.jira.projectKeys.join(", ")})`,
      `status = Test`,
      `updated >= -${config.daysBack}d`,
    ].join(" AND ");

    console.log(`[JIRA] Fetching issues with JQL: ${jql}`);

    const issues: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const response = await axios.get(`${this.baseUrl}/rest/api/2/search`, {
        headers: this.headers,
        params: {
          jql,
          startAt,
          maxResults,
          fields: "summary,status,updated,labels,components",
        },
      });

      const { issues: batch, total } = response.data;

      for (const issue of batch) {
        const matchesPrefix = config.jira.titlePrefixes.some((prefix) =>
          issue.fields.summary.startsWith(prefix),
        );
        if (!matchesPrefix) continue;

        issues.push({
          key: issue.key,
          summary: issue.fields.summary,
          status: issue.fields.status.name,
          updated: issue.fields.updated,
          labels: issue.fields.labels,
          components: issue.fields.components.map((c: any) => c.name),
        });
      }

      startAt += batch.length;

      if (startAt >= total || batch.length === 0) break;
    }

    console.log(
      `[JIRA] Found ${issues.length} issues with prefix(es) ${config.jira.titlePrefixes.map((p) => `"${p}"`).join(", ")}`,
    );

    return issues;
  }
}
