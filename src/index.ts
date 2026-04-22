import "dotenv/config";
import { fileURLToPath } from "url";
import { fetchRecentIssues } from "./github.js";
import { triageIssue, type Triage } from "./triage.js";

export type TriagedIssue = {
  number: number;
  title: string;
  html_url: string;
  triage: Triage;
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
    lines.push("---");
  }
  return lines.join("\n");
}

async function main() {
  const repo = process.env.GITHUB_REPO;
  if (!repo) {
    throw new Error("GITHUB_REPO environment variable is not set");
  }
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
    triaged.push({ number: issue.number, title: issue.title, html_url: issue.html_url, triage });
  }
  console.log(formatReport(filterHighSeverity(triaged)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
