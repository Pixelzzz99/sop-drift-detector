import { JiraClient, JiraIssue } from "./clients/jira.client";
import { GitLabClient, MergeRequest } from "./clients/gitlab.client";
import { ConfluenceClient } from "./clients/confluence.client";
import { DiffAnalysis, DiffAnalyzer } from "./analyzers/diff.analyzer";
import { MatchedPage, Matcher } from "./analyzers/matcher";
import { HtmlReporter } from "./reporters/html.reporter";

export interface ReportEntity {
  issue: JiraIssue;
  mergeRequests: MergeRequest[];
  analysis: DiffAnalysis | null;
  matchedPages: MatchedPage[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const jira = new JiraClient();
  const gitlab = new GitLabClient();
  const confluence = new ConfluenceClient();
  const analyzer = new DiffAnalyzer();
  const matcher = new Matcher();
  const reporter = new HtmlReporter();

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

    let analysis: DiffAnalysis | null = null;
    let matchedPages: MatchedPage[] = [];

    if (mergeRequests.length > 0) {
      const mr = mergeRequests[0]; //get first MR

      // Got first diff
      const diffs = await gitlab.getMRDiffs(mr.iid);
      console.log(` -> MR has ${diffs.length} changed fileds`);

      // Analyze from LLM
      if (diffs.length > 0) {
        analysis = await analyzer.analyze(
          issue.key,
          issue.summary,
          mr.title,
          diffs,
        );

        console.log(` -> Analysis: ${analysis.summary}`);
        console.log(` -> Keywords: ${analysis.keywords.join(", ")}`);
        console.log(` -> Doc impact: ${analysis.hasDocImpact}`);
      } else {
        analysis = await analyzer.analyze(
          issue.key,
          issue.summary,
          mr.title,
          [],
        );
      }

      if (analysis.hasDocImpact) {
        matchedPages = matcher.findRelatedPages(
          analysis,
          confluencePages,
          mr.mergedAt,
        );

        const driftedCount = matchedPages.filter((p) => p.isDrifted).length;
        console.log(
          ` -> Matched ${matchedPages.length} pages, ${driftedCount} drifted`,
        );
      }
    } else {
      // If not have MR - use fallback only from text of task
      analysis = await analyzer.analyze(
        issue.key,
        issue.summary,
        issue.summary,
        [],
      );
      matchedPages = matcher.findRelatedPages(
        analysis,
        confluencePages,
        issue.updated,
      );
    }

    entries.push({ issue, mergeRequests, analysis, matchedPages });

    //Pause for not spaming of API
    if (i < issues.length - 1) await sleep(300);
  }

  // Generate HTML report
  const reportPath = reporter.generate(entries);

  //Shows results
  const drifftedEntries = entries.filter((e) =>
    e.matchedPages.some((p) => p.isDrifted),
  );

  const totalDrifted = entries.reduce(
    (sum, e) => sum + e.matchedPages.filter((p) => p.isDrifted).length,
    0,
  );

  console.log("\n" + "=".repeat(60));
  console.log("REPORT SUMMARY");
  console.log("=".repeat(60));
  console.log(`     Total issues processed: ${entries.length}`);
  console.log(
    `     Issues with MR      : ${entries.filter((e) => e.mergeRequests.length > 0).length}`,
  );
  console.log(`     Issues with drift       : ${drifftedEntries.length}`);
  console.log(`     Total drifted pages     : ${totalDrifted}`);
  console.log(`\n Report saved to: ${reportPath}\n`);
}

main().catch((err) => {
  if (err?.isAxiosError) {
    console.error(
      `Error in main execution: ${err.message} (status: ${err.response?.status ?? "n/a"}, url: ${err.config?.url ?? "n/a"})`,
    );
  } else {
    console.error("Error in main execution:", err);
  }
  process.exit(1);
});
