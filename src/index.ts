import { JiraClient, JiraIssue } from "./clients/jira.client";
import { GitLabClient, MergeRequest } from "./clients/gitlab.client";
import { ConfluenceClient } from "./clients/confluence.client";

export interface ReportEntity {
  issue: JiraIssue;
  mergeRequests: MergeRequest[];
}

async function main() {
  const jira = new JiraClient();
  const gitlab = new GitLabClient();
  const confluence = new ConfluenceClient();

  const issues = await jira.getRecentlyClosedIssues();
  if (issues.length === 0) {
    console.log(`No closed issues found. Exiting`);
    return;
  }

  const confluencePages = await confluence.getAllPagesUnderRoot();

  const entries: ReportEntity[] = [];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    console.log(
      `\n[${i + 1}/${issues.length}] Processing ${issue.key}: ${issue.summary}`,
    );

    const mergeRequests = await gitlab.findMergedMRsByIssueKey(issue.key);
    console.log(` -> Found ${mergeRequests.length} MR(s)`);
  }
}

main().catch((err) => {
  console.error("Error in main execution:", err);
  process.exit(1);
});
