import { describe, it, expect, vi, beforeEach } from "vitest";
import axios from "axios";

vi.mock("axios");
vi.mock("../../src/config", () => ({
  config: {
    gitlab: {
      url: "https://gitlab.example.com",
      apiToken: "gitlab-token",
      projectId: 42,
    },
  },
}));

import { GitLabClient } from "../../src/clients/gitlab.client";

const mockedGet = vi.mocked(axios.get);

describe("GitLabClient", () => {
  beforeEach(() => {
    mockedGet.mockReset();
  });

  describe("getMergedMRsSince", () => {
    it("sends the Private-Token header and a merged_after filter", async () => {
      mockedGet.mockResolvedValueOnce({ data: [] });

      const client = new GitLabClient();
      await client.getMergedMRsSince(7);

      expect(mockedGet).toHaveBeenCalledWith(
        "https://gitlab.example.com/api/v4/projects/42/merge_requests",
        expect.objectContaining({
          headers: { "Private-Token": "gitlab-token" },
          params: expect.objectContaining({ state: "merged", per_page: 100, page: 1 }),
        }),
      );

      const [, callConfig] = mockedGet.mock.calls[0];
      expect(callConfig.params.merged_after).toEqual(expect.any(String));
    });

    it("maps raw GitLab MR objects to the MergeRequest shape, including source_branch", async () => {
      mockedGet.mockResolvedValueOnce({
        data: [
          {
            id: 1,
            iid: 10,
            title: "feat: do the thing",
            description: null,
            source_branch: "feature/myclick-1-fix-otp",
            merged_at: "2026-09-10T12:00:00.000Z",
            web_url: "https://gitlab.example.com/mr/10",
          },
        ],
      });

      const client = new GitLabClient();
      const mrs = await client.getMergedMRsSince(7);

      expect(mrs).toEqual([
        {
          id: 1,
          iid: 10,
          title: "feat: do the thing",
          description: "",
          sourceBranch: "feature/myclick-1-fix-otp",
          mergedAt: "2026-09-10T12:00:00.000Z",
          webUrl: "https://gitlab.example.com/mr/10",
        },
      ]);
    });

    it("paginates until a page comes back with fewer than 100 results", async () => {
      const fullPage = Array.from({ length: 100 }, (_, i) => ({
        id: i,
        iid: i,
        title: `MR ${i}`,
        description: "",
        source_branch: "",
        merged_at: "2026-09-10T12:00:00.000Z",
        web_url: "",
      }));

      mockedGet
        .mockResolvedValueOnce({ data: fullPage })
        .mockResolvedValueOnce({ data: [] });

      const client = new GitLabClient();
      const mrs = await client.getMergedMRsSince(7);

      expect(mockedGet).toHaveBeenCalledTimes(2);
      expect(mrs).toHaveLength(100);
      expect(mockedGet.mock.calls[1][1]).toMatchObject({
        params: expect.objectContaining({ page: 2 }),
      });
    });

    it("returns an empty array when the request fails", async () => {
      mockedGet.mockRejectedValueOnce(new Error("network error"));

      const client = new GitLabClient();
      const mrs = await client.getMergedMRsSince(7);

      expect(mrs).toEqual([]);
    });
  });

  describe("matchIssueToMRs", () => {
    function mergeRequest(overrides: Partial<import("../../src/clients/gitlab.client").MergeRequest> = {}) {
      return {
        id: 1,
        iid: 1,
        title: "",
        description: "",
        sourceBranch: "",
        mergedAt: "",
        webUrl: "",
        ...overrides,
      };
    }

    it("matches by title", () => {
      const client = new GitLabClient();
      const mrs = [mergeRequest({ title: "fix MYCLICK-1 bug" })];

      expect(client.matchIssueToMRs(mrs, "MYCLICK-1")).toEqual(mrs);
    });

    it("matches by description", () => {
      const client = new GitLabClient();
      const mrs = [mergeRequest({ description: "Closes MYCLICK-1" })];

      expect(client.matchIssueToMRs(mrs, "MYCLICK-1")).toEqual(mrs);
    });

    it("matches by source branch, case-insensitively", () => {
      const client = new GitLabClient();
      const mrs = [mergeRequest({ sourceBranch: "feature/myclick-1-fix-otp", title: "fix: otp bug" })];

      expect(client.matchIssueToMRs(mrs, "MYCLICK-1")).toEqual(mrs);
    });

    it("returns an empty array when nothing matches", () => {
      const client = new GitLabClient();
      const mrs = [mergeRequest({ title: "unrelated change", sourceBranch: "chore/cleanup" })];

      expect(client.matchIssueToMRs(mrs, "MYCLICK-1")).toEqual([]);
    });
  });

  describe("getMRDiffs", () => {
    it("filters out binary/lock files and caps diff size", async () => {
      mockedGet.mockResolvedValueOnce({
        data: [
          { old_path: "src/a.ts", new_path: "src/a.ts", diff: "x".repeat(10050), new_file: false, deleted_file: false },
          { old_path: "yarn.lock", new_path: "yarn.lock", diff: "lockfile diff", new_file: false, deleted_file: false },
          { old_path: "logo.png", new_path: "logo.png", diff: "", new_file: true, deleted_file: false },
        ],
      });

      const client = new GitLabClient();
      const diffs = await client.getMRDiffs(10);

      expect(diffs).toHaveLength(1);
      expect(diffs[0].oldPath).toBe("src/a.ts");
      expect(diffs[0].newPath).toBe("src/a.ts");
      expect(diffs[0].diff).toHaveLength(10000);
    });

    it("caps the number of returned files at 15", async () => {
      const files = Array.from({ length: 20 }, (_, i) => ({
        new_path: `src/file-${i}.ts`,
        diff: "change",
        new_file: false,
        deleted_file: false,
      }));
      mockedGet.mockResolvedValueOnce({ data: files });

      const client = new GitLabClient();
      const diffs = await client.getMRDiffs(10);

      expect(diffs).toHaveLength(15);
    });

    it("returns an empty array when the request fails", async () => {
      mockedGet.mockRejectedValueOnce(new Error("network error"));

      const client = new GitLabClient();
      const diffs = await client.getMRDiffs(10);

      expect(diffs).toEqual([]);
    });
  });
});
