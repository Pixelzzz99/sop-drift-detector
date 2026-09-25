import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");
vi.mock("../../src/config", () => ({
  config: {
    confluence: {
      url: "https://confluence.example.com",
      apiToken: "confluence-token",
      rootPageId: "100",
    },
  },
}));

import { ConfluenceClient } from "../../src/clients/confluence.client";

const mockedGet = vi.mocked(axios.get);

function page(overrides: Record<string, unknown> = {}) {
  return {
    id: "200",
    title: "Onboarding",
    version: { number: 3, when: "2026-08-01T00:00:00.000Z" },
    space: { key: "Products" },
    _links: { webui: "/spaces/Products/pages/200" },
    body: { storage: { value: "<p>Hello <b>world</b></p>" } },
    ...overrides,
  };
}

describe("ConfluenceClient", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("sends a Bearer authorization header and requests body.storage", async () => {
    mockedGet.mockResolvedValueOnce({ data: { results: [], size: 0 } });

    const client = new ConfluenceClient();
    await client.getAllPagesUnderRoot();

    expect(mockedGet).toHaveBeenCalledWith(
      "https://confluence.example.com/rest/api/content/100/child/page",
      expect.objectContaining({
        headers: { Authorization: "Bearer confluence-token" },
        params: expect.objectContaining({ expand: "version,body.storage" }),
      }),
    );
  });

  it("maps page fields and strips HTML from the body", async () => {
    mockedGet
      .mockResolvedValueOnce({ data: { results: [page()], size: 1 } })
      // recursive call for the child page's own children
      .mockResolvedValueOnce({ data: { results: [], size: 0 } });

    const client = new ConfluenceClient();
    const pages = await client.getAllPagesUnderRoot();

    expect(pages).toEqual([
      {
        id: "200",
        title: "Onboarding",
        lastModified: "2026-08-01T00:00:00.000Z",
        version: 3,
        webUrl: "https://confluence.example.com/spaces/Products/pages/200",
        spaceKey: "Products",
        content: "Hello world",
      },
    ]);
  });

  it("truncates page content to 5000 characters", async () => {
    const hugeHtml = `<p>${"a".repeat(6000)}</p>`;
    mockedGet
      .mockResolvedValueOnce({
        data: { results: [page({ body: { storage: { value: hugeHtml } } })], size: 1 },
      })
      .mockResolvedValueOnce({ data: { results: [], size: 0 } });

    const client = new ConfluenceClient();
    const pages = await client.getAllPagesUnderRoot();

    expect(pages[0].content).toHaveLength(5000);
  });

  it("falls back to defaults when optional fields are missing", async () => {
    mockedGet
      .mockResolvedValueOnce({
        data: {
          results: [
            page({ space: undefined, _links: undefined, body: undefined, version: { number: undefined, when: undefined } }),
          ],
          size: 1,
        },
      })
      .mockResolvedValueOnce({ data: { results: [], size: 0 } });

    const client = new ConfluenceClient();
    const pages = await client.getAllPagesUnderRoot();

    expect(pages[0]).toMatchObject({
      lastModified: "",
      version: 0,
      webUrl: "https://confluence.example.com",
      spaceKey: "Products",
      content: "",
    });
  });

  it("paginates through child pages using start/limit", async () => {
    const rootUrl = "https://confluence.example.com/rest/api/content/100/child/page";
    const firstBatch = Array.from({ length: 50 }, (_, i) => page({ id: `${i}`, title: `Page ${i}` }));

    mockedGet.mockImplementation(async (url: string, cfg: any) => {
      if (url === rootUrl) {
        return cfg.params.start === 0
          ? { data: { results: firstBatch, size: 50 } }
          : { data: { results: [], size: 0 } };
      }
      // Recursive lookups for each returned page's own children.
      return { data: { results: [], size: 0 } };
    });

    const client = new ConfluenceClient();
    const pages = await client.getAllPagesUnderRoot();

    expect(pages).toHaveLength(50);

    const rootCalls = mockedGet.mock.calls.filter(([url]) => url === rootUrl);
    expect(rootCalls).toHaveLength(2);
    expect(rootCalls[1][1]).toMatchObject({
      params: expect.objectContaining({ start: 50 }),
    });
  });
});
