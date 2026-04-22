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

interface Check {
  name: string;
  passed: boolean;
  actual?: string;
  expected?: string;
}

interface RunResult {
  run: number;
  passed: boolean;
  triage?: Triage;
  error?: string;
  checks: Check[];
}

function gradeRun(triage: Triage, expected: Triage): Check[] {
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
      false
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
      const detail = check.expected !== undefined && !check.passed ? ` (expected ${check.expected})` : "";
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
