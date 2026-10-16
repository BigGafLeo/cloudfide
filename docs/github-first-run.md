# Run the unit-test agent in GitHub

Existing tests and evidence can be inspected without model credentials. Use this guide for new model runs in your own fork or repository with your own eligible account. The application setup remains in [README](../README.md); [validation](validation.md) records existing evidence. A local CLI login does not configure Actions authentication.

## 1. Install the trusted controller

Merge the reviewed controller, skills, lockfiles, non-secret conformance records and `.github/workflows/ci.yml` / `unit-test-agent.yml` into the default branch after secret-free CI passes. The manual and `workflow_run` entry points use that branch's controller. A bootstrap PR installs the workflow; it is not a model-generation demonstration.

Use Linux Node 24.13.1 and Docker. Controller checks need no model credentials:

```sh
npm ci --prefix agent --ignore-scripts --no-audit --no-fund
npm --prefix agent test
npm --prefix agent run typecheck
npm --prefix agent run build
```

Install the pinned native CLI packages and explicitly run the official Claude installer from `agent/`:

```sh
npm ci --prefix native --ignore-scripts --no-audit --no-fund
node native/node_modules/@anthropic-ai/claude-code/install.cjs
```

Arbitrary package lifecycle scripts remain disabled. The workflows pull the exact pinned application image; there is no host-execution fallback.

## 2. Configure your own model access

Copy `agent/config.example.json` to `agent/config.json` and replace `YOUR_GITHUB_LOGIN` with approved same-repository human authors. The reference roles are Sonnet 5.5 (`claude-sonnet-5-5`) for analyst/writer and required Opus 5.5 (`claude-opus-5-5`) for final review. Mutations are disabled. The distributed author list must be empty at handover; keep it empty until your own authentication and conformance are ready.

For the documented Claude subscription CLI route, generate your own token through official `claude setup-token`. In repository Settings -> Secrets and variables -> Actions, add the repository-scoped secret `CLAUDE_CODE_OAUTH_TOKEN`. Keep its value out of source, shell command literals, comments and logs. Confirm only the secret's name afterward.

Public CI rejects Codex subscription authentication before model calls; select explicit, separately billed API authentication to use Codex here. Eligible private automation has additional identity and credential-lease requirements. Read [the provider policy and official links](../README.md#authentication-and-provider-policy) before activation. Authentication/quota failure has no paid fallback.

From `agent/`, execute the native probe on the pinned Linux runtime with your dedicated authentication:

```sh
node dist/scripts/native-conformance.js PROVIDER MODEL
```

Review its non-secret conformance record. Unknown capabilities or missing credentials are inconclusive, not permission to enable an unverified profile. Never commit authentication material.

## 3. Choose the PR trigger

For automatic scoped analysis, open/update a same-repository PR changing application behavior. Ordinary CI completes first, then `workflow_run` analyzes the exact captured PR/base/head. Fork PRs and unapproved authors cannot use model credentials.

For manual coverage-gap analysis, open a same-repository PR from the installed default branch. A baseline documentation change is enough; you do not need to write the missing application tests manually. Wait for ordinary CI and its automatic no-change agent run to finish before dispatching. Both entries share a per-PR concurrency group with cancellation enabled, so overlapping them can replace/cancel the run.

In Actions -> Unit-test agent -> Run workflow, select the default branch and provide the open PR number, or run:

```sh
gh workflow run unit-test-agent.yml --repo OWNER/REPO --ref main -f pr=PR_NUMBER
```

Keep the captured PR head unchanged until completion. The manual entry point measures the current frontend/backend even for a documentation-only PR.

## 4. Interpret the result

The jobs resolve identity, collect exact snapshots without model secrets, then run analyst -> validated plan -> writer -> isolated application checks. Coverage mode repeats this with refreshed evidence, preserving the last verified cumulative proposal when a later batch fails. A separate verifier rechecks the final proposal; required fresh review assesses its semantic value before publication.

Inspect the PR comment and downloadable evidence for:

- Tested head, default-branch controller revision, execution run/attempt and artifact identities.
- Actual plan, compared existing assertions, concrete regression cases, confidence and loaded skills.
- Exact test-only patch, both applications' unit/typecheck/coverage checks and controller-owned logs.
- Comparable coverage denominators, batch history, call ledger and explicit stopping reason.
- Required reviewer outcome and claims, distinguishing unconfirmed model statements from verified checks.

The target is 80% lines **and** branches separately in both applications. Proposal acceptance, numeric target attainment and completeness are separate claims. The reference `stopAtTarget=false` continues for justified cases after the milestone; `true` stops there. All rounds share eight-round/seventeen-call limits and the original four-hour deadline. Three no-progress rounds stop further work; useful accepted assertion work after the milestone may count without coverage growth.

Analysis bundles are capped at 200 KiB, final review at 512 KiB. Each passing batch must fit required review before promotion. Capacity failure preserves the previous reviewable candidate. A failed/inconclusive run remains such even if its candidate tests pass or its numeric target was reached. Missing review cannot be replaced by an offline replay.

Subscription reservation fields are virtual admission units, not prices, remaining allowance or invoice caps. Account limits still apply. There is no automatic failed-provider retry, model escalation or reviewer-repair loop. Mutations remain disabled in this profile.

## 5. Review and apply useful tests

Download the run's agent payload artifact. Its `payload.json` contains `patchText`; preserve that string exactly as `candidate.patch`. Inspect it, then check admission before applying:

```sh
git apply --check candidate.patch
```

Apply only useful reviewed tests, rerun both application suites/typechecks/coverage, and commit through normal review. The workflow itself never commits or pushes generated code. Selected sensitivity checks should fail on the intended assertion when a claimed behavior is deliberately broken in a disposable copy; restore the copy afterward. Coverage alone does not prove assertion value.

Retain real PR/run links, exact revisions, decisions, loaded skills and before/after results in the evidence reports linked from [SOLUTION](../SOLUTION.md). The [priority-filter demo](priority-filter-demo.md) now has 200 tests (95 backend, 105 frontend) after two exact native patches on PR #11: the first successful 197-test proposal passed both reviews/nine checks and post-application CI; its automatic follow-up passed both reviews/nine checks and added three useful boundary rows. Tested head `cfba8af` passed final CI 38901709490 (182 Linux controller cases, 200 app tests and all nine application checks), then PR #11 merged as `f7187bb`. Earlier rejected/false-accepted proposals and independent counterexample checks remain visible. Existing baseline 193, initial successful 197 and current 200 counts refer to separate revisions; [validation](validation.md) records them and the 29-call/2,044,238-token baseline-plus-feature total.

## 6. Close model access for handover

The distributed configuration has `trustedAuthors: []`. After all demonstration workflows drained, the author's repository Actions model secret was removed and the repository secret list verified empty. For your own handover, drain active workflows, empty the allowlist and remove personal model secrets after recording demonstrations. Recipients inspect source/evidence and run existing tests without model access; a fresh model session uses their own account in their own repository. Removing the secret does not revoke its underlying provider credential. Follow [handover guidance](../README.md#recruitment-handover-without-access-to-the-authors-allowance), including the privileged `workflow_run` boundary.
