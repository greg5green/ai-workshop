# Bug Triage Bot — Implementation Tasks

## Phase 1 — Project scaffold
- [ ] Create `package.json` with `"start": "tsx src/index.ts"`
- [ ] Create `tsconfig.json`
- [ ] Create `src/` with empty stubs for `index.ts`, `github.ts`, `triage.ts`

## Phase 2 — Install dependencies
- [ ] Runtime: `@anthropic-ai/claude-agent-sdk`, `@octokit/rest`, `zod`, `dotenv`
- [ ] Dev: `typescript`, `tsx`

## Phase 3 — `github.ts`
- [ ] Octokit client from `GITHUB_TOKEN`
- [ ] `fetchRecentIssues(repo)` → 10 most recent open issues

## Phase 4 — `triage.ts`
- [ ] `TriageSchema` (severity / category / summary / suggestedAction)
- [ ] `triageIssue(issue)` → calls `query()`, captures `ResultMessage`, parses with Zod

## Phase 5 — `index.ts`
- [ ] Load env, fetch issues, triage sequentially, filter to `high`, print formatted output

## Phase 6 — End-to-end test
- [ ] `.env` with real credentials + `GITHUB_REPO=facebook/react`
- [ ] `npm start` → verify 10 issues triaged, high-severity results printed
