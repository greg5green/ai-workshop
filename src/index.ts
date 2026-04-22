import "dotenv/config";
import { fetchRecentIssues } from "./github.js";
import { triageIssue, type Triage } from "./triage.js";

async function main() {
  const repo = process.env.GITHUB_REPO;
  if (!repo) {
    throw new Error("GITHUB_REPO environment variable is not set");
  }

  const issues = await fetchRecentIssues(repo);

  const highSeverityResults: Array<{
    number: number;
    title: string;
    html_url: string;
    triage: Triage;
  }> = [];

  for (const issue of issues) {
    const triage = await triageIssue({
      title: issue.title,
      body: issue.body ?? null,
      number: issue.number,
      html_url: issue.html_url,
    });

    if (triage.severity === "high") {
      highSeverityResults.push({
        number: issue.number,
        title: issue.title,
        html_url: issue.html_url,
        triage,
      });
    }
  }

  if (highSeverityResults.length === 0) {
    console.log("No high-severity issues found.");
    return;
  }

  console.log(`Found ${highSeverityResults.length} high-severity issue(s):\n`);

  for (const result of highSeverityResults) {
    console.log(`Issue #${result.number}: ${result.title}`);
    console.log(`URL:              ${result.html_url}`);
    console.log(`Category:         ${result.triage.category}`);
    console.log(`Summary:          ${result.triage.summary}`);
    console.log(`Suggested Action: ${result.triage.suggestedAction}`);
    console.log("---");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
