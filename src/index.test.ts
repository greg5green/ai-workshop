import { test } from "node:test";
import assert from "node:assert/strict";
import { filterHighSeverity, formatReport } from "./index.js";

const highResult = {
  number: 1, title: "Crash on boot", html_url: "https://example.com/1", body: null,
  triage: { severity: "high" as const, category: "Reliability", summary: "s", suggestedAction: "a" },
};
const lowResult = {
  number: 2, title: "Typo in footer", html_url: "https://example.com/2", body: null,
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
