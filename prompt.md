# Bug Triage Bot — Build Plan

## Overview

A TypeScript CLI tool that fetches the 10 most recent open GitHub issues from a repository and uses the Anthropic Claude Agent SDK to triage each one.

## Stack

- **Language:** TypeScript (Node.js)
- **GitHub client:** Octokit (`@octokit/rest`)
- **AI:** Claude Agent SDK (`@anthropic-ai/claude-agent-sdk`)
- **Model:** claude-sonnet-4-6

## Packages

| Package | Type | Purpose |
|---------|------|---------|
| `@anthropic-ai/claude-agent-sdk` | runtime | Claude Agent SDK — `query()` + message iteration |
| `@octokit/rest` | runtime | GitHub REST API client |
| `zod` | runtime | Parse and validate structured JSON from agent result |
| `dotenv` | runtime | Load `GITHUB_TOKEN`, `ANTHROPIC_API_KEY`, `GITHUB_REPO` from `.env` |
| `typescript` | dev | TypeScript compiler |
| `tsx` | dev | Run `.ts` files directly (`tsx src/index.ts`) |

## How It Works

1. Fetch the 10 most recent open issues from a target GitHub repo via Octokit
2. For each issue, pass the title, body, and existing labels to the Claude agent via `query()`
3. Prompt the agent to return a JSON object; collect the `ResultMessage` (the message where `"result" in message` is true) and parse it with Zod into structured output:
   - **Severity:** `high` | `medium` | `low`
   - **Category:** `bug` | `feature` | `other`
   - **Summary:** one-sentence description of the problem
   - **Suggested action:** what should happen next (e.g. assign to team, close as duplicate, request more info)
4. After triaging all 10, filter to `severity === 'high'` and print results

## Project Structure

```
/
├── src/
│   ├── index.ts          # Entry point — orchestrates fetch + triage
│   ├── github.ts         # Octokit setup, fetch issues
│   └── triage.ts         # Agent logic, prompt, response parsing
├── .env                  # GITHUB_TOKEN, ANTHROPIC_API_KEY, GITHUB_REPO (not committed)
├── prompt.md             # This file
├── package.json
└── tsconfig.json
```

## Configuration

Environment variables loaded from `.env` via `dotenv`:

- `GITHUB_TOKEN` — personal access token with `repo` read scope
- `ANTHROPIC_API_KEY` — Anthropic API key
- `GITHUB_REPO` — target repo in `owner/repo` format (e.g. `facebook/react`)

## Triage Flow (`triage.ts`)

Call `query()` with a prompt instructing Claude to return a raw JSON object (no markdown fences). Iterate over the async message stream and capture the message where `"result" in message`. Pass `message.result` to a Zod schema for validation and typing.

```typescript
import { query } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

const TriageSchema = z.object({
  severity: z.enum(["high", "medium", "low"]),
  category: z.enum(["bug", "feature", "other"]),
  summary: z.string(),
  suggestedAction: z.string(),
});

// collect ResultMessage, then: TriageSchema.parse(JSON.parse(message.result))
```

## Output

Issues are triaged sequentially. After all 10 are processed, only `high` severity results are printed to stdout, one per line, in the format:

```
[HIGH] [bug] facebook/react#12345 — <summary>
  Action: <suggestedAction>
```

## Steps

- [ ] Initialize `package.json` (with `"start": "tsx src/index.ts"`) and `tsconfig.json`
- [ ] Install dependencies
- [ ] Implement `github.ts` — fetch 10 most recent open issues
- [ ] Implement `triage.ts` — call `query()`, collect `ResultMessage`, parse with Zod
- [ ] Implement `index.ts` — loop over issues, post-filter for `high` severity, print results
- [ ] Test against `facebook/react` (has many real open issues)
