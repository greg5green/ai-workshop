# Plan: Eval Integration Test for Triage Categorization

## Goal

Validate that the triage prompt reliably produces correct structured output by running it against the first mock issue three times with the real Anthropic API and grading each result.

This is a separate eval script — it makes live API calls and is not part of `npm test`.

---

## Dataset

Use **issue #42** — the first entry in `data/mock-issues.json`.

```json
{
  "number": 42,
  "title": "Application crashes on startup when DATABASE_URL is missing",
  "body": "...",
  "html_url": "https://github.com/example/myapp/issues/42"
}
```

Ground truth (from mock-issues.json `triage` field):

| Field | Expected value |
|-------|---------------|
| `severity` | `"high"` |
| `category` | `"Reliability"` |
| `summary` | non-empty string |
| `suggestedAction` | non-empty string |

---

## Run configuration

| Parameter | Value |
|-----------|-------|
| Dataset items used | 1 (always the first entry) |
| Runs per item | 3 |
| API calls total | 3 |
| Mock mode | `false` — real Anthropic API |

Runs are sequential (not concurrent) to keep output readable.

---

## Grading rubric

Each run is graded independently. A run **passes** if all of the following hold:

| Check | Pass condition | Weight |
|-------|---------------|--------|
| **Parse** | `TriageSchema.parse()` succeeds with no exception | Required — fail immediately if this fails |
| **Severity** | `severity === "high"` | Required — must match ground truth exactly |
| **Category** | `category` is a non-empty string | Required |
| **Summary** | `summary.length >= 20` | Required |
| **Suggested action** | `suggestedAction.length >= 20` | Required |

A run that throws (network error, malformed JSON, schema mismatch) is recorded as a failed run with the error message, not a crash.

---

## Report format

```
Triage eval — issue #42 (3 runs)
=================================

Run 1: PASS
  severity:        high ✓
  category:        Reliability
  summary:         App crashes with an unhelpful stack trace when DATABASE_URL is missing...
  suggestedAction: Add an early env-var guard in the startup sequence...

Run 2: PASS
  ...

Run 3: FAIL
  severity:        medium ✗ (expected high)
  category:        Reliability
  summary:         ...
  suggestedAction: ...

Result: 2 / 3 runs passed
```

Exit code `0` if all 3 pass, `1` otherwise.

---

## New file: `src/triage.eval.ts`

```typescript
import { readFile } from "fs/promises";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { triageIssue, TriageSchema, type Triage } from "./triage.js";

const RUNS = 3;

interface MockEntry {
  number: number;
  title: string;
  body: string | null;
  html_url: string;
  triage: Triage;
}

async function loadFirstIssue(): Promise<MockEntry> {
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
  const raw = await readFile(join(projectRoot, "data", "mock-issues.json"), "utf-8");
  const entries = JSON.parse(raw) as MockEntry[];
  return entries[0];
}

interface RunResult {
  run: number;
  passed: boolean;
  triage?: Triage;
  error?: string;
  checks: { name: string; passed: boolean; actual?: string; expected?: string }[];
}

function gradeRun(triage: Triage, expected: Triage): RunResult["checks"] {
  return [
    {
      name: "severity",
      passed: triage.severity === expected.severity,
      actual: triage.severity,
      expected: expected.severity,
    },
    {
      name: "category non-empty",
      passed: triage.category.length > 0,
      actual: triage.category,
    },
    {
      name: "summary length >= 20",
      passed: triage.summary.length >= 20,
      actual: `${triage.summary.length} chars`,
    },
    {
      name: "suggestedAction length >= 20",
      passed: triage.suggestedAction.length >= 20,
      actual: `${triage.suggestedAction.length} chars`,
    },
  ];
}

async function runEval(issue: MockEntry, run: number): Promise<RunResult> {
  try {
    const triage = await triageIssue(
      { title: issue.title, body: issue.body, number: issue.number, html_url: issue.html_url },
      false  // real API call
    );
    const checks = gradeRun(triage, issue.triage);
    const passed = checks.every((c) => c.passed);
    return { run, passed, triage, checks };
  } catch (err) {
    return {
      run,
      passed: false,
      error: err instanceof Error ? err.message : String(err),
      checks: [],
    };
  }
}

function printResult(result: RunResult): void {
  console.log(`\nRun ${result.run}: ${result.passed ? "PASS" : "FAIL"}`);
  if (result.error) {
    console.log(`  error: ${result.error}`);
    return;
  }
  if (result.triage) {
    for (const check of result.checks) {
      const mark = check.passed ? "✓" : "✗";
      const detail = check.expected && !check.passed ? ` (expected ${check.expected})` : "";
      console.log(`  ${check.name}: ${check.actual} ${mark}${detail}`);
    }
  }
}

async function main(): Promise<void> {
  const issue = await loadFirstIssue();
  console.log(`Triage eval — issue #${issue.number} (${RUNS} runs)`);
  console.log("=".repeat(40));

  const results: RunResult[] = [];
  for (let i = 1; i <= RUNS; i++) {
    const result = await runEval(issue, i);
    printResult(result);
    results.push(result);
  }

  const passed = results.filter((r) => r.passed).length;
  console.log(`\nResult: ${passed} / ${RUNS} runs passed`);
  process.exit(passed === RUNS ? 0 : 1);
}

main();
```

---

## package.json change

Add one script:

```json
"eval": "node --import tsx/esm src/triage.eval.ts"
```

Run with:

```bash
npm run eval
```

---

## Files changed

| File | Change |
|------|--------|
| `src/triage.eval.ts` | New — eval harness |
| `package.json` | Add `"eval"` script |

No changes to `src/triage.ts`, test files, or mock data.

---

## Prerequisites

- `ANTHROPIC_API_KEY` must be set (or `.env` must contain it)
- `CLAUDE_CODE_PATH` must point to a valid `claude` binary (used by `query()`)
- Not part of `npm test` — runs only on explicit `npm run eval`
