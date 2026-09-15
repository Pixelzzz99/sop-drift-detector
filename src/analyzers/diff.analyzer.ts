import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config";
import { FileDiff } from "../clients/gitlab.client";

export interface DiffAnalysis {
  summary: string;
  keywords: string[];
  hasDocImpact: boolean;
}

export class DiffAnalyzer {
  private readonly client: Anthropic;

  constructor() {
    this.client = new Anthropic({ apiKey: config.anthropic.apiKey });
  }

  async analyze(
    issueKey: string,
    issueSummary: string,
    mrTitle: string,
    diffs: FileDiff[],
  ): Promise<DiffAnalysis> {
    if (diffs.length === 0) {
      return this.fallback(issueSummary, mrTitle);
    }

    const changedFiles = diffs.map((d) => d.newPath).join("\n");
    const diffSample = diffs
      .slice(0, 5)
      .map((d) => `-- ${d.newPath} ---\n${d.diff.slice(0, 800)}\n`)
      .join("\n\n");

    const prompt = `Ты анализируешь изменения в коде backend-сервиса (NestJS/TypeScript).

        Задача: ${issueKey} — ${issueSummary}
        MR: ${mrTitle}

        Изменённые файлы:
        ${changedFiles}

        Фрагмент diff:
        ${diffSample}

        Ответь строго в формате JSON:
        {
          "summary": "одно предложение — что именно изменилось в функциональности (не в коде, а в поведении системы)",
          "keywords": ["3-6 ключевых слов на русском для поиска в документации"],
          "hasDocImpact": true/false (false только если изменения чисто технические: рефакторинг, тесты, CI конфиги)
        }`;

    try {
      const message = await this.client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 300,
        messages: [{ role: "user", content: prompt }],
      });

      const text = (message.content[0] as any).text.trim();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]) as DiffAnalysis;
      }
    } catch (err) {
      console.warn(`[DiffAnalyzer] LLM failed for ${issueKey}, using fallback`);
    }

    return this.fallback(issueSummary, mrTitle);
  }

  private fallback(issueSummary: string, mrTitle: string): DiffAnalysis {
    const text = `${issueSummary} ${mrTitle}`;
    const keywords = text
      .toLowerCase()
      .replace(/[^\wа-яёА-ЯË\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3)
      .slice(0, 6);

    return {
      summary: issueSummary,
      keywords,
      hasDocImpact: true,
    };
  }
}
