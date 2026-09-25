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

  describe("findMergedMRsByIssueKey", () => {
    it("sends the Private-Token header and search params", async () => {
      mockedGet.mockResolvedValueOnce({ data: [] });

      const client = new GitLabClient();
      await client.findMergedMRsByIssueKey("MYCLICK-1");

      expect(mockedGet).toHaveBeenCalledWith(
        "https://gitlab.example.com/api/v4/projects/42/merge_requests",
        expect.objectContaining({
          headers: { "Private-Token": "gitlab-token" },
          params: { state: "merged", search: "MYCLICK-1", per_page: 10 },
        }),
      );
    });

    it("maps raw GitLab MR objects to the MergeRequest shape", async () => {
      mockedGet.mockResolvedValueOnce({
        data: [
          {
            id: 1,
            iid: 10,
            title: "feat: do the thing",
            description: null,
            merged_at: "2026-09-10T12:00:00.000Z",
            web_url: "https://gitlab.example.com/mr/10",
          },
        ],
      });

      const client = new GitLabClient();
      const mrs = await client.findMergedMRsByIssueKey("MYCLICK-1");

      expect(mrs).toEqual([
        {
          id: 1,
          iid: 10,
          title: "feat: do the thing",
          description: "",
          mergedAt: "2026-09-10T12:00:00.000Z",
          webUrl: "https://gitlab.example.com/mr/10",
          issueKey: "MYCLICK-1",
        },
      ]);
    });

    it("returns an empty array when the request fails", async () => {
      mockedGet.mockRejectedValueOnce(new Error("network error"));

      const client = new GitLabClient();
      const mrs = await client.findMergedMRsByIssueKey("MYCLICK-1");

      expect(mrs).toEqual([]);
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
