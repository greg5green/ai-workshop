# Plan: Mock GitHub Issues Network Call

## Goal

Remove the GitHub API dependency from the inner dev loop so the pipeline can be iterated on without a live token, rate-limit concerns, or network latency.

## Approach

Parse a `--mock` flag from `process.argv` in `index.ts` and pass it down to `fetchRecentIssues` as a boolean parameter. When `true`, the function reads from `data/mock-issues.json` instead of calling the Octokit API. No new abstraction layers, no test framework — just a single branch at the network boundary.

## Files

| File | Change |
|------|--------|
| `src/index.ts` | Parse `--mock` from `process.argv`, pass to `fetchRecentIssues` |
| `src/github.ts` | Add `mock` parameter; load JSON when true |
| `data/mock-issues.json` | New — realistic sample issues at different severities |

## Implementation

### `src/index.ts`

Parse the flag before calling `fetchRecentIssues`:

```typescript
const mock = process.argv.includes("--mock");
const issues = await fetchRecentIssues(repo, mock);
```

### `src/github.ts`

```typescript
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { Octokit } from "@octokit/rest";

let octokit: Octokit | null = null;
function getOctokit() {
  if (!octokit) {
    octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  }
  return octokit;
}

export async function fetchRecentIssues(repo: string, mock = false) {
  if (mock) {
    const dir = dirname(fileURLToPath(import.meta.url));
    const raw = await readFile(join(dir, "../../data/mock-issues.json"), "utf-8");
    return JSON.parse(raw) as ReturnType<typeof fetchRecentIssues> extends Promise<infer T> ? T : never;
  }

  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new Error(`Invalid repo format: "${repo}" — expected "owner/repo"`);
  }
  const { data } = await getOctokit().rest.issues.listForRepo({
    owner,
    repo: repoName,
    state: "open",
    per_page: 10,
    sort: "created",
    direction: "desc",
  });
  return data;
}
```

The cast on the parsed JSON is necessary because `JSON.parse` returns `any`. The shape of `data/mock-issues.json` only needs to include the fields `index.ts` actually reads (`number`, `title`, `body`, `html_url`); extra fields are fine and help the data look realistic.

### `data/mock-issues.json`

Already created. Contains 6 issues spanning:
- 2 high-severity candidates (crash on missing env var, SQL injection)
- 2 medium-severity candidates (slow dashboard, missing email)
- 2 low-severity candidates (dark-mode UI glitch, stale docs)

Edit this file freely when testing edge cases — add/remove issues, change bodies, etc.

## Usage

```bash
# Run with mock data (no token required, no network)
npm start -- --mock

# Run against the real GitHub API
npm start
```

`GITHUB_REPO` still needs to be set (or present in `.env`) even in mock mode, since `index.ts` reads it before deciding to fetch. `GITHUB_TOKEN` is not needed when `--mock` is passed.

## Why this approach over alternatives

| Alternative | Reason not chosen |
|-------------|-------------------|
| Environment variable | Less discoverable; flags show up in `--help` output and shell history naturally |
| Swap module at import time (e.g. separate `github.mock.ts`) | Requires restructuring imports in `index.ts` or adding a DI layer |
| `nock` / `msw` HTTP interception | Adds a dev dependency and a test runner; overkill for a one-file network boundary |
| Hardcode mock data in `github.ts` | Makes mock data invisible and harder to edit |

The `--mock` flag keeps the mock adjacent to the real implementation, is trivially reversible, and the JSON file is the single artifact to edit when adding test cases.
