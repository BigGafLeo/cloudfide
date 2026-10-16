# Validation and evidence

Status: 2026-10-16. Controller checks, native probes, model proposals and merged application tests are separate evidence. A green workflow does not replace required semantic acceptance.

## Latest automatic feature proof

[PR #11](https://github.com/BigGafLeo/cloudfide/pull/11) merged at 12:39:37 UTC as `f7187bbbfa0367146cbb1e2389f0b4ec486d9ad0`, including tested head `cfba8af149e139f97137bccd695e4b9bfc887b85` with **200 tests (95 backend, 105 frontend)** after two exact native patches were applied. [The demo report](priority-filter-demo.md) retains controlled trials, cases, loaded skills, patches, measurements and usage. [Final CI 38901709490](https://github.com/BigGafLeo/cloudfide/actions/runs/38901709490) passed all nine application checks, **182/182 Linux controller cases** and **200 application tests**. [Retained final-validation evidence](evidence/feature-final-validation-38901709490.json) also records the closed-PR zero-call follow-up.

[Run 38898669374](https://github.com/BigGafLeo/cloudfide/actions/runs/38898669374) passed required fresh Opus review, independent review and all nine application checks at **197 tests (92 backend, 105 frontend)**. Its exact **3,122-byte**, two-file patch (SHA-256 `0c417fa0deb22dc164658a8d9b30be384c2f9194e0eafc908efc6f297d173a61`) was committed without edits as `e14f788`. Both Git blobs matched native files; 294 other tracked files stayed byte-identical. [Post-application CI 38900070621](https://github.com/BigGafLeo/cloudfide/actions/runs/38900070621) passed **182/182 controller and 197 application tests**.

That CI automatically triggered [follow-up 38900299819](https://github.com/BigGafLeo/cloudfide/actions/runs/38900299819): required Opus review, independent review and all nine checks passed at **200 tests**. One parameterized router case adds three rows for empty, uppercase and repeated priority values. Its exact **1,114-byte** patch (SHA-256 `4762b71cd0814a57a5220dcd6dac14764842c385045fa7a07c41d3cd5e03b1b2`) was committed without edits as `cfba8af`. The Git blob matches native output; 295 other tracked files stayed byte-identical. Local backend coverage passed **95/95** and typecheck passed. Independent review noted one minor rationale inaccuracy: the old urgent-value test already detects a generic string schema; incremental protection was demonstrated separately.

The first three automatic `CI -> workflow_run` trials analyzed unchanged source `d2c986c147c6093fe01924c9ac9c6c3e3ac01043`, with trusted role-guidance refinements between CI retries. The fourth analyzed the applied `e14f788` head. Both application references were actually loaded despite backend-only proposals. Feature coverage remains **110/113 backend lines (97.34%)**, **52/53 branches (98.11%)**; frontend **149/151 lines (98.67%)**, **132/137 branches (96.35%)**. Feature denominators differ from the original baseline and are compared within the same head.

The first successful proposal added four tests instead of the earlier fourteen, retaining measured coverage and detecting the missed raw-forwarding regression. The follow-up adds three boundary rows, still fewer than those initial candidates. This is a useful scoped comparison, not proof of a globally minimal suite. Unknown-query-key stripping is explicitly characterization of current Zod behavior, not an OpenAPI requirement.

## Prior native limitation and selected counterexample

[Trial 1](evidence/priority-filter-run-38893683492.json) passed 207 candidate tests and nine checks, but required Opus review rejected its raw-versus-parsed query claim; decision **inconclusive**, patch unapplied. [Trial 2](evidence/priority-filter-run-38896463843.json) also passed 207 tests/nine checks. Its reviewer returned `passed` and the host `accepted`, despite finding F1 describing a promised surviving raw-forwarding counterexample as `other`/minor. Independent development review **blocked application**. The raw verdict and patch remain unchanged; this demonstrates a native classification limitation and the need for independent/human review.

The selected mutation changes only `repository.list(result.data)` to `repository.list(req.query as typeof result.data)`, preserving validation/422 handling. Trial 2's exact router test overlay passed **23/23** both before and after the mutation. The final trial's exact tests pass **22/22** as control, then **21 pass / 1 intended failure** for the same mutant, at the assertion rejecting an unrelated query key. Scratch source was restored byte-for-byte. This is one selected sensitivity check, not a global mutation score.

The follow-up's three selected schema preprocessors treat empty priority as absent, lowercase strings or take the first repeated-query value. Eight focused executions establish old/new controls (**22/22**, **25/25**) and three old/new mutant pairs: each mutant passes all old 22 router tests but causes **24 pass / 1 intended failure** with the new rows, at the expected 422 assertion. Scratch production was restored and live source remained unchanged. These selected checks demonstrate incremental protection; they are not a global mutation score.

All four feature workflows count: **12 calls / 776,395 cumulative tokens**. Baseline plus feature total **29 / 2,044,238**, including rejected and independently blocked proposals. The first three same-source trials remain a historical subtotal of **9 / 592,952** (third trial **3 / 195,744**); follow-up adds **3 / 183,443**. [The demo's evidence index](priority-filter-demo.md#usage-and-retained-evidence) links exact runs, plans/patches/skills and ledgers. Input includes cache; output includes reported thinking. Development/security usage is separate; cumulative tokens are not an invoice or remaining account quota.

## Current application baseline

[PR #10](https://github.com/BigGafLeo/cloudfide/pull/10) merged the corrected baseline as `436113dd94a5593cf5a9a6e0e4869e29c26f907e` (reviewed head `9b21354b866ceda79ea1a0e7f1d1dba85a2d50dd`). [CI 38892340340](https://github.com/BigGafLeo/cloudfide/actions/runs/38892340340) passed all nine application checks: installs, Prisma generation, both typechecks, unit suites and coverage suites. **193 tests passed: 88 backend, 105 frontend.**

| Component | Tests: received -> corrected | Lines            | Branches         | Statements       | Functions      |
| --------- | ---------------------------- | ---------------- | ---------------- | ---------------- | -------------- |
| Backend   | 48 -> 88                     | 106/109 (97.24%) | 47/48 (97.91%)   | 125/129 (96.89%) | 31/32 (96.87%) |
| Frontend  | 18 -> 105                    | 149/151 (98.67%) | 132/137 (96.35%) | 164/168 (97.61%) | 75/77 (97.40%) |

[The received snapshot](testing-baseline.json) binds the original 66 tests to `22be6e3bcf54fd012104fe233ef6652dd01941ff`. Baseline coverage denominators and production behavior were unchanged by the test additions. Feature revisions have different source denominators and must be compared within their own exact run.

## Required baseline review and maintainer corrections

[Run 38886324124](https://github.com/BigGafLeo/cloudfide/actions/runs/38886324124), on [PR #5](https://github.com/BigGafLeo/cloudfide/pull/5), generated 37 grouped cases across 22 test files and passed 192 candidate tests and all nine final application checks. Fresh required Opus review rejected two concrete counterexamples; the authoritative proposal decision is **inconclusive**, despite successful GitHub jobs. The raw native patch was not approved.

Maintainer follow-up corrected four test-discrimination gaps:

1. **Toggle notice:** make the saved completion state differ from the requested toggle so a notice derived from the request fails.
2. **Local calendar:** provide divergent local/UTC dates with a restored clock boundary so UTC substitution fails even in UTC CI.
3. **Hook sorting:** use fixtures whose sort orders disagree so ignoring the sort setter fails.
4. **Row callbacks:** check each action immediately so swapping Edit/Delete callbacks fails.

Four selected regressions survived the raw tests and failed the revised tests at the intended assertions. Unmodified controls passed **43/43** under UTC, Europe/Warsaw and America/Los_Angeles process timezones on Windows; frontend typecheck passed. Full corrected application/Linux results are in PR #10 CI. This is selected sensitivity evidence, not a global mutation score or native approval of the corrected proposal.

[The baseline report](baseline-reviewed-run.md) links exact decisions, cases, skills, checks and patch identity. [Correction evidence](evidence/baseline-oracle-corrections-38886324124.json) retains revised-content identity and control/counterexample results. [Usage](evidence/baseline-review-usage-38886324124.json) records **17 calls and 1,267,843 cumulative tokens** (1,150,778 input including cache; 117,065 output including reported thinking). Interactive development/security usage is separate; token totals are not invoices or account quota.

[Last automatic run 38901949635](https://github.com/BigGafLeo/cloudfide/actions/runs/38901949635) completed successfully after PR closure with candidate `skipped`, an empty call ledger, zero tokens and no patch; verifier/reviewer jobs were skipped. It adds no model usage or approval evidence. Current reports describe coverage attainment as measurement and attribute the writer's reason before host verification; retained older native artifacts preserve their historical labels.

## Controller and execution boundary

Linux CI passed **182/182 controller cases**, including Docker boundaries; typecheck/build passed. Earlier 170-case and smaller counts describe historical revisions. Optional Docker checks and platform-specific cases must be distinguished from a local default test invocation.

Boundary checks exercised real Docker isolation/timeout cleanup, Linux symlink rejection and signal/credential-lease cleanup. Application jobs use a digest-pinned Node 24.13.1 image and unprivileged app-only containers without controller files, credentials or the Docker socket. Unit/typecheck/coverage execution has no network. These results cover the exercised boundaries, not every possible host/runtime configuration.

The corrected-baseline security diff review was sealed/read with zero findings across 32 changed files. This scoped development check is separate from required model review of generated test value and from any later final submission review.

## Native adapter probes

Both providers completed live compatibility probes on Linux Node 24.13.1:

| Provider    | Pinned CLI | Requested model     | Authentication                         |
| ----------- | ---------- | ------------------- | -------------------------------------- |
| Claude Code | 2.1.299    | `claude-sonnet-5-5` | Operator's Claude subscription         |
| Codex       | 0.162.1    | `gpt-6.1-sol`       | Dedicated ChatGPT subscription session |

Reviewed non-secret [conformance records](../agent/provider-conformance.json) cover structured output, disabled tools/discovery and cleanup. They do not benchmark role quality or independently prove provider routing. No model API key was supplied to subscription probes; authentication is excluded from tracked files/artifacts. Codex public-CI subscription use remains prohibited by the [provider policy](../README.md#authentication-and-provider-policy); local conformance does not authorize it.

The corrected Codex adapter uses restricted bundled catalog metadata, disables project instructions, validates the final-response file against the stream and rejects tools/unknown events. Unknown/duplicate models fail without fallback.

## Historical evidence and capacity limits

- [First live PR run](first-coverage-run.md): 100 passing candidate tests; two Sonnet calls; review/mutations disabled in that historical profile. Five selected regressions failed their intended assertions.
- [Earlier baseline attempts](baseline-value-run.md): required Opus first rejected lost original assertions; a later 133-test proposal was accepted under that run's policy. Known assertion limits remain documented.
- [Eight-round continuation](baseline-continuation-run.md): 166 mechanically passing candidate tests; **failed/inconclusive before review** because 219,683 evidence bytes exceeded the former 204,800-byte limit. Sixteen Sonnet calls reported 1,129,359 tokens; reviewer calls were zero.
- [Offline replay](evidence/reviewer-context-replay-38832961036.json): verifies admission of the complete historical package under the separate 512 KiB review limit, using an adapter sentinel and zero provider calls. It does not approve the historical proposal.
- [PR #10 follow-up 38892555999](https://github.com/BigGafLeo/cloudfide/actions/runs/38892555999): inconclusive before model invocation because the complete changed-test analysis bundle exceeded 200 KiB; zero calls/tokens.

Analysis bundles remain capped at **200 KiB**; final review has **512 KiB**. Required-review capacity is checked before promoting each passing batch. Oversized work stops with `context-limit`, preserving the previous reviewable candidate and ledger. Numeric target attainment and proposal acceptance are separate.

The isolated Stryker 10.0.0 / Vitest 4.1.11 pilot killed five mapper and four SuccessNotice TSX mutants. [Mutation conformance](../agent/mutation-conformance.json) records that narrow scope; mutations remain disabled in the reference profile.

## Reproduce and hand over

Controller fixture checks need no model credentials:

```sh
npm ci --prefix agent --ignore-scripts --no-audit --no-fund
npm --prefix agent test
npm --prefix agent run typecheck
npm --prefix agent run build
```

Existing application/generated tests also need no LLM; [README](../README.md) contains their commands. Native probes and new generation require your own eligible account and the pinned runtime. [The GitHub guide](github-first-run.md) covers installation, triggers and authentication.

The distributed `agent/config.json` has `trustedAuthors: []`. All workflows were drained before the author's repository `CLAUDE_CODE_OAUTH_TOKEN` secret was removed; the repository secret list was verified empty. The underlying provider credential was not revoked. No authenticated session or access to the author's allowance is part of the handover. High coverage and selected counterexamples do not establish a complete or minimal suite.
