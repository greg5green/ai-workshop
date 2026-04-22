# Plan: Bug Scout Step

## Goal

After triage, for each high-severity issue, clone the referenced repo locally and run a Claude agent against the codebase to pinpoint where the bug likely lives — returning a file path, line range, and explanation. This step runs between triage and the final report.

## Pipeline before and after

**Before:**
```
fetchRecentIssues → triageIssue → filterHighSeverity → formatReport
```

**After:**
```
fetchRecentIssues → triageIssue → filterHighSeverity → scoutBug → formatReport
```

Scouting only runs on high-severity issues. Low and medium issues skip the step and carry no scout result.

---

## New type: `ScoutResult`

```typescript
export type ScoutResult = {
  filePath: string;       // e.g. "src/server/startup.ts"
  lineRange: string;      // e.g. "42-61"
  snippet: string;        // the relevant lines verbatim
  explanation: string;    // why this is the likely bug location
};
```

`TriagedIssue` in `src/index.ts` gains an optional field:

```typescript
export type TriagedIssue = {
  number: number;
  title: string;
  html_url: string;
  triage: Triage;
  scout?: ScoutResult;   // present only for high-severity issues after scouting
};
```

---

## New file: `src/scout.ts`

The file exports three functions rather than one. This separation is the key to testability: `scoutInDirectory` can be exercised against any local directory without touching the network, and `cloneRepo` is a thin, independently verifiable shell wrapper.

### `cloneRepo` — exported, traditional code only

```typescript
import { mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";

const execFileAsync = promisify(execFile);

export async function cloneRepo(repoUrl: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "scout-"));
  await execFileAsync("git", ["clone", "--depth", "1", repoUrl, dir]);
  return dir;
}
```

No agent involvement. The function's only job is to produce a populated directory path.

### `scoutInDirectory` — exported, agent only

Takes an already-populated directory. No cloning, no cleanup — the caller owns the directory lifecycle.

```typescript
import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";

const SCOUT_PROMPT = (issue: Issue) => `\
You are a bug scout. A user reported a bug in this repository. Your task is to:
1. Read the issue title and body carefully.
2. Explore the codebase to find the most likely location of the bug.
3. Respond with ONLY a JSON object — no markdown, no extra text.

Issue #${issue.number}: ${issue.title}

Body:
${issue.body ?? "(no body provided)"}

Required JSON format:
{
  "filePath": "path/to/file.ts",
  "lineRange": "start-end",
  "snippet": "the relevant lines verbatim",
  "explanation": "why this is the likely bug location"
}`;

export async function scoutInDirectory(issue: Issue, dir: string): Promise<ScoutResult> {
  const messages = query({
    prompt: SCOUT_PROMPT(issue),
    options: {
      model: "claude-sonnet-4-6",
      maxTurns: 10,
      cwd: dir,
      pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH ?? "claude",
    },
  });

  let resultMessage: SDKResultMessage | undefined;
  for await (const message of messages) {
    if (message.type === "result") {
      resultMessage = message as SDKResultMessage;
    }
  }

  if (!resultMessage || resultMessage.subtype !== "success") {
    throw new Error(`Scout query failed: ${resultMessage?.subtype ?? "no result"}`);
  }

  const text = resultMessage.result.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();
  return ScoutResultSchema.parse(JSON.parse(text) as unknown);
}
```

`maxTurns: 10` gives the agent enough room to explore directories and read several files before committing to an answer.

### `scoutBug` — exported, orchestrates the above two

```typescript
export async function scoutBug(
  issue: Issue,
  repoUrl: string,
  mock = false
): Promise<ScoutResult>
```

- Mock path: reads the `scout` field from `data/mock-issues.json` — no filesystem side-effects.
- Real path: calls `cloneRepo`, then `scoutInDirectory`, then cleans up in `finally`.

```typescript
export async function scoutBug(issue: Issue, repoUrl: string, mock = false): Promise<ScoutResult> {
  if (mock) {
    const entries = JSON.parse(await readFile(mockPath, "utf-8")) as MockEntry[];
    const entry = entries.find((e) => e.number === issue.number);
    if (!entry?.scout) {
      throw new Error(`No mock scout data for issue #${issue.number}`);
    }
    return ScoutResultSchema.parse(entry.scout);
  }

  const dir = await cloneRepo(repoUrl);
  try {
    return await scoutInDirectory(issue, dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
```

`scoutBug` contains no logic of its own beyond the mock branch and the clone/cleanup envelope. All meaningful logic lives in the two extracted functions.

### Schema

```typescript
import { z } from "zod";

export const ScoutResultSchema = z.object({
  filePath: z.string().min(1),
  lineRange: z.string().regex(/^\d+-\d+$/),
  snippet: z.string().min(1),
  explanation: z.string().min(20),
});

export type ScoutResult = z.infer<typeof ScoutResultSchema>;
```

---

## Changes to `src/index.ts`

### Derive the clone URL from `GITHUB_REPO`

The env var is already `owner/repo` format. Construct the HTTPS URL:

```typescript
const repoUrl = `https://github.com/${repo}`;
```

### Call `scoutBug` after filtering

Only high-severity issues are scouted. The filtered array is iterated to attach scout results:

```typescript
const highSeverity = filterHighSeverity(triaged);
for (const item of highSeverity) {
  item.scout = await scoutBug(
    { title: item.title, body: item.triage.summary, number: item.number, html_url: item.html_url },
    repoUrl,
    mock
  );
}
console.log(formatReport(highSeverity));
```

The body passed to `scoutBug` re-uses the original issue body. The full `Issue` objects should be retained alongside `TriagedIssue` so the original body is accessible; the simplest fix is to store `body` on `TriagedIssue` as well.

### `formatReport` update

Append scout findings when present:

```
Issue #42: Application crashes on startup when DATABASE_URL is missing
URL:              https://github.com/example/myapp/issues/42
Category:         Reliability
Summary:          App crashes with unhelpful stack trace when DATABASE_URL is absent
Suggested Action: Add early env-var guard in startup sequence
Scout:            src/server/startup.ts (lines 42-61)
                  Explanation: DATABASE_URL is read on line 44 with no null check...
---
```

---

## `data/mock-issues.json` additions

Each entry that has `"severity": "high"` in its `triage` object gains a `scout` field:

```json
{
  "number": 42,
  "title": "Application crashes on startup when DATABASE_URL is missing",
  "body": "...",
  "html_url": "...",
  "triage": { "severity": "high", "category": "Reliability", ... },
  "scout": {
    "filePath": "src/server/startup.ts",
    "lineRange": "42-61",
    "snippet": "const db = new Database(process.env.DATABASE_URL);",
    "explanation": "DATABASE_URL is used without a null-check on line 44. When the env var is absent, the Database constructor throws and the process exits with an unhandled exception."
  }
}
```

---

## `--mock` flag propagation

`scoutBug` already accepts `mock`. The existing `const mock = process.argv.includes("--mock")` in `main()` is passed through without new flags.

---

## Files changed

| File | Change |
|------|--------|
| `src/scout.ts` | New — `ScoutResultSchema`, `ScoutResult`, `scoutBug` |
| `src/index.ts` | Add `body` to `TriagedIssue`; call `scoutBug` after filter; update `formatReport` |
| `data/mock-issues.json` | Add `scout` field to high-severity entries |

---

## Prerequisites

- `git` must be available in `PATH` (used for shallow clone)
- `ANTHROPIC_API_KEY` + `CLAUDE_CODE_PATH` required for live mode (same as triage)
- Scouting a real repo for the first time will be slow (~30–60 s per issue) due to clone + agent turns; mock mode is instant
- The clone URL is derived from `GITHUB_REPO`; it must be a public repo or the environment must have SSH/token access configured globally for `git clone` to succeed
