# Required review of the original-baseline run

[Run 38886324124](https://github.com/BigGafLeo/cloudfide/actions/runs/38886324124) analyzed the unchanged received application on [PR #5](https://github.com/BigGafLeo/cloudfide/pull/5), using trusted controller `7ff867f` and required fresh Opus review. Its GitHub jobs completed successfully, but the authoritative proposal decision is **inconclusive** because semantic review failed. A green workflow is not proposal approval.

## Measurements

All eight batches passed their isolated checks, and the final independent verifier passed all nine application checks. The patch changes 22 test files (12 new, 10 modified), preserving existing assertions. The 37 grouped plan cases expanded the suites from 66 to 192 tests. Production code, dependencies and coverage denominators stayed unchanged.

| Application | Original -> candidate tests | Line coverage    | Branch coverage  |
| ----------- | --------------------------- | ---------------- | ---------------- |
| Backend     | 48 -> 88                    | 33.02% -> 97.24% | 33.33% -> 97.91% |
| Frontend    | 18 -> 104                   | 47.68% -> 98.67% | 43.79% -> 96.35% |

Both applications reached the 80% line/branch milestone in round 4 (164 tests). Continued justified work reached 192 tests at round 8; the controller stopped at the round limit. These percentages measure execution, not semantic completeness.

## Why review blocked the proposal

Opus identified two concrete counterexamples that passed the proposed tests:

- TodosPage notice tests always made the server result equal the requested toggle, so deriving the message from the request instead of the saved result survived.
- The local-midnight fixture did not establish a non-UTC timezone; replacing local-date logic with UTC-date logic survived in UTC CI.

Independent local value review additionally found equal sort orders across hook fixtures and a callback test that clicked every action before checking identical counts, allowing an Edit/Delete swap. These require targeted fixture/assertion corrections, not more coverage-driven test expansion. The raw native proposal remains rejected; corrective work is recorded separately and must not be presented as native approval of this patch.

## Targeted corrections after review

[PR #10](https://github.com/BigGafLeo/cloudfide/pull/10) carries the development follow-up: a mismatched requested/saved toggle state, conflicting sort fixtures, action-by-action callback assertions and a restored clock boundary with divergent local/UTC dates. All original assertions remain. Four selected source regressions survived the raw tests and fail the corrected tests at their intended assertions; unmodified controls passed 43/43 under UTC, Warsaw and Los Angeles process timezones on Windows. Frontend typecheck passed. Full application/Linux validation is visible in the PR checks.

[Correction evidence and revised test-content digest](evidence/baseline-oracle-corrections-38886324124.json) keep this disposition separate from the rejected native proposal. This is targeted sensitivity evidence, not a global mutation score or complete correctness proof.

## Usage and retained evidence

Seventeen native subscription calls (eight analyst, eight writer, one reviewer) reported 1,150,778 input tokens including cache and 117,065 output tokens: **1,267,843 cumulative tokens**. Cache reads are already included in input; thinking is included in output. These are repeated-call usage counts, not unique context size, an invoice or subscription quota. Interactive development and local review are outside this pipeline ledger.

The trusted run used the older report renderer, which displayed the coverage milestone as partial after semantic rejection. The retained verifier proves the numeric target was reached. The corrected renderer separates measured attainment from required-review acceptance.

- [Strictly derived run, cases, checks and review findings](evidence/baseline-review-run-38886324124.json)
- [Per-call, per-role and per-round token ledger](evidence/baseline-review-usage-38886324124.json)
- [Exact unapproved patch, plan and loaded analyst/writer skills](evidence/baseline-review-patch-38886324124.json)

Raw patch SHA-256: cf020d54dbc0de78babf0880914b865bc7c362b2ac6e3c84102f5dcd658985f2; 78,598 UTF-8 bytes. Raw GitHub execution artifacts have seven-day retention; the linked derived evidence is committed with the repository.
