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

The project contains three model-assisted roles: an analyst finds missing unit-test cases, a writer proposes test files, and a fresh reviewer assesses those tests (required in the demonstration profile). Each role loads its own skills. The controller schedules their separate CLI calls, validates structured output and restricts proposals to test files. For scoped pr-change work, standard mode uses at most two model calls; enabling the reviewer adds a third. Manual coverage-gap work uses bounded measurement rounds: analyst, writer, isolated verification, then refreshed gaps until both applications reach the configured target or a limit stops the run. Stryker is an optional mechanical check.

Each planned case must explain its additional protection: add or strengthen, target test file, compared existing test names/paths, a concrete regression that should fail, and impact versus maintenance/setup cost. The analyst first considers strengthening existing assertions. Sharing a coverage branch does not prove redundancy; a distinct cheap regression can justify another input. The host includes tests for selected units and their direct imported production units. It blocks rewriting any existing output omitted from analysis context and requires a same-file comparison for every existing test target, then checks writer targets. These checks do not prove the rationale true.

A fresh required reviewer compares original source/tests with the exact cumulative patch and execution evidence. Missing assertions, duplicate protection, implementation-shaped oracles and unjustified setup can block acceptance even at high coverage. Useful work may finish with an explicit partial result. Review failures remain inconclusive; there is no automatic review-repair loop. See [test-value policy](docs/test-value-policy.md).

### Where a normal PR runs

After deployment to the default branch, an opened or updated PR runs the ordinary CI workflow. Its completion triggers the Unit-test agent workflow through workflow_run. An operator can also select an open PR through workflow_dispatch for coverage-gap analysis.

| Stage                                                                                          | Execution location                                                |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Ordinary CI, PR identity resolution and exact base/head precollection                          | GitHub-hosted Linux runner                                        |
| Analyst and writer configured with Claude subscription or either provider's API authentication | GitHub-hosted Linux runner                                        |
| Candidate unit tests, typechecks, coverage and optional mutations                              | Disposable Docker containers on the GitHub-hosted verifier runner |
| Fresh reviewer configured with Claude subscription or API authentication                       | A separate GitHub-hosted Linux job                                |
| PR report and downloadable patch publication                                                   | A separate GitHub-hosted Linux job                                |

The controller and official CLI run on the selected runner; model inference runs on Anthropic's or OpenAI's servers. Choosing a subscription changes authentication and usage accounting, not the model's execution location. In the recommended Claude subscription configuration, the developer's computer does not need to be on after pushing the PR.

Only explicitly allowlisted authors of same-repository PRs can trigger model calls. Fork PRs and authors outside that list skip those calls; Dependabot is additionally rejected. Configure the list with approved human operators. Models receive bounded source data and have no repository execution tools. The coverage-gap agent job invokes the existing isolated Docker verifier between batches; application code runs only inside the unprivileged app-only containers. Application checks have separate containers without model credentials. The result is a PR comment and a patch artifact to review and apply; the workflow does not automatically commit or push generated tests.

### GitHub-hosted, self-hosted and local execution

A self-hosted runner is an operator-managed machine registered with GitHub Actions. It can be a server, VM or a developer's computer; GitHub schedules the job, but the process runs on that machine and it must be available. See [GitHub's runner documentation](https://docs.github.com/en/actions/concepts/runners/self-hosted-runners).

The existing runner selector routes any model job containing a Codex subscription role to the self-hosted labels self-hosted, linux and cloudfide-model. This is a technical route for the advanced private-automation setup below, **not a supported Codex subscription setup for this public Cloudfide repository**. Registering a private runner does not make its associated public repository private.

The Codex adapter reads the pinned binary's bundled model catalog without credentials, selects the exact configured model and uses the supported model_catalog_json setting with restricted tool metadata. This prevents model-owned Code Mode settings from restoring capabilities. It also disables project instruction discovery and optional tool features. Unknown or duplicate bundled models fail before the model request; selecting a newly released model can require updating the pinned CLI and repeating conformance. The adapter reads a bounded, regular final-response file through --output-last-message, checks it against the final streamed agent message, and still rejects every tool or unknown event. Intermediate commentary is allowed. [Codex configuration](https://learn.chatgpt.com/docs/config-file/config-reference) documents the local catalog and project instruction settings; [non-interactive mode](https://learn.chatgpt.com/docs/non-interactive-mode) documents the final-message output.

Local test and compatibility probes are manually launched. This project currently has no local daemon that watches PRs and no git hook that automatically launches these roles. Native model probes require the pinned Linux runtime, which can be provided through Linux, WSL or a Linux container. Running this coding assistant while developing the project is separate from running the project's PR agents.

### Authentication and provider policy

Provider documentation checked on **2026-10-15**. The following separates documented product guidance, account restrictions and our deployment choice. Recheck the linked sources before enabling or changing authentication.

| Scenario                                                                 | Authentication choice                                                                   |
| ------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| This public repository's automatic PR workflow without model API billing | Claude Code with the operator's eligible Claude subscription                            |
| Codex in this public repository's automatic PR workflow                  | Explicit API authentication, separately billed                                          |
| Personal local Codex CLI use and manual probes                           | ChatGPT/Codex subscription login                                                        |
| Advanced Codex account-auth CI                                           | Only within the documented trusted private-automation scope; not this public repository |
| A mixed-provider reviewer in the public PR workflow                      | Claude subscription plus Codex API, if API usage is explicitly chosen                   |

**OpenAI / Codex.** [Codex authentication](https://learn.chatgpt.com/docs/auth) distinguishes ChatGPT subscription login from separately billed API-key access. Its [advanced account-auth CI guide](https://learn.chatgpt.com/docs/auth/ci-cd-auth) states: “Do not use this workflow for public or open-source repositories.” That restriction concerns the documented CI account-auth workflow; it is not a general prohibition on working locally with public code. Our public-PR deployment therefore uses API authentication for Codex. The private-automation pattern requires trusted infrastructure, serialized credential use and preservation of native session refresh. A self-hosted runner does not create an exception. This is documented deployment guidance, not a claim that every subscription automation violates the terms.

**Anthropic / Claude Code.** [Claude Code authentication](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token) documents claude setup-token for CI and scripts. [Its GitHub Actions documentation](https://code.claude.com/docs/en/github-actions#manual-setup) supports subscription OAuth on Pro, Max, Team and Enterprise. Generate the token yourself through Anthropic's official authorization flow and configure the repository secret CLAUDE_CODE_OAUTH_TOKEN. It uses your account's subscription allowance. For secrets shared across repositories, Anthropic recommends API-key authentication because OAuth is tied to the person who generated it.

[Anthropic's authentication and credential-use rules](https://code.claude.com/docs/en/legal-and-compliance#authentication-and-credential-use) reserve subscription OAuth for ordinary use of native applications and prohibit developers from brokering other users' Claude accounts or subscription requests. We invoke the unmodified official Claude Code binary for the operator's own coding workflow; we do not use OAuth as a general HTTP API credential. This documented CLI pattern does not grant permission to resell access, pool subscriptions or operate a customer-facing service using the operator's account. A hosted product or an Agent SDK integration requires a separate terms/authentication assessment; the documented developer route uses API keys or supported cloud credentials.

Both providers retain account/model availability and usage limits. Owning both subscriptions does not combine their allowances or pay for their APIs. Credentials stay outside tracked files, logs and downloadable artifacts. Authentication failure or quota exhaustion does not silently switch the project to paid API mode. Dollar reservations in our configuration bound estimated admission; they are not a subscription-quota meter or a guaranteed invoice cap.

### Models and task difficulty

The owner demonstration profile in agent/config.json selects Claude subscription authentication for all roles. Analyst and writer use claude-sonnet-5-5; the required final reviewer uses claude-opus-5-5. The reviewer is enabled with a required gate; mutations remain disabled. config.example.json contains the same profile with YOUR_GITHUB_LOGIN in place of the owner. Each role independently selects provider, authentication, model and an admission reservation.

Sonnet 5.5 is the initial choice for bounded unit-test analysis and writing; Opus 5.5 is selected for the fresh final review. [Anthropic's model overview](https://platform.claude.com/docs/en/models/overview) lists these model identifiers, and [Claude Code's model documentation](https://code.claude.com/docs/en/model-config#model-aliases) describes the CLI selection. On 2026-10-15 the operator completed a live Claude subscription conformance probe requesting claude-sonnet-5-5 on the pinned Linux runtime. Its version, profile hash and four checks were validated and saved in agent/provider-conformance.json. The first required Opus review blocked a real baseline proposal after detecting lost original API return-value assertions. This is one observed review, not a quality benchmark; see [baseline value run](docs/baseline-value-run.md). Explicit identifiers avoid the rolling sonnet/opus aliases; actual availability and provider-side routing remain provider-controlled.

The controller currently has no difficulty classifier, automatic model escalation or model/provider switch after a failed proposal. Standard mode runs the two configured roles; deeper verification is explicitly enabled through the reviewer and/or mutation settings. Adjusting the selected role model is an operator configuration change.

Subscription authentication is not a blanket guarantee of zero additional account charges. Check included model access, allowances and extra-usage settings. For example, [Claude Code documents](https://code.claude.com/docs/en/model-config#fable-and-usage-credits) that a noninteractive Fable request can bill usage credits without an interactive consent prompt. The starting setup selects Sonnet/Opus rather than Fable; verify included access and actual account billing before a live probe.

### Configuration and current status

The local agent/config.json is active for the owner's demonstration: trustedAuthors is limited to BigGafLeo, and credentials are supplied through a repository-scoped Actions secret. The [first real Claude subscription PR run](https://github.com/BigGafLeo/cloudfide/actions/runs/38758028657) completed with an accepted proposal: 34 additional passing unit tests across five frontend/backend test files. Both applications' typechecks and coverage checks passed. See [the run summary](docs/first-coverage-run.md) and [retained evidence](docs/agent-run-2026-10-15.json) for exact revisions, decisions, skills, usage and remaining gaps. Account allowances and extra-usage settings still apply.

The local native probes also passed for Claude Code 2.1.299 requesting claude-sonnet-5-5 and Codex 0.162.1 requesting gpt-6.1-sol. Their reviewed non-secret records are in agent/provider-conformance.json; local Codex authentication remains in the dedicated private Docker volume. No model API key was supplied. [docs/validation.md](docs/validation.md) records verified scope and limits. The reviewer/mutations were disabled in that historical run; a feature-change model demonstration remains separate.

The public-workflow example uses provider claude and auth subscription. Replace YOUR_GITHUB_LOGIN with approved authors in your own repository. Configure your own repository-scoped OAuth secret and complete the native probes before activation. API mode requires explicit auth api and the corresponding key; there is no automatic fallback.

| Limit                              | Selected value                                                                                                     |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Model calls                        | pr-change: at most 2 + optional reviewer; coverage-gap: at most 8 analyst/writer rounds, 17 calls including review |
| Model call deadline                | At most 30 minutes per role, within the shared run deadline                                                        |
| Run deadline                       | 4 hours from the GitHub execution run start                                                                        |
| Subscription admission reservation | 1 virtual admission unit per role; 17 units per coverage run, including optional review                            |
| Model context / native output      | 200 KiB bundle / 256 KiB output                                                                                    |
| Test proposal                      | 20 files/cases per role response; cumulative coverage proposal: 160 files/cases; patch <=1 MiB, payload <=4 MiB    |
| Extra checks                       | Reviewer off; mutation off; no automatic repair/retry loop                                                         |

During initial trials, Actions job timeouts allow 180 minutes for the coverage-round agent job and 90 minutes for CI, precollection and final verification, 60 minutes for the optional reviewer, and 10 minutes for resolve/publication. These include setup and evidence upload. The shared four-hour deadline also includes time between jobs; this is generous trial configuration and should be revisited after actual run measurements. Native compatibility probes use the same 30-minute role timeout.

The 17-unit reservation leaves room for eight analyst/writer batches and one optional review. The legacy configuration fields maxEstimatedUsd/allocationUsd contain virtual admission units for this subscription profile; they are not real subscription prices, a token quota or a provider billing limit. Calls and deadlines are bounded per run, not across all PRs or reruns.

The controller enforces the Codex subscription CI restriction before choosing model runners and again at the agent/reviewer entry points. Any active Codex subscription role requires repository metadata fetched from GitHub to confirm the exact repository ID and private=true. Public, unknown or mismatched metadata rejects that configuration before model calls; choosing a self-hosted runner cannot bypass the check. A disabled reviewer does not activate its provider. Local manual compatibility probes remain separate from the GitHub entry points.

### Recruitment handover without access to the author's allowance

The submission is the public source repository and a short SOLUTION.md linking to a real demonstration PR/run. Supply the generated test patch or committed tests, role decisions and skills used, actual test results and frontend/backend coverage before and after. Demonstration evidence is still to be produced; do not replace it with a fabricated or fixture-only model run.

Recipients can clone the repository and run the controller's fixture tests, typecheck and build without model credentials:

```sh
npm ci --prefix agent --ignore-scripts --no-audit --no-fund
npm --prefix agent test
npm --prefix agent run typecheck
npm --prefix agent run build
```

The application test commands are documented above. These checks and execution of already-generated unit tests do not require an LLM call. The optional real Docker boundary test requires its pinned image and an explicit RUN_DOCKER_CHECKS setting. A new end-to-end model-assisted PR run does require the recipient's own eligible provider account or API key.

For end-to-end reproduction, the recipient uses a fork or separate repository, configures their own repository secrets and models, replaces trustedAuthors with their own approved usernames, performs the native probes and enables the workflow there. The public-CI provider restrictions above apply to their copy as well. Do not distribute the author's OAuth token, auth.json, API keys, authenticated machine image or access to the author's personal runner. A source-code fork does not transfer a usable copy of the owner's configured secrets.

Ordinary fork-triggered workflows do not receive repository secrets, apart from GitHub's job token ([GitHub secrets documentation](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)). Our later workflow_run is privileged and can access base-repository secrets ([event documentation](https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows#workflow_run)); model access therefore also depends on our explicit repository/author gates and trusted default-branch controller. Fork isolation is not the sole control.

If the author temporarily enables personal authentication to record the demonstration, keep the author allowlist narrow and do not grant reviewers write/admin access or runner access to the credential-bearing repository. After the demonstration, restore the disabled model configuration and remove personal model secrets from the submitted repository's Actions configuration. Removing a secret stops that workflow from receiving it; it does not itself invalidate the provider credential. Retire temporary credentials through the provider's supported process as appropriate. The existing call/deadline reservations are per run, not a global daily account-spend cap.

A read-only repository link and historical PR evidence let reviewers inspect the solution. Running a fresh model session uses credentials and allowances owned by the person performing that run.

See [SOLUTION.md](SOLUTION.md) for installation, native probes, verification evidence and the remaining recruitment demonstration work. Follow [the first GitHub run guide](docs/github-first-run.md) for bootstrap, authentication and the initial coverage-gap PR.

The corrected [original-baseline run](docs/baseline-value-run.md#second-attempt-configured-target-reached) reached the configured 80% line/branch target: 133 passing tests, backend 84.40% lines/93.75% branches and frontend 86.75%/90.51%, with unchanged coverage scope. Nine final application checks and required Opus review passed; seven Claude subscription calls were used. The exact proposal and known assertion gaps are retained for human review; generated application changes were not applied.
