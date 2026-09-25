import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { ConfluencePage } from "../clients/confluence.client";
import { DiffAnalysis } from "./diff.analyzer";
import { Matcher, MatchedPage } from "./matcher";

const SEMANTIC_SCORE = 100;
const MAX_RESULTS = 3;
const CONTENT_PREVIEW_LENGTH = 300;

export class SemanticMatcher {
  private readonly client: Anthropic;
  private readonly matcher: Matcher;

  constructor() {
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
    this.matcher = new Matcher();
  }

  async findRelatedPages(
    analysis: DiffAnalysis,
    pages: ConfluencePage[],
    mergedAt: string,
  ): Promise<MatchedPage[]> {
    if (pages.length === 0) return [];

    const pageList = pages
      .map((p, i) => `${i}. "${p.title}" — ${p.content.slice(0, CONTENT_PREVIEW_LENGTH)}`)
      .join("\n");

    const prompt = `Ты помогаешь найти страницы документации Confluence, семантически связанные с изменением в коде. Ищи смысловые совпадения — синонимы, парафразы, другую терминологию для того же процесса/фичи, а не только буквальные слова.

Изменение: ${analysis.summary}
Ключевые слова: ${analysis.keywords.join(", ")}

Страницы документации (номер, заголовок, начало текста):
${pageList}

Выбери не больше ${MAX_RESULTS} страниц, которые действительно относятся к этому изменению, и отсортируй по убыванию релевантности. Если релевантных страниц нет — верни пустой массив.

Ответь строго JSON-массивом номеров страниц, например: [2, 0] или [].`;

    const message = await this.client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 100,
      messages: [{ role: "user", content: prompt }],
    });

    const text = (message.content[0] as any).text.trim();
    const jsonMatch = text.match(/\[[^\]]*\]/);
    if (!jsonMatch) {
      throw new Error("Semantic matcher: no JSON array found in LLM response");
    }

    const indices = JSON.parse(jsonMatch[0]);
    if (!Array.isArray(indices)) {
      throw new Error("Semantic matcher: LLM response is not an array");
    }

    return indices
      .filter((i: unknown): i is number => typeof i === "number" && pages[i] !== undefined)
      .slice(0, MAX_RESULTS)
      .map((i: number) =>
        this.matcher.buildMatchedPage(pages[i], mergedAt, SEMANTIC_SCORE, []),
      );
  }
}
