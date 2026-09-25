import axios from "axios";
import { config } from "../config";

export interface ConfluencePage {
  id: string;
  title: string;
  lastModified: string;
  version: number;
  webUrl: string;
  spaceKey: string;
  content: string;
}

export class ConfluenceClient {
  private readonly headers: Record<string, string>;
  private readonly baseUrl: string;

  constructor() {
    this.baseUrl = config.confluence.url;
    this.headers = {
      Authorization: `Bearer ${config.confluence.apiToken}`,
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
                headers: this.headers,
                params: {
                    expand: 'version,body.storage',
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
                content: this.stripHtml(page.body?.storage?.value || '').slice(0, 5000),
            })

            await this.fetchPagesRecursively(page.id, result, depth + 1);
        }

        start += size;
        if(size < limit) break;
    }
  }

  private stripHtml(html: string): string {
    return html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s+/g, ' ')
      .trim();
  }
}
