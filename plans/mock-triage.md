# Plan: Mock Anthropic Triage API Call

## Goal

Eliminate the `claude` subprocess invocation during development so the full pipeline runs instantly with zero AI API calls, while keeping a single mock data file for both the GitHub and triage mocks.

## Approach

Add a `triage` property to each entry in the existing `data/mock-issues.json`. When `--mock` is passed, `triageIssue` looks up the issue by `number` in that file and returns the pre-authored `triage` object, bypassing the `query()` call entirely.

`github.ts` already ignores unknown fields, so adding `triage` to the JSON doesn't affect it. Each consumer reads only the fields it needs from the shared file.

## Files

| File | Change |
|------|--------|
| `data/mock-issues.json` | Add `triage` property to each entry |
| `src/triage.ts` | Add `mock = false` parameter; load JSON and return `triage` by `issue.number` when true |
| `src/index.ts` | Pass `mock` to `triageIssue` |

## Implementation

### `data/mock-issues.json`

Each entry gains a `triage` object:

```json
{
  "number": 42,
  "title": "...",
  "body": "...",
  "html_url": "...",
  "triage": {
    "severity": "high",
    "category": "Reliability",
    "summary": "...",
    "suggestedAction": "..."
  }
}
```

The `triage` field is typed to match `TriageSchema` — `severity` must be `"low"`, `"medium"`, or `"high"`.

### `src/triage.ts`

```typescript
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

// existing imports unchanged ...

export async function triageIssue(issue: Issue, mock = false): Promise<Triage> {
  if (mock) {
    const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const raw = await readFile(join(projectRoot, "data", "mock-issues.json"), "utf-8");
    const entries = JSON.parse(raw) as Array<{ number: number; triage: unknown }>;
    const entry = entries.find((e) => e.number === issue.number);
    if (!entry) {
      throw new Error(`No mock triage data for issue #${issue.number}`);
    }
    return TriageSchema.parse(entry.triage);
  }

  // ... existing query() logic unchanged
}
```

Parsing through `TriageSchema` on the mock path catches typos in the JSON at run time, which is useful since the file is hand-edited.

### `src/index.ts`

```typescript
const triage = await triageIssue({
  title: issue.title,
  body: issue.body ?? null,
  number: issue.number,
  html_url: issue.html_url,
}, mock);
```

`mock` is already in scope from the GitHub mock change.

## Usage

No change to the CLI — `--mock` now silences both network calls:

```bash
npm start -- --mock
```

## Why a single file over separate fixtures

Keeping the issue body and its expected triage result in the same JSON object makes it easy to reason about cause and effect when authoring test cases. A separate `mock-triage.json` would require keeping two files in sync by issue number — easy to forget.
