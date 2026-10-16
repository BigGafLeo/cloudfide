# Cloudfide unit-test agent

The agent finds missing unit behavior, proposes test-only patches and verifies them in GitHub Actions through official Claude Code or Codex CLIs. It publishes a PR report and downloadable patch; it never commits or pushes generated tests.

## Delivered result

[PR #11](https://github.com/BigGafLeo/cloudfide/pull/11) merged with **200 tests: 95 backend, 105 frontend**. [Final CI 38901709490](https://github.com/BigGafLeo/cloudfide/actions/runs/38901709490) passed **182 Linux controller cases and all nine application checks**. Two accepted native patches were applied without edits after required Opus and independent review.

The [priority-filter demonstration](docs/priority-filter-demo.md) protects four core cases: repository filtering with ordering; valid query forwarding; invalid-priority rejection without repository calls; and empty/unrelated query handling. Three later parameterized rows cover empty, uppercase and repeated priority values. Unknown-key stripping is explicitly characterization of current Zod behavior. Selected source mutations fail their intended assertions, including three preprocessing changes that survived every old router test. Seven added tests retain the earlier fourteen-test candidates' coverage; this does not establish global minimality or adequacy.

Feature coverage is **97.34% lines / 98.11% branches backend**, **98.67% / 96.35% frontend**. Baseline plus feature workflows reported **29 calls / 2,044,238 cumulative tokens**, including failed trials and cache, excluding development/security work. These counts are not invoices or remaining allowance.

The first feature proposal failed required review; a second false native acceptance was independently blocked. Separately, the corrected **193-test baseline** includes maintainer fixes for requested/saved toggle divergence, local/UTC dates, conflicting sort fixtures and per-action callbacks; its raw native proposal remains inconclusive. [Validation](docs/validation.md) preserves exact cases, skills, verdicts, patches and sensitivity evidence. Model review needs independent/human review.

## Design and skills

- **Separate roles:** Sonnet 5.5 (`claude-sonnet-5-5`) analyzes/writes; fresh required Opus 5.5 (`claude-opus-5-5`) reviews. [Role definitions](agent/src/roles.ts) load `analyze-unit-gaps`, `write-unit-tests` or `review-unit-tests` from [agent/skills](agent/skills/). Actual analyst/writer manifests record both backend/frontend references despite backend-only feature output.
- **Trusted controller:** default-branch policy binds PR/base/head and run identity; only allowlisted same-repository humans can trigger model calls. Schemas and test-path/patch admission constrain proposals; plans compare existing protection and name regressions.
- **Isolated execution:** digest-pinned Node 24.13.1 app-only Docker containers exclude credentials, controller files and Docker socket. Unit/typecheck/coverage execution has no network; installation and explicit Prisma generation may use it.
- **Bounded continuation:** 80% lines/branches per application is a milestone. Coverage mode refreshes evidence and preserves the last reviewable candidate within eight rounds, seventeen calls and four hours; analysis/review limits are 200/512 KiB. Mutations are disabled. No automatic escalation, paid fallback or reviewer-repair loop.

## Reproduce and hand over

Existing tests need no model credentials. Use Linux Node 24.13.1 and Docker for workflow reproduction; application setup is in [README](README.md). Controller checks:

```sh
npm ci --prefix agent --ignore-scripts --no-audit --no-fund
npm --prefix agent test
npm --prefix agent run typecheck
npm --prefix agent run build
```

For generation, follow [the run guide](docs/github-first-run.md): install trusted workflows/pinned CLI, configure your own account and author allowlist, and complete native conformance. Application PRs trigger `CI -> workflow_run`; manual coverage analysis uses:

```sh
gh workflow run unit-test-agent.yml --repo OWNER/REPO --ref main -f pr=PR_NUMBER
```

Public CI supports the documented Claude subscription CLI route; Codex requires explicitly billed API authentication here. [Provider policy](README.md#authentication-and-provider-policy) links official guidance. Inspect `payload.json`/`patchText`, check `git apply --check candidate.patch`, then independently review/retest before committing.

The distributed allowlist is empty. The author's repository Actions model secret was removed after workflows drained; underlying provider credentials were not revoked. New runs require recipients' own credentials.

Extensions could add durable evidence retention, aggregate budgets and measured quality/latency evaluation. Integration/e2e roles need separate design.
