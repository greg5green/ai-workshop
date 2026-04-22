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
    /invalid_format/
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
