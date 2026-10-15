import { limits, runContextSchema, type RunContext } from "./contracts.js";
export class GitHubClient {
  constructor(
    private readonly token = process.env.GITHUB_TOKEN ??
      process.env.GH_TOKEN ??
      "",
    private readonly fetcher: typeof fetch = fetch,
  ) {}
  async request(path: string, method = "GET", body?: unknown): Promise<any> {
    if (!path.startsWith("/repos/") || path.includes(".."))
      throw new Error("invalid GitHub API path");
    const response = await this.fetcher("https://api.github.com" + path, {
      method,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2026-03-10",
        ...(this.token ? { Authorization: "Bearer " + this.token } : {}),
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("GitHub API " + response.status);
    if (response.status === 204) return null;
    const text = new TextDecoder("utf-8", { fatal: true }).decode(
      await boundedRead(response),
    );
    return JSON.parse(text);
  }
  async archive(repository: string, id: number): Promise<Uint8Array> {
    const response = await this.fetcher(
      "https://api.github.com/repos/" +
        repository +
        "/actions/artifacts/" +
        id +
        "/zip",
      {
        redirect: "manual",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: "Bearer " + this.token,
          "X-GitHub-Api-Version": "2026-03-10",
        },
        signal: AbortSignal.timeout(20000),
      },
    );
    const location = response.headers.get("location");
    if (response.status !== 302 || !location)
      throw new Error("artifact redirect missing");
    const url = new URL(location);
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      ![
        ".blob.core.windows.net",
        ".actions.githubusercontent.com",
        ".githubusercontent.com",
      ].some((s) => url.hostname.endsWith(s))
    )
      throw new Error("untrusted artifact redirect");
    const archive = await this.fetcher(url, {
      signal: AbortSignal.timeout(30000),
    });
    if (!archive.ok || !archive.body)
      throw new Error("artifact download failed");
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const reader = archive.body.getReader();
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > limits.payload) {
        await reader.cancel();
        throw new Error("archive bounds");
      }
      chunks.push(chunk.value);
    }
    return Buffer.concat(chunks);
  }
}
export interface ExecutionIdentity {
  repository: string;
  runId: string;
  attempt: number;
}
export async function resolveRun(
  event: any,
  api: GitHubClient,
  controlSha: string,
  execution: ExecutionIdentity = {
    repository: process.env.GITHUB_REPOSITORY ?? "",
    runId: process.env.GITHUB_RUN_ID ?? "",
    attempt: Number(process.env.GITHUB_RUN_ATTEMPT),
  },
): Promise<RunContext> {
  if (
    !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(execution.repository) ||
    !/^[1-9][0-9]*$/.test(execution.runId)
  )
    throw new Error("invalid execution identity");
  const prefix = "/repos/" + execution.repository;
  const [repo, run] = await Promise.all([
    api.request(prefix),
    api.request(prefix + "/actions/runs/" + execution.runId),
  ]);
  if (
    run.run_attempt !== execution.attempt ||
    run.head_sha !== controlSha ||
    run.head_branch !== repo.default_branch ||
    !["workflow_run", "workflow_dispatch"].includes(run.event)
  )
    throw new Error("untrusted control revision/run");
  let pr: number, headSha: string | undefined, trigger: RunContext["trigger"];
  if (event.workflow_run) {
    const source = await api.request(
        prefix + "/actions/runs/" + Number(event.workflow_run.id),
      ),
      workflow = await api.request(prefix + "/actions/workflows/ci.yml");
    if (
      source.status !== "completed" ||
      source.workflow_id !== workflow.id ||
      source.event !== "pull_request" ||
      !Number.isInteger(source.run_attempt)
    )
      throw new Error("unexpected upstream workflow");
    let related = source.pull_requests;
    if (!Array.isArray(related) || related.length !== 1)
      related = await api.request(
        prefix + "/commits/" + source.head_sha + "/pulls",
      );
    if (!Array.isArray(related) || related.length !== 1)
      throw new Error("ambiguous PR correlation");
    pr = Number(related[0].number);
    headSha = source.head_sha;
    trigger = {
      kind: "workflow-run",
      workflowId: workflow.id,
      runId: String(source.id),
      attempt: source.run_attempt,
    };
  } else {
    pr = Number(event.inputs?.pr);
    trigger = { kind: "dispatch" };
    if (!Number.isSafeInteger(pr) || pr < 1)
      throw new Error("dispatch PR missing");
  }
  const pull = await api.request(prefix + "/pulls/" + pr);
  if (!pull.base?.sha || !pull.head?.sha)
    throw new Error("PR metadata incomplete");
  const started = Date.parse(run.run_started_at ?? run.created_at);
  if (!Number.isFinite(started)) throw new Error("run timestamp missing");
  return runContextSchema.parse({
    repository: execution.repository,
    repositoryId: repo.id,
    pr,
    executionRunId: execution.runId,
    executionAttempt: execution.attempt,
    trigger,
    baseSha: pull.base.sha,
    headSha: headSha ?? pull.head.sha,
    controlSha,
    task: trigger.kind === "dispatch" ? "coverage-gap" : "pr-change",
    deadline: new Date(started + limits.runMs).toISOString(),
  });
}
export async function recheckHead(
  context: RunContext,
  api: GitHubClient,
): Promise<boolean> {
  const pr = await api.request(
    "/repos/" + context.repository + "/pulls/" + context.pr,
  );
  return (
    pr.state === "open" &&
    pr.head?.sha === context.headSha &&
    pr.base?.sha === context.baseSha
  );
}
export async function eligible(
  context: RunContext,
  api: GitHubClient,
  authors: string[],
): Promise<boolean> {
  const pr = await api.request(
    "/repos/" + context.repository + "/pulls/" + context.pr,
  );
  return (
    pr.state === "open" &&
    pr.head?.repo?.id === context.repositoryId &&
    pr.head?.sha === context.headSha &&
    authors.includes(pr.user?.login) &&
    pr.user?.login !== "dependabot[bot]"
  );
}
export async function publish(
  context: RunContext,
  body: string,
  api: GitHubClient,
): Promise<"published" | "stale"> {
  if (!(await recheckHead(context, api))) return "stale";
  const prefix = "/repos/" + context.repository,
    marker = "<!-- cloudfide-unit-agent -->";
  let own: any = null;
  for (let page = 1; page <= 10; page++) {
    const comments = await api.request(
      prefix + "/issues/" + context.pr + "/comments?per_page=100&page=" + page,
    );
    for (const comment of comments)
      if (
        comment.user?.login === "github-actions[bot]" &&
        comment.body?.includes(marker)
      ) {
        own = comment;
        break;
      }
    if (own || comments.length < 100) break;
    if (page === 10) throw new Error("comment scan limit");
  }
  if (own) {
    const match = /<!-- execution:([1-9][0-9]*):([1-9][0-9]*) -->/.exec(
      own.body,
    );
    if (!match) throw new Error("own marker missing execution identity");
    if (
      BigInt(match[1]!) > BigInt(context.executionRunId) ||
      (match[1] === context.executionRunId &&
        Number(match[2]) > context.executionAttempt)
    )
      return "stale";
  }
  if (!(await recheckHead(context, api))) return "stale";
  await api.request(
    own
      ? prefix + "/issues/comments/" + own.id
      : prefix + "/issues/" + context.pr + "/comments",
    own ? "PATCH" : "POST",
    { body },
  );
  return "published";
}

async function boundedRead(response: Response): Promise<Uint8Array> {
  if (!response.body) throw new Error("response body missing");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0;
  for (;;) {
    const part = await reader.read();
    if (part.done) break;
    bytes += part.value.byteLength;
    if (bytes > limits.payload) {
      await reader.cancel();
      throw new Error("GitHub JSON bounds");
    }
    chunks.push(part.value);
  }
  return Buffer.concat(chunks);
}
