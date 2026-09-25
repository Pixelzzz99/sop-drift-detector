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

  it("a single long keyword match in the title clears the relevance threshold on its own", () => {
    const page = confluencePage({ title: "OTP Авторизация Guide" });

    // "авторизация" (11 chars, >5) in title => +3; "otp" (3 chars) in title => +1
    const result = matcher.findRelatedPages(analysis(["авторизация", "otp"]), [page], "2026-01-01");

    expect(result[0].score).toBe(4);
  });

  it("filters out a page whose only match is a short keyword in the title", () => {
    const page = confluencePage({ title: "OTP guide" });

    // "otp" (<=5 chars) in title => +1, below MIN_SCORE
    const result = matcher.findRelatedPages(analysis(["авторизация", "otp"]), [page], "2026-01-01");

    expect(result).toEqual([]);
  });

  it("filters out a page whose only match is a keyword found in the content", () => {
    const page = confluencePage({
      title: "Random page",
      content: "Здесь описан процесс авторизации пользователя",
    });

    // content-only match => +1, below MIN_SCORE
    const result = matcher.findRelatedPages(analysis(["процесс"]), [page], "2026-01-01");

    expect(result).toEqual([]);
  });

  it("adds the content match on top of a title match that already clears the threshold", () => {
    const page = confluencePage({
      title: "OTP Authorization Guide",
      content: "Здесь описан процесс авторизации пользователя",
    });

    const result = matcher.findRelatedPages(
      analysis(["authorization", "процесс"]),
      [page],
      "2026-01-01",
    );

    // "authorization" in title => +3, "процесс" only in content => +1
    expect(result[0].score).toBe(4);
  });

  it("filters out a page whose only match is a partial (4-char root) title match", () => {
    const page = confluencePage({ title: "Auth Flow Overview" });

    const result = matcher.findRelatedPages(analysis(["authorization"]), [page], "2026-01-01");

    expect(result).toEqual([]);
  });

  it("does not give partial credit for keywords shorter than 4 characters", () => {
    const page = confluencePage({ title: "Something else entirely" });

    const result = matcher.findRelatedPages(analysis(["abc"]), [page], "2026-01-01");

    expect(result).toEqual([]);
  });

  it("reports matched keywords found in either the title or the content", () => {
    const page = confluencePage({
      title: "OTP Authorization Guide",
      content: "включает шаги валидации кода",
    });

    const result = matcher.findRelatedPages(
      analysis(["otp", "authorization", "валидации", "нет такого слова"]),
      [page],
      "2026-01-01",
    );

    expect(result[0].matchedKeywords).toEqual(["otp", "authorization", "валидации"]);
  });

  it("flags a page as drifted when it was last updated before the MR was merged", () => {
    const page = confluencePage({ title: "OTP Authorization Guide", lastModified: "2026-01-01T00:00:00.000Z" });

    const result = matcher.findRelatedPages(analysis(["authorization"]), [page], "2026-06-01T00:00:00.000Z");

    expect(result[0].isDrifted).toBe(true);
  });

  it("flags a page as drifted when it has not been updated in over 14 days, even if updated after the merge", () => {
    const twentyDaysAgo = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const mergedThirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const page = confluencePage({ title: "OTP Authorization Guide", lastModified: twentyDaysAgo });

    const result = matcher.findRelatedPages(analysis(["authorization"]), [page], mergedThirtyDaysAgo);

    expect(result[0].isDrifted).toBe(true);
    expect(result[0].daysSinceUpdate).toBeGreaterThanOrEqual(20);
  });

  it("does not flag a page as drifted when recently updated after the merge", () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const mergedTenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const page = confluencePage({ title: "OTP Authorization Guide", lastModified: yesterday });

    const result = matcher.findRelatedPages(analysis(["authorization"]), [page], mergedTenDaysAgo);

    expect(result[0].isDrifted).toBe(false);
  });

  it("returns at most the top 3 matches, sorted by score descending", () => {
    // 7 distinct long keywords, each worth +3 when present in a title.
    const keywords = ["alligator", "battalion", "chocolate", "dandelion", "elephants", "furniture", "gladiator"];

    // Page i's title contains keywords[0..(7-i)), so scores strictly decrease with i.
    const pages = Array.from({ length: 7 }, (_, i) =>
      confluencePage({ id: `${i}`, title: keywords.slice(0, 7 - i).join(" ") }),
    );

    const result = matcher.findRelatedPages(analysis(keywords), pages, "2026-01-01");

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.page.id)).toEqual(["0", "1", "2"]);
    const scores = result.map((r) => r.score);
    expect(scores).toEqual([21, 18, 15]);
  });
});
