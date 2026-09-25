import { describe, it, expect } from "vitest";
import { Matcher } from "../../src/analyzers/matcher";
import { ConfluencePage } from "../../src/clients/confluence.client";
import { DiffAnalysis } from "../../src/analyzers/diff.analyzer";

function confluencePage(overrides: Partial<ConfluencePage> = {}): ConfluencePage {
  return {
    id: "1",
    title: "Untitled",
    lastModified: "2026-01-01T00:00:00.000Z",
    version: 1,
    webUrl: "https://confluence.example.com/1",
    spaceKey: "Products",
    content: "",
    ...overrides,
  };
}

function analysis(keywords: string[]): DiffAnalysis {
  return { summary: "summary", keywords, hasDocImpact: true };
}

describe("Matcher", () => {
  const matcher = new Matcher();

  it("excludes pages with no keyword overlap at all", () => {
    const page = confluencePage({ title: "Completely unrelated page" });
    const result = matcher.findRelatedPages(analysis(["авторизация"]), [page], "2026-09-01");

    expect(result).toEqual([]);
  });

  it("scores a long keyword match in the title higher than a short one", () => {
    const longMatch = confluencePage({ title: "OTP Авторизация Guide" });
    const shortMatch = confluencePage({ title: "OTP guide" });

    const result = matcher.findRelatedPages(
      analysis(["авторизация", "otp"]),
      [longMatch, shortMatch],
      "2026-01-01",
    );

    const long = result.find((r) => r.page === longMatch)!;
    const short = result.find((r) => r.page === shortMatch)!;

    // "авторизация" (11 chars, >5) in title => +3; "otp" (3 chars) in title => +1
    expect(long.score).toBe(4);
    // only "otp" matches this page's title
    expect(short.score).toBe(1);
  });

  it("adds a weaker score for a keyword found only in the page content", () => {
    const page = confluencePage({
      title: "Random page",
      content: "Здесь описан процесс авторизации пользователя",
    });

    const result = matcher.findRelatedPages(analysis(["процесс"]), [page], "2026-01-01");

    expect(result[0].score).toBe(1);
  });

  it("gives partial credit for a 4-character keyword root found in the title", () => {
    const page = confluencePage({ title: "Auth Flow Overview" });

    const result = matcher.findRelatedPages(analysis(["authorization"]), [page], "2026-01-01");

    expect(result[0].score).toBe(1);
  });

  it("does not give partial credit for keywords shorter than 4 characters", () => {
    const page = confluencePage({ title: "Something else entirely" });

    const result = matcher.findRelatedPages(analysis(["abc"]), [page], "2026-01-01");

    expect(result).toEqual([]);
  });

  it("reports matched keywords found in either the title or the content", () => {
    const page = confluencePage({
      title: "OTP Guide",
      content: "включает шаги валидации кода",
    });

    const result = matcher.findRelatedPages(
      analysis(["otp", "валидации", "нет такого слова"]),
      [page],
      "2026-01-01",
    );

    expect(result[0].matchedKeywords).toEqual(["otp", "валидации"]);
  });

  it("flags a page as drifted when it was last updated before the MR was merged", () => {
    const page = confluencePage({ title: "OTP Guide", lastModified: "2026-01-01T00:00:00.000Z" });

    const result = matcher.findRelatedPages(analysis(["otp"]), [page], "2026-06-01T00:00:00.000Z");

    expect(result[0].isDrifted).toBe(true);
  });

  it("flags a page as drifted when it has not been updated in over 14 days, even if updated after the merge", () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const mergedThirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const page = confluencePage({ title: "OTP Guide", lastModified: twentyDaysAgo });

    const result = matcher.findRelatedPages(analysis(["otp"]), [page], mergedThirtyDaysAgo);

    expect(result[0].isDrifted).toBe(true);
    expect(result[0].daysSinceUpdate).toBeGreaterThanOrEqual(20);
  });

  it("does not flag a page as drifted when recently updated after the merge", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const mergedTenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const page = confluencePage({ title: "OTP Guide", lastModified: yesterday });

    const result = matcher.findRelatedPages(analysis(["otp"]), [page], mergedTenDaysAgo);

    expect(result[0].isDrifted).toBe(false);
  });

  it("returns at most the top 5 matches, sorted by score descending", () => {
    // 7 distinct long keywords, each worth +3 when present in a title.
    const keywords = ["alligator", "battalion", "chocolate", "dandelion", "elephants", "furniture", "gladiator"];

    // Page i's title contains keywords[0..(7-i)), so scores strictly decrease with i.
    const pages = Array.from({ length: 7 }, (_, i) =>
      confluencePage({ id: `${i}`, title: keywords.slice(0, 7 - i).join(" ") }),
    );

    const result = matcher.findRelatedPages(analysis(keywords), pages, "2026-01-01");

    expect(result).toHaveLength(5);
    expect(result.map((r) => r.page.id)).toEqual(["0", "1", "2", "3", "4"]);
    const scores = result.map((r) => r.score);
    expect(scores).toEqual([21, 18, 15, 12, 9]);
  });
});
