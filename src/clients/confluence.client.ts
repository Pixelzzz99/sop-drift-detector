import axios from "axios";
import { config } from "../config";

export interface ConfluencePage {
  id: string;
  title: string;
  lastModified: string;
  version: number;
  webUrl: string;
  spaceKey: string;
}

export class ConfluenceClient {
  private readonly auth: { username: string; password: string };
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = config.confluence.url;
    this.auth = {
      username: config.confluence.username,
      password: config.confluence.apiToken,
    };
  }

  async getAllPagesUnderRoot(): Promise<ConfluencePage[]> {
    console.log(
      `[Confluence] Loading pages under pageId: ${config.confluence.rootPageId}...`,
    );
    const pages: ConfluencePage[] = [];
    await this.fetchPagesRecursively(config.confluence.rootPageId, pages, 0);
    console.log(`[Confluence] Found ${pages.length} pages total`);
    return pages;
  }

  private async fetchPagesRecursively(
    pageId: string,
    result: ConfluencePage[],
    depth: number,
  ): Promise<void> {
    if (depth > 5) return;

    let start = 0;
    let limit = 50;

    while(true) {
        const response = await axios.get(
            `${this.baseUrl}/rest/api/content/${pageId}/child/page`,
            {
                auth: this.auth,
                params: {
                    expand: 'version',
                    limit,
                    start,
                }
            }
        )

        const { results, size} = response.data;

        for(const page of results){
            result.push({
                id: page.id,
                title: page.title,
                lastModified: page.version.when || '',
                version: page.version?.number || 0,
                webUrl: `${this.baseUrl}${page._links?.webui || ''}`,
                spaceKey: page.space?.key || 'Products',
            })

            await this.fetchPagesRecursively(page.id, result, depth + 1);
        }

        start += size;
        if(size < limit) break;
    }
  }
}
