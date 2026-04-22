import "dotenv/config";
import { fileURLToPath } from "url";
import { fetchRecentIssues } from "./github.js";
import { triageIssue, type Triage } from "./triage.js";
import { scoutBug, type ScoutResult } from "./scout.js";

export type TriagedIssue = {
  number: number;
  title: string;
  html_url: string;
  body: string | null;
  triage: Triage;
  scout?: ScoutResult;
};

export function filterHighSeverity(results: TriagedIssue[]): TriagedIssue[] {
  return results.filter((r) => r.triage.severity === "high");
}

export function formatReport(results: TriagedIssue[]): string {
  if (results.length === 0) {
    return "No high-severity issues found.";
  }
  const lines: string[] = [`Found ${results.length} high-severity issue(s):\n`];
  for (const result of results) {
    lines.push(`Issue #${result.number}: ${result.title}`);
    lines.push(`URL:              ${result.html_url}`);
    lines.push(`Category:         ${result.triage.category}`);
    lines.push(`Summary:          ${result.triage.summary}`);
    lines.push(`Suggested Action: ${result.triage.suggestedAction}`);
    if (result.scout) {
      lines.push(`Scout:            ${result.scout.filePath} (lines ${result.scout.lineRange})`);
      lines.push(`                  ${result.scout.explanation}`);
    }
    lines.push("---");
  }
  return lines.join("\n");
}

async function main() {
  const repo = process.env.GITHUB_REPO;
  if (!repo) {
    throw new Error("GITHUB_REPO environment variable is not set");
  }
  const repoUrl = `https://github.com/${repo}`;
  const mock = process.argv.includes("--mock");
  const issues = await fetchRecentIssues(repo, mock);
  const triaged: TriagedIssue[] = [];
  for (const issue of issues) {
    const triage = await triageIssue({
      title: issue.title,
      body: issue.body ?? null,
      number: issue.number,
      html_url: issue.html_url,
    }, mock);
    triaged.push({ number: issue.number, title: issue.title, html_url: issue.html_url, body: issue.body ?? null, triage });
  }
  const highSeverity = filterHighSeverity(triaged);
  await Promise.all(
    highSeverity.map(async (item) => {
      item.scout = await scoutBug(
        { title: item.title, body: item.body, number: item.number, html_url: item.html_url },
        repoUrl,
        mock
      );
    })
  );
  console.log(formatReport(highSeverity));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
