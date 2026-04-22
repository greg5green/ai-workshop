# Plan: Unit Tests with Node Test Runner

## Goal

Cover each pipeline step with focused unit tests using `node:test` and `node:assert` — no external test framework. Tests run instantly via the existing mock data; no network calls, no subprocess invocations.

## What is and isn't testable today

| Path | Testable without changes? | Why |
|------|--------------------------|-----|
| `fetchRecentIssues` — validation | Yes | Pure logic, throws synchronously |
| `fetchRecentIssues` — mock path | Yes | Reads local file |
| `fetchRecentIssues` — Octokit path | No | Needs live token; covered by e2e |
| `triageIssue` — mock path | Yes | Reads local file |
| `triageIssue` — `query()` path | No | Spawns subprocess; covered by e2e |
| `TriageSchema.parse` | Yes | Pure Zod call |
| `main()` filtering + formatting | No | Logic is inline; needs extraction |

## Required refactor — `src/index.ts`

Extract two pure functions so the filtering and formatting logic can be tested without running `main()`.

### `filterHighSeverity`

```typescript
type TriagedIssue = {
  number: number;
  title: string;
  html_url: string;
  triage: Triage;
};

export function filterHighSeverity(results: TriagedIssue[]): TriagedIssue[] {
  return results.filter((r) => r.triage.severity === "high");
}
```

### `formatReport`

Returns a string instead of calling `console.log` inline, so tests can assert on the content.

```typescript
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
```

`main()` becomes:

```typescript
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
```

No behavior change — the output is identical.

## Test files

### `src/github.test.ts`

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchRecentIssues } from "./github.js";

test("throws on repo string with no slash", async () => {
  await assert.rejects(
    () => fetchRecentIssues("nodomain"),
    /Invalid repo format/
  );
});

test("throws on repo string with empty owner", async () => {
  await assert.rejects(
    () => fetchRecentIssues("/myapp"),
    /Invalid repo format/
  );
});

test("mock path returns an array of issues", async () => {
  const issues = await fetchRecentIssues("example/myapp", true);
  assert.ok(Array.isArray(issues));
  assert.ok(issues.length > 0);
  assert.ok(typeof issues[0].number === "number");
  assert.ok(typeof issues[0].title === "string");
});
```

### `src/triage.test.ts`

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { triageIssue, TriageSchema } from "./triage.js";

const baseIssue = { title: "Test", body: null, html_url: "https://example.com/1" };

test("mock path returns triage for a known issue number", async () => {
  const triage = await triageIssue({ ...baseIssue, number: 42 }, true);
  assert.equal(triage.severity, "high");
  assert.equal(triage.category, "Reliability");
  assert.ok(typeof triage.summary === "string");
  assert.ok(typeof triage.suggestedAction === "string");
});

test("mock path throws for an unknown issue number", async () => {
  await assert.rejects(
    () => triageIssue({ ...baseIssue, number: 9999 }, true),
    /No mock triage data for issue #9999/
  );
});

test("TriageSchema rejects an invalid severity value", () => {
  assert.throws(
    () => TriageSchema.parse({ severity: "critical", category: "x", summary: "x", suggestedAction: "x" }),
    /invalid_enum_value/
  );
});

test("TriageSchema accepts valid data", () => {
  const result = TriageSchema.parse({ severity: "low", category: "Docs", summary: "s", suggestedAction: "a" });
  assert.equal(result.severity, "low");
});
```

### `src/index.test.ts`

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { filterHighSeverity, formatReport } from "./index.js";

const highResult = {
  number: 1, title: "Crash on boot", html_url: "https://example.com/1",
  triage: { severity: "high" as const, category: "Reliability", summary: "s", suggestedAction: "a" },
};
const lowResult = {
  number: 2, title: "Typo in footer", html_url: "https://example.com/2",
  triage: { severity: "low" as const, category: "Docs", summary: "s", suggestedAction: "a" },
};

test("filterHighSeverity keeps only high-severity results", () => {
  const filtered = filterHighSeverity([highResult, lowResult]);
  assert.equal(filtered.length, 1);
  assert.equal(filtered[0].number, 1);
});

test("filterHighSeverity returns empty array when none are high", () => {
  assert.deepEqual(filterHighSeverity([lowResult]), []);
});

test("formatReport returns no-issues message for empty input", () => {
  assert.equal(formatReport([]), "No high-severity issues found.");
});

test("formatReport includes issue number, URL, and category", () => {
  const report = formatReport([highResult]);
  assert.ok(report.includes("Issue #1:"));
  assert.ok(report.includes("https://example.com/1"));
  assert.ok(report.includes("Reliability"));
});
```

## Test script

Add to `package.json`:

```json
"test": "node --import tsx/esm --test src/*.test.ts"
```

Run with:

```bash
npm test
```

## Files changed

| File | Change |
|------|--------|
| `src/index.ts` | Extract `TriagedIssue`, `filterHighSeverity`, `formatReport`; export all three; simplify `main()` |
| `src/github.test.ts` | New |
| `src/triage.test.ts` | New |
| `src/index.test.ts` | New |
| `package.json` | Add `"test"` script |
