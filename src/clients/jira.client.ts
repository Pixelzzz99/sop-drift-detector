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
  private readonly auth: { username: string; password: string };
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = config.jira.url;
    this.auth = {
      username: config.jira.username,
      password: config.jira.apiToken,
    };
  }

  async getRecentlyClosedIssues(): Promise<JiraIssue[]> {
    const since = new Date();
    since.setDate(since.getDate() - config.daysBack);

    const jql = [
      `project = ${config.jira.projectKey}`,
      `status = Test`,
      `updated >= -${config.daysBack}d`,
    ].join(" AND ");

    console.log(`[JIRA] Fetching issues with JQL: ${jql}`);

    const issues: JiraIssue[] = [];
    let startAt = 0;
    const maxResults = 50;

    while (true) {
      const response = await axios.get(`${this.baseUrl}/rest/api/2/search`, {
        auth: this.auth,
        params: {
          jql,
          startAt,
          maxResults,
          fields: "summary,status,updated,labels,components",
        },
      });

      const { issues: batch, total } = response.data;

      for (const issue of batch) {
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

    console.log(`[JIRA] Found ${issues.length} closed issues`);

    return issues;
  }
}
