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
