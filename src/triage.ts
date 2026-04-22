import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

export const TriageSchema = z.object({
  severity: z.enum(["low", "medium", "high"]),
  category: z.string(),
  summary: z.string(),
  suggestedAction: z.string(),
});

export type Triage = z.infer<typeof TriageSchema>;

export interface Issue {
  title: string;
  body: string | null;
  number: number;
  html_url: string;
}

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
  const prompt = `You are a bug triage assistant. Analyze the following GitHub issue and return a JSON object that matches this schema exactly:

{
  "severity": "low" | "medium" | "high",
  "category": string,
  "summary": string,
  "suggestedAction": string
}

Issue #${issue.number}: ${issue.title}

Body:
${issue.body ?? "(no body provided)"}

Respond with ONLY the JSON object, no additional text or markdown formatting.`;

  const messages = query({
    prompt,
    options: {
      model: "claude-sonnet-4-6",
      tools: [],
      maxTurns: 1,
      pathToClaudeCodeExecutable: process.env.CLAUDE_CODE_PATH ?? "claude",
    },
  });

  let resultMessage: SDKResultMessage | undefined;

  for await (const message of messages) {
    if (message.type === "result") {
      resultMessage = message as SDKResultMessage;
    }
  }

  if (!resultMessage) {
    throw new Error("No result message received from query");
  }

  if (resultMessage.subtype !== "success") {
    throw new Error(`Query failed: ${resultMessage.subtype}`);
  }

  const text = resultMessage.result.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "").trim();

  const parsed = JSON.parse(text) as unknown;
  return TriageSchema.parse(parsed);
}
