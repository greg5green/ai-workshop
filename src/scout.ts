import { z } from "zod";
import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { readFile, mkdtemp, rm } from "fs/promises";
import { join, dirname } from "path";
import { tmpdir } from "os";
import { execFile } from "child_process";
import { promisify } from "util";
import { fileURLToPath } from "url";
import type { Issue } from "./triage.js";

const execFileAsync = promisify(execFile);

export const ScoutResultSchema = z.object({
  filePath: z.string().min(1),
  lineRange: z.string().regex(/^\d+-\d+$/),
  snippet: z.string().min(1),
  explanation: z.string().min(20),
});

export type ScoutResult = z.infer<typeof ScoutResultSchema>;

export async function cloneRepo(repoUrl: string): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "scout-"));
  await execFileAsync("git", ["clone", "--depth", "1", repoUrl, dir]);
  return dir;
}

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

export async function scoutBug(issue: Issue, repoUrl: string, mock = false): Promise<ScoutResult> {
  if (mock) {
    const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const raw = await readFile(join(projectRoot, "data", "mock-issues.json"), "utf-8");
    const entries = JSON.parse(raw) as Array<{ number: number; scout?: unknown }>;
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
