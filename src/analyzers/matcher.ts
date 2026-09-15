import { ConfluencePage } from "../clients/confluence.client";
import { DiffAnalysis } from "./diff.analyzer";

export interface MatchedPage {
  page: ConfluencePage;
  score: number;
  matchedKeywords: string[];
  daysSinceUpdate: number;
  isDrifted: boolean;
}

export class Matcher {
  findRelatedPages(
    analysis: DiffAnalysis,
    pages: ConfluencePage[],
    mergedAt: string,
  ): MatchedPage[] {
    const ONE_DAY = 1000 * 60 * 60 * 24;
    const mergeDate = new Date(mergedAt);
    const results: MatchedPage[] = [];

    for (const page of pages) {
      const score = this.scoreMatch(analysis.keywords, page.title);
      if (score === 0) continue;

      const lastModified = new Date(page.lastModified);
      const daysSinceUpdate = Math.floor(
        (Date.now() - lastModified.getTime()) / ONE_DAY,
      );

      const isDrifted = lastModified < mergeDate || daysSinceUpdate > 14;

      results.push({
        page,
        score,
        matchedKeywords: this.getMatchedKeywords(analysis.keywords, page.title),
        daysSinceUpdate,
        isDrifted,
      });
    }

    return results.sort((a, b) => b.score - a.score).slice(0, 5);
  }

  private scoreMatch(keywords: string[], pageTitle: string): number {
    const title = pageTitle.toLowerCase();
    let score = 0;

    for (const keyword of keywords) {
      const kw = keyword.toLowerCase();

      if (title.includes(kw)) {
        score += kw.length > 5 ? 3 : 1;
      } else if (this.partialMatch(kw, title)) {
        score += 1;
      }
    }

    return score;
  }

  private partialMatch(keywords: string, title: string): boolean {
    if (keywords.length < 4) return false;

    const root = keywords.slice(0, 4);
    return title.includes(root);
  }

  private getMatchedKeywords(keywords: string[], pageTitle: string): string[] {
    const title = pageTitle.toLowerCase();
    return keywords.filter((kw) => title.includes(kw.toLowerCase()));
  }
}
