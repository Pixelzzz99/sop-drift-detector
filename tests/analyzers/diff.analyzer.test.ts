import { describe, it, expect, vi, beforeEach } from "vitest";

const createMock = vi.fn();

vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: createMock };
  },
}));

vi.mock("../../src/config", () => ({
  config: {
    anthropic: { apiKey: "anthropic-key" },
  },
}));

import { DiffAnalyzer } from "../../src/analyzers/diff.analyzer";
import { FileDiff } from "../../src/clients/gitlab.client";

function fileDiff(overrides: Partial<FileDiff> = {}): FileDiff {
  return {
    oldPath: "src/a.ts",
    newPath: "src/a.ts",
    diff: "@@ -1,3 +1,3 @@\n-old\n+new",
    isNew: false,
    isDeleted: false,
    ...overrides,
  };
}

describe("DiffAnalyzer", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("returns the fallback analysis without calling the LLM when there are no diffs", async () => {
    const analyzer = new DiffAnalyzer();
    const result = await analyzer.analyze("MYCLICK-1", "Fix login bug", "fix: login bug", []);

    expect(createMock).not.toHaveBeenCalled();
    expect(result.hasDocImpact).toBe(true);
    expect(result.summary).toBe("Fix login bug");
  });

  it("parses a valid JSON response from the LLM", async () => {
    createMock.mockResolvedValueOnce({
      content: [
        {
          text: `Вот результат:\n{"summary":"Изменена логика авторизации","keywords":["авторизация","логин"],"hasDocImpact":true}`,
        },
      ],
    });

    const analyzer = new DiffAnalyzer();
    const result = await analyzer.analyze("MYCLICK-1", "Fix login bug", "fix: login bug", [fileDiff()]);

    expect(result).toEqual({
      summary: "Изменена логика авторизации",
      keywords: ["авторизация", "логин"],
      hasDocImpact: true,
    });
  });

  it("calls the LLM with the pinned model id", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ text: `{"summary":"s","keywords":[],"hasDocImpact":false}` }],
    });

    const analyzer = new DiffAnalyzer();
    await analyzer.analyze("MYCLICK-1", "Fix login bug", "fix: login bug", [fileDiff()]);

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ model: "claude-haiku-4-5-20251001" }),
    );
  });

  it("falls back when the LLM response has no parseable JSON", async () => {
    createMock.mockResolvedValueOnce({
      content: [{ text: "не могу ответить в формате JSON" }],
    });

    const analyzer = new DiffAnalyzer();
    const result = await analyzer.analyze("MYCLICK-1", "Fix login bug", "fix: login bug", [fileDiff()]);

    expect(result.summary).toBe("Fix login bug");
    expect(result.hasDocImpact).toBe(true);
  });

  it("falls back when the LLM call throws", async () => {
    createMock.mockRejectedValueOnce(new Error("API error"));

    const analyzer = new DiffAnalyzer();
    const result = await analyzer.analyze("MYCLICK-1", "Fix login bug", "fix: login bug", [fileDiff()]);

    expect(result.summary).toBe("Fix login bug");
  });

  it("fallback extracts lowercase keywords longer than 3 characters from the issue/MR text", async () => {
    const analyzer = new DiffAnalyzer();
    const result = await analyzer.analyze(
      "MYCLICK-1",
      "Обновить логику расчёта комиссии",
      "fix: comission calc",
      [],
    );

    expect(result.keywords.every((k) => k === k.toLowerCase())).toBe(true);
    expect(result.keywords.every((k) => k.length > 3)).toBe(true);
    expect(result.keywords.length).toBeLessThanOrEqual(6);
  });
});
