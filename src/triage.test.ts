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
    /invalid_value/
  );
});

test("TriageSchema accepts valid data", () => {
  const result = TriageSchema.parse({ severity: "low", category: "Docs", summary: "s", suggestedAction: "a" });
  assert.equal(result.severity, "low");
});
