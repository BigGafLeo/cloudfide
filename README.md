# Taskly App Node

## Setup

```sh
cp .env.example .env
```

## Docker

```sh
docker compose up --build -d --wait
```

Application: http://localhost:8080. API: http://localhost:8000/docs.

```sh
docker compose down
```

## Frontend

React + TypeScript + Vite. Tests: Vitest + React Testing Library.

Installation:

```sh
cd frontend
npm ci
```

Development — http://localhost:5173:

```sh
npm run dev
```

Storybook — http://localhost:6006:

```sh
npm run storybook
```

Tests:

```sh
npm test
```

Coverage — `frontend/coverage/index.html`:

```sh
npm run test:coverage
```

## Backend

Node.js + TypeScript + Express. Database: PostgreSQL + Prisma ORM. Tests: Vitest + Supertest.

Requires Node.js >=22.12 and PostgreSQL.

Installation:

```sh
cd backend
npm ci
```

Database — run from the repository root:

```sh
docker compose up -d --wait postgres
```

Development — http://localhost:8000/docs (from `backend`):

```sh
npm run dev
```

Production:

```sh
npm run build
npm start
```

### Database (Prisma ORM)

Schema — `backend/prisma/schema.prisma`. Connection — root `.env`.

Validate schema:

```sh
npm run db:validate
```

Generate client — also runs during installation and build:

```sh
npm run db:generate
```

Database browser:

```sh
npm run db:studio
```

Schema migrations are managed separately; generating the client does not update the database.

### Tests and coverage

Type check:

```sh
npm run typecheck
```

Tests:

```sh
npm test
```

Watch mode:

```sh
npm run test:watch
```

Coverage — `backend/coverage/index.html`:

```sh
npm run test:coverage
```

## Unit-test agent

The controller runs three separate roles through the official Claude Code or Codex CLI: an analyst finds missing behavior, a writer proposes test-only changes, and a fresh reviewer assesses their value. The reference profile uses `claude-sonnet-5-5` for analyst/writer and a required `claude-opus-5-5` reviewer; mutations are disabled. [SOLUTION.md](SOLUTION.md) gives the short design and evidence overview.

Role definitions live in [agent/src/roles.ts](agent/src/roles.ts). Each loads its own skill from [agent/skills/](agent/skills/) and only the selected frontend/backend references. The controller validates schemas, source/test paths and patch bounds. Models receive bounded source data without repository execution tools. Planned cases must compare existing protection and name a concrete regression; required review can reject lost assertions, redundancy or weak oracles despite passing coverage. A required oracle-counterexample finding blocks acceptance at any severity. See [test-value policy](docs/test-value-policy.md).

### PR workflow and execution

After the controller/workflows are installed on the default branch, an opened or updated PR runs ordinary CI. Its completion triggers scoped `pr-change` analysis through `workflow_run`; manual `workflow_dispatch` selects `coverage-gap` analysis for an open PR. Follow [the GitHub guide](docs/github-first-run.md) for installation, authentication, conformance and dispatch.

| Stage                                                    | Execution location                                              |
| -------------------------------------------------------- | --------------------------------------------------------------- |
| CI, exact PR/base/head resolution and fresh measurements | GitHub-hosted Linux runner                                      |
| Claude subscription or explicit API model roles          | GitHub-hosted Linux runner; inference on the provider's servers |
| Candidate unit tests, typechecks and coverage            | Disposable app-only Docker containers on the verifier runner    |
| Required fresh reviewer and report publication           | Separate GitHub-hosted Linux jobs                               |

The trusted controller comes from the default branch. Only explicitly allowlisted same-repository human authors can trigger model calls; fork PRs, other authors and Dependabot cannot. Application containers are unprivileged, use digest-pinned Node 24.13.1 and contain neither model credentials, controller files nor the Docker socket. Unit/typecheck/coverage commands have no network; dependency installation and explicit Prisma generation may use it. There is no host-execution fallback. Reports must be bounded regular files; links are rejected.

The workflow publishes a PR comment and downloadable patch; it does not commit or push generated tests. The final verifier binds results to the full tested SHA, control revision, run/attempt and artifact digests. Review the patch and independently rerun useful tests before applying it.

Coverage mode refreshes tests, measurements and bounded failed-check history between batches, retaining the last verified candidate if a later batch fails. The target is at least 80% lines and branches separately in frontend/backend, without denominator changes or regressions in any measured metric. `coverage.stopAtTarget=false` continues after that milestone for justified work; `true` stops at the target. Three no-progress rounds stop further work; after the milestone a distinct mechanically accepted batch can count as progress without coverage growth. Mechanical acceptance remains separate from required semantic review.

### Authentication and provider policy

Provider documentation checked on **2026-10-15**. Recheck these official sources before enabling or changing authentication.

| Scenario                                     | Authentication choice                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------- |
| Public PR workflow without model API billing | Official Claude Code CLI with the operator's eligible Claude subscription |
| Codex in this public PR workflow             | Explicit API authentication, separately billed                            |
| Personal local Codex CLI and manual probes   | ChatGPT/Codex subscription login                                          |
| Advanced Codex account-auth CI               | Documented trusted private-automation scope only                          |
| Mixed-provider reviewer in public CI         | Claude subscription plus explicitly selected Codex API authentication     |

**Claude Code.** [Authentication guidance](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token) documents `claude setup-token` for CI/scripts; [GitHub Actions guidance](https://code.claude.com/docs/en/github-actions#manual-setup) supports subscription OAuth on Pro, Max, Team and Enterprise. Generate your own token through the official flow and configure the repository-scoped `CLAUDE_CODE_OAUTH_TOKEN` secret. It uses that account's allowance; Anthropic recommends API keys for secrets shared across repositories.

[Anthropic's credential-use rules](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) prohibit brokering other users' Claude accounts/subscription requests. This project invokes the unmodified official CLI for the operator's own coding workflow. This route does not authorize reselling access, pooling subscriptions or operating a customer-facing service on the operator's allowance. A hosted service or Agent SDK deployment needs its own terms/authentication assessment.

**Codex.** [Authentication guidance](https://learn.chatgpt.com/docs/auth) distinguishes subscription login from separately billed API keys. The [advanced account-auth CI guide](https://learn.chatgpt.com/docs/auth/ci-cd-auth) excludes public/open-source repositories. GitHub entry points require API-confirmed matching repository identity and private visibility for every active Codex subscription role, including the reviewer. Public, unknown or mismatched identity fails before model calls; using a self-hosted runner cannot bypass this gate.

For eligible private automation, any model job containing a Codex subscription role is routed to self-hosted Linux runners labelled `cloudfide-model`. Preserve native credential refresh in a dedicated `CODEX_SUBSCRIPTION_HOME` and serialize access; do not repeatedly restore a desktop credential seed. After an uncatchable kill, stop the sole runner stream before operator recovery; the adapter never steals an existing credential lease. See [GitHub runner guidance](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners).

The pinned Codex adapter uses the binary's bundled catalog with restricted tool metadata, disables project instruction discovery and rejects tools/unknown events. Unknown or duplicate catalog models fail without fallback. A bounded regular `--output-last-message` artifact must match the final streamed response. [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference) and [noninteractive mode](https://learn.chatgpt.com/docs/non-interactive-mode) describe these settings. New model identifiers can require a CLI update and repeated conformance.

Both providers retain account/model availability and usage limits. Subscription ownership does not pay for API usage. `auth: api` must be explicitly selected with the corresponding key; authentication failure or quota exhaustion never silently switches to paid API mode. Verify included access and extra-usage settings: [Claude model guidance](https://code.claude.com/docs/en/model-config#fable-and-usage-credits) documents noninteractive Fable usage-credit billing. This profile selects Sonnet/Opus. [Model overview](https://platform.claude.com/docs/en/models/overview) and [CLI model selection](https://code.claude.com/docs/en/model-config#model-aliases) describe the explicit identifiers; actual routing remains provider-controlled.

### Configuration and limits

Copy `agent/config.example.json` into your own repository and replace `YOUR_GITHUB_LOGIN` with approved operators before activation. Configure your own authentication and complete native conformance on the pinned Linux runtime. Role provider, authentication, model and reservation are independently configurable. There is no difficulty classifier, automatic escalation or provider switch after failure. Local probes are manual; this project has no local PR-watching daemon or automatic git hook.

| Limit                                   | Reference profile                                                                                                |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Calls                                   | `pr-change`: two core roles plus required review; `coverage-gap`: eight rounds, seventeen calls including review |
| Role / run deadline                     | At most 30 minutes per role; four hours shared from execution-run start                                          |
| Analysis / final review / native output | 200 KiB / 512 KiB / 256 KiB                                                                                      |
| Proposal                                | Twenty files/cases per role response; 160 cumulative; patch <=1 MiB; payload <=4 MiB                             |
| Extra checks                            | Required fresh Opus review; mutations disabled; no automatic repair loop                                         |
| Subscription admission                  | One virtual unit per role; seventeen reserved per coverage run                                                   |

Required-review capacity is checked before promoting each passing batch. An oversized review package stops with `context-limit`, retaining the previous reviewable candidate and call records. These are serialized host byte limits, not provider token windows. The fields `maxEstimatedUsd`/`allocationUsd` hold virtual units in subscription profiles; they do not measure account quota, prices or a guaranteed invoice cap. Limits apply per run, not globally across PRs/reruns.

Trial Actions timeouts allow 180 minutes for coverage rounds, 90 for CI/precollection/final verification, 60 for the reviewer and 10 for resolution/publication, including setup/uploads. The shared four-hour deadline also includes time between jobs.

### Evidence

The [priority-filter demo](docs/priority-filter-demo.md) now has **200 tests (95 backend, 105 frontend)** after two exact native patches were applied on [PR #11](https://github.com/BigGafLeo/cloudfide/pull/11). [Run 38898669374](https://github.com/BigGafLeo/cloudfide/actions/runs/38898669374) passed required Opus/independent review and nine checks at 197 tests; its exact two-file patch became `e14f788`, and [post-application CI 38900070621](https://github.com/BigGafLeo/cloudfide/actions/runs/38900070621) passed 182 controller and 197 application tests. [Automatic follow-up 38900299819](https://github.com/BigGafLeo/cloudfide/actions/runs/38900299819) passed both reviews and nine checks at 200 tests. Its exact 1,114-byte router patch became `cfba8af`; local backend coverage passed 95/95 and typecheck passed. [Final CI 38901709490](https://github.com/BigGafLeo/cloudfide/actions/runs/38901709490) passed all nine application checks, 182 Linux controller cases and 200 application tests. PR #11 merged as `f7187bb`.

The first three automatic trials used the same feature source through `CI -> workflow_run`, with trusted role-guidance refinements between trials. The first 207-test candidate failed required review. The second was natively accepted despite a promised surviving counterexample classified `other`/minor; independent review blocked application. The third detects that raw-forwarding mutation (22 controls pass; mutant 21 pass/1 intended fail). Its four added tests retained the earlier fourteen's coverage; the follow-up adds three cheap near-miss rows for empty, uppercase and repeated priority values. Three selected preprocessing mutations survive the old 22 router tests but each fail one of the new 25. This is focused sensitivity evidence, not global minimality. Both application references were actually loaded. All four feature workflows total twelve calls and 776,395 reported tokens.

The corrected baseline merged in [PR #10](https://github.com/BigGafLeo/cloudfide/pull/10): **193 application tests (88 backend, 105 frontend)** and nine passing application checks in [CI 38892340340](https://github.com/BigGafLeo/cloudfide/actions/runs/38892340340). Linux controller CI passed **182/182**. Backend lines/branches measure 97.24%/97.91%; frontend 98.67%/96.35%, on unchanged baseline coverage scope.

The [required-review baseline run](docs/baseline-reviewed-run.md) generated 192 passing candidate tests, but Opus rejected two weak oracles. Maintainer corrections added a divergent requested/saved toggle result, a local/UTC clock boundary, conflicting sort fixtures and action-by-action callback assertions. Four selected regressions survived the raw tests and failed the revised tests; controls passed 43/43 in UTC, Warsaw and Los Angeles. The raw proposal remains inconclusive; the corrected baseline is a separate maintainer follow-up.

[Validation](docs/validation.md) separates controller checks, native probes, exact run decisions, usage and application status. Earlier [first-run](docs/first-coverage-run.md), [baseline](docs/baseline-value-run.md) and [continuation](docs/baseline-continuation-run.md) reports retain historical measurements and limits. Coverage targets and passing jobs do not establish complete behavioral protection.

### Recruitment handover without access to the author's allowance

The distributed `agent/config.json` has `trustedAuthors: []`. After all workflows drained, the author's repository Actions model secret was removed and the repository secret list verified empty. The underlying provider credential was not revoked. Supply the public repository, real PR/run links and retained decisions, skills, patches and measured checks. No authenticated runner, token, `auth.json`, API key or private session is part of the submission.

Recipients can run controller fixture checks without model credentials:

```sh
npm ci --prefix agent --ignore-scripts --no-audit --no-fund
npm --prefix agent test
npm --prefix agent run typecheck
npm --prefix agent run build
```

Application commands remain above. Running existing/generated tests needs no LLM; the optional real Docker boundary check needs its pinned image and `RUN_DOCKER_CHECKS=1`. A fresh model run requires the recipient's own eligible account or explicit API key, configured in their fork/separate repository with their own author allowlist and conformance evidence.

Ordinary fork workflows do not receive base-repository secrets apart from GitHub's job token ([secret guidance](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)). The later privileged `workflow_run` can access base-repository secrets ([event guidance](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)); the trusted controller and explicit repository/author gates are therefore essential. Fork isolation is not the sole control.

Removing an Actions secret prevents future jobs from receiving it but does not revoke the provider credential. Retire temporary credentials through the provider's supported process as appropriate. Reviewers receive read-only source and historical evidence; fresh sessions consume their own credentials and allowances.
