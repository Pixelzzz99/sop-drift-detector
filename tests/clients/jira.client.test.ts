import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");
vi.mock("../../src/config", () => ({
  config: {
    jira: {
      url: "https://jira.example.com",
      apiToken: "jira-token",
      projectKey: "MYCLICK",
      titlePrefixes: ["[Back]", "[API]"],
    },
    daysBack: 7,
  },
}));

import { JiraClient } from "../../src/clients/jira.client";

const mockedGet = vi.mocked(axios.get);

describe("JiraClient", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  it("sends a Bearer authorization header and the expected JQL", async () => {
    mockedGet.mockResolvedValueOnce({
      data: { issues: [], total: 0 },
    });

    const client = new JiraClient();
    await client.getRecentlyClosedIssues();

    expect(mockedGet).toHaveBeenCalledWith(
      "https://jira.example.com/rest/api/2/search",
      expect.objectContaining({
        headers: { Authorization: "Bearer jira-token" },
        params: expect.objectContaining({
          jql: "project = MYCLICK AND status = Test AND updated >= -7d",
        }),
      }),
    );
  });

  it("maps Jira issue fields correctly", async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        issues: [
          {
            key: "MYCLICK-1",
            fields: {
              summary: "[Back] Fix bug",
              status: { name: "Test" },
              updated: "2026-09-20T10:00:00.000Z",
              labels: ["backend"],
              components: [{ name: "API" }, { name: "Core" }],
            },
          },
        ],
        total: 1,
      },
    });

    const client = new JiraClient();
    const issues = await client.getRecentlyClosedIssues();

    expect(issues).toEqual([
      {
        key: "MYCLICK-1",
        summary: "[Back] Fix bug",
        status: "Test",
        updated: "2026-09-20T10:00:00.000Z",
        labels: ["backend"],
        components: ["API", "Core"],
      },
    ]);
  });

  it("keeps only issues whose title starts with one of the configured prefixes", async () => {
    mockedGet.mockResolvedValueOnce({
      data: {
        issues: [
          { key: "MYCLICK-1", fields: { summary: "[Back] Fix auth bug", status: { name: "Test" }, updated: "", labels: [], components: [] } },
          { key: "MYCLICK-2", fields: { summary: "[API] Add new endpoint", status: { name: "Test" }, updated: "", labels: [], components: [] } },
          { key: "MYCLICK-3", fields: { summary: "[iOS] Update onboarding screen", status: { name: "Test" }, updated: "", labels: [], components: [] } },
          { key: "MYCLICK-4", fields: { summary: "[Front] Fix layout", status: { name: "Test" }, updated: "", labels: [], components: [] } },
        ],
        total: 4,
      },
    });

    const client = new JiraClient();
    const issues = await client.getRecentlyClosedIssues();

    expect(issues.map((i) => i.key)).toEqual(["MYCLICK-1", "MYCLICK-2"]);
  });

  it("paginates until all issues are fetched", async () => {
    mockedGet
      .mockResolvedValueOnce({
        data: {
          issues: [
            { key: "MYCLICK-1", fields: { summary: "[Back] A", status: { name: "Test" }, updated: "", labels: [], components: [] } },
            { key: "MYCLICK-2", fields: { summary: "[Back] B", status: { name: "Test" }, updated: "", labels: [], components: [] } },
          ],
          total: 3,
        },
      })
      .mockResolvedValueOnce({
        data: {
          issues: [
            { key: "MYCLICK-3", fields: { summary: "[Back] C", status: { name: "Test" }, updated: "", labels: [], components: [] } },
          ],
          total: 3,
        },
      });

    const client = new JiraClient();
    const issues = await client.getRecentlyClosedIssues();

    expect(mockedGet).toHaveBeenCalledTimes(2);
    expect(issues.map((i) => i.key)).toEqual(["MYCLICK-1", "MYCLICK-2", "MYCLICK-3"]);
    expect(mockedGet.mock.calls[1][1]).toMatchObject({
      params: expect.objectContaining({ startAt: 2 }),
    });
  });

  it("stops paginating when a batch comes back empty", async () => {
    mockedGet.mockResolvedValueOnce({
      data: { issues: [], total: 100 },
    });

    const client = new JiraClient();
    const issues = await client.getRecentlyClosedIssues();

    expect(mockedGet).toHaveBeenCalledTimes(1);
    expect(issues).toEqual([]);
  });
});
