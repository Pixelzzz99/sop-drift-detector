import * as fs from "fs";
import * as path from "path";
import { ReportEntity } from "..";
import { config } from "../config";

function escapeHtml(value: string): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export class HtmlReporter {
  generate(entries: ReportEntity[], outputDir: string = "reports"): string {
    const date = new Date().toISOString().split("T")[0];
    const filename = `report-${date}.html`;
    const filepath = path.join(outputDir, filename);

    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const driftedCount = entries.filter((e) =>
      e.matchedPages.some((p) => p.isDrifted),
    ).length;

    const html = `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>SOP Drift Report — ${date}</title>
  <style>
    .header { background: #2e5bba; color: white; padding: 24px 40px; }
    .header h1 { font-size: 24px; font-weight: 700; }
    .header p { opacity: 0.8; margin-top: 4px; font-size: 14px; }
    .stats { display: flex; gap: 16px; padding: 20px 40px; background: white; border-bottom: 1px solid #e0e0e0; }
    .stat { background: #f8f9ff; border: 1px solid #e0e7ff; border-radius: 8px; padding: 12px 20px; text-align: center; }
    .stat .num { font-size: 28px; font-weight: 700; color: #2e5bba; }
    .stat .label { font-size: 12px; color: #666; margin-top: 2px; }
    .stat.warn .num { color: #e85d04; }
    .container { max-width: 1100px; margin: 24px auto; padding: 0 40px; }
    .entry { background: white; border-radius: 12px; margin-bottom: 20px; overflow: hidden; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
    .entry-header { padding: 16px 20px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; gap: 12px; }
    .issue-key { background: #2e5bba; color: white; border-radius: 6px; padding: 4px 10px; font-size: 13px; font-weight: 600; white-space: nowrap; }
    .issue-summary { font-size: 15px; font-weight: 500; flex: 1; }
    .mr-link { font-size: 13px; color: #2e5bba; text-decoration: none; }
    .mr-link:hover { text-decoration: underline; }
    .entry-body { padding: 16px 20px; }
    .analysis-box { background: #f8f9ff; border-left: 3px solid #2e5bba; border-radius: 4px; padding: 10px 14px; margin-bottom: 14px; font-size: 14px; }
    .analysis-box .label { font-size: 11px; color: #666; text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 4px; }
    .keywords { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
    .keyword { background: #e0e7ff; color: #2e5bba; border-radius: 20px; padding: 2px 10px; font-size: 12px; }
    .pages-title { font-size: 13px; font-weight: 600; color: #444; margin-bottom: 10px; }
    .page-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 14px; border-radius: 8px; margin-bottom: 6px; border: 1px solid #eee; }
    .page-item.drifted { background: #fff8f0; border-color: #ffd4a8; }
    .page-item.ok { background: #f0fff4; border-color: #b7f5c8; }
    .page-name { font-size: 14px; }
    .page-name a { color: #1a1a2e; text-decoration: none; }
    .page-name a:hover { color: #2e5bba; text-decoration: underline; }
    .page-meta { display: flex; align-items: center; gap: 10px; }
    .badge { border-radius: 20px; padding: 3px 10px; font-size: 12px; font-weight: 600; white-space: nowrap; }
    .badge.warn { background: #ffe4cc; color: #c05a00; }
    .badge.ok { background: #ccf0d8; color: #1a7a3a; }
    .days { font-size: 12px; color: #888; }
    .no-pages { font-size: 13px; color: #888; font-style: italic; padding: 8px 0; }
    .mr-meta { font-size: 12px; color: #888; margin-top: 4px; }
    .no-mr { font-size: 13px; color: #aaa; font-style: italic; padding: 8px 0; }
    .footer { text-align: center; color: #aaa; font-size: 12px; padding: 32px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>SOP Drift Report</h1>
    <p>MyClick · ${date} · последние ${this.getDaysBack()} дней</p>
  </div>

  <div class="stats">
    <div class="stat">
      <div class="num">${entries.length}</div>
      <div class="label">Закрытых задач</div>
    </div>
    <div class="stat">
      <div class="num">${entries.filter((e) => e.mergeRequests.length > 0).length}</div>
      <div class="label">Со смерженным MR</div>
    </div>
    <div class="stat warn">
      <div class="num">${driftedCount}</div>
      <div class="label">Задач с устаревшими страницами</div>
    </div>
    <div class="stat warn">
      <div class="num">${this.countDriftedPages(entries)}</div>
      <div class="label">Страниц требуют обновления</div>
    </div>
  </div>

  <div class="container">
    ${entries.map((e) => this.renderEntry(e)).join("")}
  </div>

  <div class="footer">
    Сгенерировано SOP Drift Detector · ${new Date().toLocaleString("ru-RU")}
  </div>
</body>
</html>`;

    fs.writeFileSync(filepath, html, "utf-8");
    return filepath;
  }

  private renderEntry(entry: ReportEntity): string {
    const hasDrift = entry.matchedPages.some((p) => p.isDrifted);

    const mrSection =
      entry.mergeRequests.length > 0
        ? entry.mergeRequests
            .map(
              (mr) => `
        <div>
            <a class="mr-link" href="${escapeHtml(mr.webUrl)}" target="_blank">🔀 ${escapeHtml(mr.title)}</a>
            <div class="mr-meta">Смержен: ${this.formatDate(mr.mergedAt)}</div>
          </div>`,
            )
            .join("")
        : `<div class="no-mr">MR с ключом задачи не найден</div>`;

    const analysisSection = entry.analysis
      ? `<div class="analysis-box">
          <div class="label">Что изменилось</div>
          <div>${escapeHtml(entry.analysis.summary)}</div>
          <div class="keywords">
            ${entry.analysis.keywords.map((k) => `<span class="keyword">${escapeHtml(k)}</span>`).join("")}
          </div>
        </div>`
      : "";

    const pagesSection =
      entry.matchedPages.length > 0
        ? `<div class="pages-title">📄 Связанные страницы Confluence:</div>
         ${entry.matchedPages
           .map(
             (mp) => `
          <div class="page-item ${mp.isDrifted ? "drifted" : "ok"}">
            <div class="page-name">
              <a href="${escapeHtml(mp.page.webUrl)}" target="_blank">${escapeHtml(mp.page.title)}</a>
            </div>
            <div class="page-meta">
              <span class="days">обновлена ${mp.daysSinceUpdate} дн. назад</span>
              <span class="badge ${mp.isDrifted ? "warn" : "ok"}">
                ${mp.isDrifted ? "⚠️ Устарела" : "✅ Актуальна"}
              </span>
            </div>
          </div>`,
           )
           .join("")}`
        : `<div class="no-pages">Связанные страницы не найдены</div>`;

    return `
    <div class="entry">
      <div class="entry-header">
        <span class="issue-key">${escapeHtml(entry.issue.key)}</span>
        <span class="issue-summary">${escapeHtml(entry.issue.summary)}</span>
      </div>
      <div class="entry-body">
        ${mrSection}
        ${analysisSection}
        ${pagesSection}
      </div>
    </div>`;
  }

  private formatDate(dateStr: string): string {
    if (!dateStr) return "-";
    return new Date(dateStr).toLocaleDateString("ru-RU", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  }

  private getDaysBack(): number {
    return config.daysBack;
  }

  private countDriftedPages(entries: ReportEntity[]): number {
    return entries.reduce(
      (sum, e) => sum + e.matchedPages.filter((p) => p.isDrifted).length,
      0,
    );
  }
}
