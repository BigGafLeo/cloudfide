# Verified scope and first GitHub run

Status: 2026-10-15. Local compatibility checks and the first model-assisted GitHub PR run are verified below. The demonstration remains bounded and does not establish complete coverage.

## Controller and execution boundary

The controller suite has 84 cases in 27 files. Windows passed 82 with two platform-specific skips; Linux passed 83 with one Docker-host-specific skip. Typecheck, build and formatting passed. Windows exercised the real Docker execution boundary and timeout cleanup; Linux exercised symlink and signal/credential-lease cleanup. These complementary runs do not claim that the Docker-host case ran inside the Linux test container.

The pinned Linux collector previously passed all nine application checks. At bootstrap, application suites contained 48 backend tests and 18 frontend tests. No application source, existing tests or coverage exclusions were changed for the bootstrap.

## Native adapters

Both providers completed live conformance on Linux Node 24.13.1:

| Provider    | Native version | Requested model   | Authentication                         |
| ----------- | -------------- | ----------------- | -------------------------------------- |
| Claude Code | 2.1.299        | claude-sonnet-5-5 | Operator's Claude subscription         |
| Codex       | 0.162.1        | gpt-6.1-sol       | Dedicated ChatGPT subscription session |

The non-secret records in [provider-conformance.json](../agent/provider-conformance.json) match the current profile hashes. Both normal adapter activation gates also passed offline. The probes checked structured output, tool isolation, instruction/config discovery and cleanup. They do not benchmark the analyst, writer or reviewer, and they do not independently establish the provider's final server-side model routing. The optional Opus reviewer has not been tried.

The original Codex profile failed because model-owned Code Mode settings exposed MCP resource helpers and JSONL also contained commentary. The corrected profile uses restricted metadata from the pinned binary's bundled catalog, disables project-document discovery and reads the final-response artifact. Every tool or unknown event remains rejected. Nine regression cases cover this boundary. Models absent or duplicated in that bundled catalog fail without fallback.

Subscription probes received no model API key. Credentials remain outside the repository and artifacts. A successful local login does not configure GitHub Actions authentication.

## Application baseline and optional mutation pilot

The [baseline report](testing-baseline.md) and [machine-readable snapshot](testing-baseline.json) bind the original measurements to source commit 22be6e3bcf54fd012104fe233ef6652dd01941ff.

| Component | Lines    | Branches | Statements | Functions |
| --------- | -------- | -------- | ---------- | --------- |
| Backend   | 36 / 109 | 16 / 48  | 39 / 129   | 13 / 32   |
| Frontend  | 72 / 151 | 60 / 137 | 78 / 168   | 31 / 77   |

The isolated Stryker 10.0.0 / Vitest 4.1.11 pilot killed five mapper mutants and four SuccessNotice TSX mutants. [mutation-conformance.json](../agent/mutation-conformance.json) records that limited scope; this is not a repository-wide mutation score. Mutation and fresh model review remain disabled in the starting configuration.

## First real PR proposal

[Run 38758028657](https://github.com/BigGafLeo/cloudfide/actions/runs/38758028657) accepted a five-file frontend/backend unit-test proposal for [PR #2](https://github.com/BigGafLeo/cloudfide/pull/2), using exactly two Claude Code subscription calls requesting Sonnet. The isolated verifier passed all nine checks. Local execution reproduced 56 backend tests and 44 frontend tests with zero failures. Line coverage changed from 36/109 to 49/109 on the backend and 72/151 to 99/151 on the frontend; branch coverage changed from 16/48 to 22/48 and 60/137 to 94/137. Measurement scope and configuration were unchanged.

Five selected manual semantic regressions failed the intended assertions. Every focused command passed before mutation and after byte-identical restoration. These checks do not constitute a whole-project mutation score. Independent review/simplify found no material issue; security diff review covered all five generated test files with no findings. A minor assertion for forwarding the identical AbortSignal remains deferred.

See [the full summary](first-coverage-run.md) and [retained evidence](agent-run-2026-10-15.json) for the captured SHA, patch digest, actual analyst plan, loaded skills, native usage, checks, remaining gaps and sensitivity results.

## Reproduction and pending evidence

From the repository root, controller fixture checks need no model credentials:

```sh
npm ci --prefix agent --ignore-scripts --no-audit --no-fund
npm --prefix agent test
npm --prefix agent run typecheck
npm --prefix agent run build
```

A real native probe additionally needs pinned Linux Node/native CLIs and the recipient's own eligible authentication. The application commands are in the baseline report. The [GitHub guide](github-first-run.md) describes activation and the first PR run.

Recorded: actual analyst/writer decisions and skills, the test-only proposal, passing unit/typecheck/coverage checks, assertion sensitivity and real PR/run links. Pending: remaining unit-test gaps toward the 100% objective and an optional changed-feature PR demonstrating automatic model-assisted analysis. The earlier automatic documentation-only run proved triggering and publication without model calls. Optional reviewer and mutation workflow results are not claimed.
