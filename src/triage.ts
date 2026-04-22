import { query, type SDKResultMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";

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

export async function triageIssue(issue: Issue): Promise<Triage> {
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

  const text = resultMessage.result;

  const parsed = JSON.parse(text) as unknown;
  return TriageSchema.parse(parsed);
}
