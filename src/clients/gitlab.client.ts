import axios from "axios";
import { config } from "../config";

export interface MergeRequest {
  id: number;
  iid: number;
  title: string;
  description: string;
  mergedAt: string;
  webUrl: string;
  issueKey: string;
}

export interface FileDiff {
  oldPath: string;
  newPath: string;
  diff: string;
  isNew: boolean;
  isDeleted: boolean;
}

export class GitLabClient {
  private readonly headers: Record<string, string>;
  private readonly baseUrl: string;
  private readonly projectId: string;

  constructor() {
    this.baseUrl = config.gitlab.url;
    this.projectId = config.gitlab.projectId;
    this.headers = {
      "Private-Token": config.gitlab.apiToken,
    };
  }

  async findMergedMRsByIssueKey(issueKey: string): Promise<MergeRequest[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/v4/projects/${this.projectId}/merge_requests`,
        {
          headers: this.headers,
          params: {
            state: "merged",
            search: issueKey,
            per_page: 10,
          },
        },
      );

      return response.data.filter((mr: any) => ({
        id: mr.id,
        iid: mr.iid,
        title: mr.title,
        description: mr.description || "",
        mergedAt: mr.merged_at,
        webUrl: mr.web_url,
        issueKey,
      }));
    } catch {
      return [];
    }
  }

  async getMRDiffs(mrIid: number): Promise<FileDiff[]> {
    try {
      const response = await axios.get(
        `${this.baseUrl}/api/v4/projects/${this.projectId}/merge_requests/${mrIid}/diffs`,
        { headers: this.headers, params: { per_page: 30 } },
      );

      return response.data
        .filter((d: any) => !this.isBinaryOrLockFile(d.new_path))
        .slice(0, 15)
        .map((d: any) => ({
          oldPath: d.oldPath,
          newPath: d.new_path,
          diff: (d.diff || "").slice(0, 10000),
          isNew: d.new_file,
          isDeleted: d.deleted_file,
        }));
    } catch {
      return [];
    }
  }

  private isBinaryOrLockFile(path: string): boolean {
    const skip = [
      ".lock",
      ".png",
      ".jpg",
      ".jpeg",
      ".gif",
      ".svg",
      ".ico",
      ".pdf",
      ".zip",
      ".tar",
      ".gz",
      ".7z",
      ".rar",
      ".mp3",
      ".mp4",
      ".avi",
      ".mov",
      ".wmv",
      ".flv",
      ".mkv",
    ];

    return skip.some((ext) => path.endsWith(ext));
  }
}
