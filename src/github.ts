import { Octokit } from "@octokit/rest";
import type { RestEndpointMethodTypes } from "@octokit/rest";
import { readFile } from "fs/promises";
import { fileURLToPath } from "url";
import { join, dirname } from "path";

type IssueList = RestEndpointMethodTypes["issues"]["listForRepo"]["response"]["data"];

let octokit: Octokit | null = null;
function getOctokit() {
  if (!octokit) {
    octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  }
  return octokit;
}

export async function fetchRecentIssues(repo: string, mock = false): Promise<IssueList> {
  const [owner, repoName] = repo.split("/");
  if (!owner || !repoName) {
    throw new Error(`Invalid repo format: "${repo}" — expected "owner/repo"`);
  }
  if (mock) {
    const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
    const raw = await readFile(join(projectRoot, "data", "mock-issues.json"), "utf-8");
    return JSON.parse(raw) as IssueList;
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
