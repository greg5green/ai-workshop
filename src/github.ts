import { Octokit } from "@octokit/rest";

let octokit: Octokit | null = null;
function getOctokit() {
  if (!octokit) {
    octokit = new Octokit({ auth: process.env.GITHUB_TOKEN });
  }
  return octokit;
}

export async function fetchRecentIssues(repo: string) {
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
