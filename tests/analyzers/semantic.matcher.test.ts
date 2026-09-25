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

import { SemanticMatcher } from "../../src/analyzers/semantic.matcher";
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

function analysis(overrides: Partial<DiffAnalysis> = {}): DiffAnalysis {
  return {
    summary: "Изменена логика одноразовых паролей",
    keywords: ["otp"],
    hasDocImpact: true,
    ...overrides,
  };
}

function llmResponse(text: string) {
  return { content: [{ text }] };
}

describe("SemanticMatcher", () => {
  beforeEach(() => {
    createMock.mockReset();
  });

  it("returns an empty array without calling the LLM when there are no pages", async () => {
    const matcher = new SemanticMatcher();
    const result = await matcher.findRelatedPages(analysis(), [], "2026-01-01");

    expect(createMock).not.toHaveBeenCalled();
    expect(result).toEqual([]);
  });

  it("resolves LLM-selected indices to the matching pages, even without literal keyword overlap", async () => {
    // The page title uses a synonym ("одноразовые пароли") rather than the literal keyword "otp".
    const pages = [
      confluencePage({ id: "0", title: "Онбординг" }),
      confluencePage({ id: "1", title: "Одноразовые пароли: руководство" }),
    ];
    createMock.mockResolvedValueOnce(llmResponse("[1]"));

    const matcher = new SemanticMatcher();
    const result = await matcher.findRelatedPages(analysis(), pages, "2026-01-01");

    expect(result).toHaveLength(1);
    expect(result[0].page.id).toBe("1");
    expect(result[0].score).toBe(100);
  });

  it("returns an empty array when the LLM finds nothing relevant", async () => {
    const pages = [confluencePage({ id: "0", title: "Unrelated page" })];
    createMock.mockResolvedValueOnce(llmResponse("[]"));

    const matcher = new SemanticMatcher();
    const result = await matcher.findRelatedPages(analysis(), pages, "2026-01-01");

    expect(result).toEqual([]);
  });

  it("parses a response with surrounding prose text", async () => {
    const pages = [confluencePage({ id: "0", title: "OTP Guide" })];
    createMock.mockResolvedValueOnce(llmResponse("Вот результат:\n[0]\nготово"));

    const matcher = new SemanticMatcher();
    const result = await matcher.findRelatedPages(analysis(), pages, "2026-01-01");

    expect(result.map((r) => r.page.id)).toEqual(["0"]);
  });

  it("caps the number of returned pages at 3", async () => {
    const pages = Array.from({ length: 5 }, (_, i) => confluencePage({ id: `${i}`, title: `Page ${i}` }));
    createMock.mockResolvedValueOnce(llmResponse("[0, 1, 2, 3, 4]"));

    const matcher = new SemanticMatcher();
    const result = await matcher.findRelatedPages(analysis(), pages, "2026-01-01");

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.page.id)).toEqual(["0", "1", "2"]);
  });

  it("ignores out-of-range indices returned by the LLM", async () => {
    const pages = [confluencePage({ id: "0", title: "OTP Guide" })];
    createMock.mockResolvedValueOnce(llmResponse("[0, 5, -1]"));

    const matcher = new SemanticMatcher();
    const result = await matcher.findRelatedPages(analysis(), pages, "2026-01-01");

    expect(result.map((r) => r.page.id)).toEqual(["0"]);
  });

  it("throws when the LLM response has no JSON array, letting the caller fall back", async () => {
    const pages = [confluencePage({ id: "0", title: "OTP Guide" })];
    createMock.mockResolvedValueOnce(llmResponse("извините, не могу ответить"));

    const matcher = new SemanticMatcher();

    await expect(matcher.findRelatedPages(analysis(), pages, "2026-01-01")).rejects.toThrow();
  });

  it("throws when the LLM call itself fails, letting the caller fall back", async () => {
    const pages = [confluencePage({ id: "0", title: "OTP Guide" })];
    createMock.mockRejectedValueOnce(new Error("API error"));

    const matcher = new SemanticMatcher();

    await expect(matcher.findRelatedPages(analysis(), pages, "2026-01-01")).rejects.toThrow("API error");
  });

  it("computes isDrifted the same way as the keyword Matcher", async () => {
    const page = confluencePage({ id: "0", title: "OTP Guide", lastModified: "2026-01-01T00:00:00.000Z" });
    createMock.mockResolvedValueOnce(llmResponse("[0]"));

    const matcher = new SemanticMatcher();
    const result = await matcher.findRelatedPages(analysis(), [page], "2026-06-01T00:00:00.000Z");

    expect(result[0].isDrifted).toBe(true);
  });
});
