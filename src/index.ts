import { JiraClient, JiraIssue } from "./clients/jira.client";
import { GitLabClient, MergeRequest, FileDiff } from "./clients/gitlab.client";
import { ConfluenceClient, ConfluencePage } from "./clients/confluence.client";
import { DiffAnalysis, DiffAnalyzer } from "./analyzers/diff.analyzer";
import { MatchedPage, Matcher } from "./analyzers/matcher";
import { SemanticMatcher } from "./analyzers/semantic.matcher";
import { HtmlReporter } from "./reporters/html.reporter";
import { config } from "./config";

export interface ReportEntity {
  issue: JiraIssue;
  mergeRequests: MergeRequest[];
  analysis: DiffAnalysis | null;
  matchedPages: MatchedPage[];
}

async function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function findRelatedPages(
  matcher: Matcher,
  semanticMatcher: SemanticMatcher,
  analysis: DiffAnalysis,
  confluencePages: ConfluencePage[],
  mergedAt: string,
  issueKey: string,
): Promise<MatchedPage[]> {
  try {
    return await semanticMatcher.findRelatedPages(analysis, confluencePages, mergedAt);
  } catch (err) {
    console.warn(
      ` -> Semantic matching failed for ${issueKey}, falling back to keyword matcher`,
    );
    return matcher.findRelatedPages(analysis, confluencePages, mergedAt);
  }
}

async function main() {
  const jira = new JiraClient();
  const gitlab = new GitLabClient();
  const confluence = new ConfluenceClient();
  const analyzer = new DiffAnalyzer();
  const matcher = new Matcher();
  const semanticMatcher = new SemanticMatcher();
  const reporter = new HtmlReporter();

  const issues = await jira.getRecentlyClosedIssues();
  if (issues.length === 0) {
    console.log(`No closed issues found. Exiting`);
    return;
  }

  const confluencePages = await confluence.getAllPagesUnderRoot();
  const allMergeRequests = await gitlab.getMergedMRsSince(config.gitlab.mrLookbackDays);

  const entries: ReportEntity[] = [];

  for (let i = 0; i < issues.length; i++) {
    const issue = issues[i];
    console.log(
      `\n[${i + 1}/${issues.length}] Processing ${issue.key}: ${issue.summary}`,
    );

    const mergeRequests = gitlab.matchIssueToMRs(allMergeRequests, issue.key);
    console.log(` -> Found ${mergeRequests.length} MR(s)`);

    let analysis: DiffAnalysis | null = null;
    let matchedPages: MatchedPage[] = [];

    if (mergeRequests.length > 0) {
      // Analyze every merged MR for this issue, not just the first one.
      const allDiffs: FileDiff[] = [];
      for (const mr of mergeRequests) {
        const diffs = await gitlab.getMRDiffs(mr.iid);
        allDiffs.push(...diffs);
      }
      console.log(
        ` -> ${mergeRequests.length} MR(s), ${allDiffs.length} changed file(s) total`,
      );

      const combinedTitle = mergeRequests.map((mr) => mr.title).join("; ");
      analysis = await analyzer.analyze(
        issue.key,
        issue.summary,
        combinedTitle,
        allDiffs,
      );

      console.log(` -> Analysis: ${analysis.summary}`);
      console.log(` -> Keywords: ${analysis.keywords.join(", ")}`);
      console.log(` -> Doc impact: ${analysis.hasDocImpact}`);

      if (analysis.hasDocImpact) {
        // Use the most recent merge to decide whether docs are stale.
        const latestMergedAt = mergeRequests.reduce(
          (latest, mr) => (mr.mergedAt > latest ? mr.mergedAt : latest),
          mergeRequests[0].mergedAt,
        );

        matchedPages = await findRelatedPages(
          matcher,
          semanticMatcher,
          analysis,
          confluencePages,
          latestMergedAt,
          issue.key,
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

      if (analysis.hasDocImpact) {
        matchedPages = await findRelatedPages(
          matcher,
          semanticMatcher,
          analysis,
          confluencePages,
          issue.updated,
          issue.key,
        );
      }
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
