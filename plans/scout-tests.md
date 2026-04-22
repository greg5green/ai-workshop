# Plan: Unit Tests for the Scout Step

## What is and isn't testable

| Path | Testable without changes? | Why |
|------|--------------------------|-----|
| `scoutBug` — mock path | Yes | Reads local file; pure async |
| `scoutBug` — throws for unknown issue | Yes | Same mock path |
| `ScoutResultSchema.parse` | Yes | Pure Zod call |
| `cloneRepo` | No | Runs `git clone`; needs network |
| `scoutInDirectory` — agent path | No | Spawns Claude Code; needs API |
| `formatReport` — with `scout` present | Yes | Pure string logic |
| `formatReport` — without `scout` | Yes | Already tested; regression guard |

The split of `scoutBug` into `cloneRepo` + `scoutInDirectory` + `scoutBug` (see `scout-bug.md`) is what makes this table possible. If all three were inlined into one function, the mock path would still be testable but none of the internal seams would be visible.

---

## Required abstraction (from `scout-bug.md`)

`scoutInDirectory(issue, dir)` is exported. This means a future integration test can point it at a local fixture directory — a small repo of TypeScript files — and verify the agent's JSON output without cloning or network access. That is not a unit test and is not written here, but the seam exists.

---

## New file: `src/scout.test.ts`

```typescript
import { test } from "node:test";
import assert from "node:assert/strict";
import { scoutBug, ScoutResultSchema } from "./scout.js";

const baseIssue = {
  title: "App crashes on startup",
  body: "Steps to reproduce: remove DATABASE_URL and restart.",
  number: 42,
  html_url: "https://github.com/example/myapp/issues/42",
};

test("mock path returns scout result for a known issue", async () => {
  const result = await scoutBug(baseIssue, "https://github.com/example/myapp", true);
  assert.ok(result.filePath.length > 0);
  assert.match(result.lineRange, /^\d+-\d+$/);
  assert.ok(result.snippet.length > 0);
  assert.ok(result.explanation.length >= 20);
});

test("mock path throws for an unknown issue number", async () => {
  await assert.rejects(
    () => scoutBug({ ...baseIssue, number: 9999 }, "https://github.com/example/myapp", true),
    /No mock scout data for issue #9999/
  );
});

test("ScoutResultSchema rejects a lineRange that is not digit-dash-digit", () => {
  assert.throws(
    () => ScoutResultSchema.parse({
      filePath: "src/server.ts",
      lineRange: "not-a-range",
      snippet: "const x = 1;",
      explanation: "This line assigns x without checking for null first.",
    }),
    /invalid_string/
  );
});

test("ScoutResultSchema rejects an empty filePath", () => {
  assert.throws(
    () => ScoutResultSchema.parse({
      filePath: "",
      lineRange: "1-10",
      snippet: "const x = 1;",
      explanation: "This line assigns x without checking for null first.",
    }),
    /too_small/
  );
});

test("ScoutResultSchema rejects an explanation shorter than 20 characters", () => {
  assert.throws(
    () => ScoutResultSchema.parse({
      filePath: "src/server.ts",
      lineRange: "1-10",
      snippet: "const x = 1;",
      explanation: "too short",
    }),
    /too_small/
  );
});

test("ScoutResultSchema accepts valid data", () => {
  const result = ScoutResultSchema.parse({
    filePath: "src/server/startup.ts",
    lineRange: "42-61",
    snippet: "const db = new Database(process.env.DATABASE_URL);",
    explanation: "DATABASE_URL is used without a null-check on line 44. When absent, the constructor throws.",
  });
  assert.equal(result.filePath, "src/server/startup.ts");
  assert.equal(result.lineRange, "42-61");
});
```

---

## Updates to `src/index.test.ts`

Two new tests cover the `formatReport` changes introduced for the scout step. Add them to the existing file alongside the existing `formatReport` tests.

```typescript
const scoutResult = {
  filePath: "src/server/startup.ts",
  lineRange: "42-61",
  snippet: "const db = new Database(process.env.DATABASE_URL);",
  explanation: "DATABASE_URL is used without a null-check. When absent, the constructor throws.",
};

test("formatReport includes scout file path and line range when scout is present", () => {
  const report = formatReport([{ ...highResult, scout: scoutResult }]);
  assert.ok(report.includes("src/server/startup.ts"));
  assert.ok(report.includes("42-61"));
});

test("formatReport omits Scout line when scout is absent", () => {
  const report = formatReport([highResult]);
  assert.ok(!report.includes("Scout:"));
});
```

---

## Files changed

| File | Change |
|------|--------|
| `src/scout.test.ts` | New — mock path, schema validation |
| `src/index.test.ts` | Add two `formatReport` tests for scout present/absent |
