# Priority-filter demo: controlled trials and automatic follow-up

[Automatic follow-up 38900299819](https://github.com/BigGafLeo/cloudfide/actions/runs/38900299819) produced an accepted, independently reviewed boundary-test proposal for [PR #11](https://github.com/BigGafLeo/cloudfide/pull/11), after the three controlled trials below. All nine verifier checks passed with **200 tests (95 backend, 105 frontend)**. Both accepted native patches were applied exactly, ending at [`cfba8af`](https://github.com/BigGafLeo/cloudfide/commit/cfba8af149e139f97137bccd695e4b9bfc887b85). **Final CI [38901709490](https://github.com/BigGafLeo/cloudfide/actions/runs/38901709490) passed; PR #11 merged at 12:39:37 UTC on 2026-10-16 as [`f7187bb`](https://github.com/BigGafLeo/cloudfide/commit/f7187bbbfa0367146cbb1e2389f0b4ec486d9ad0).**

The feature adds optional `priority=low|medium|high` filtering to `GET /api/todos`, with invalid input returning 422. It starts from the [corrected 193-test baseline](baseline-reviewed-run.md). No frontend filter UI was added.

## Controlled setup

The first three controlled trials analyzed source `d2c986c147c6093fe01924c9ac9c6c3e3ac01043`, against base `436113dd94a5593cf5a9a6e0e4869e29c26f907e`. The feature source did not change between trials; trusted role guidance changed on the default branch.

The upstream [CI run 38893471385](https://github.com/BigGafLeo/cloudfide/actions/runs/38893471385) was rerun with `gh run rerun` for attempts 2 and 3 to repeat the experiment on the same source. Each completed CI attempt automatically triggered a `workflow_run` / `pr-change` model workflow. These were controlled retries, rather than three independent feature changes or manually dispatched model workflows.

| Trial | Automatic model run                                                            | Upstream CI attempt | Trusted controller | Native decision                      | Independent disposition                                                     |
| ----- | ------------------------------------------------------------------------------ | ------------------- | ------------------ | ------------------------------------ | --------------------------------------------------------------------------- |
| 1     | [38893683492](https://github.com/BigGafLeo/cloudfide/actions/runs/38893683492) | 1                   | `436113d`          | Inconclusive; required review failed | Retained, not applied                                                       |
| 2     | [38896463843](https://github.com/BigGafLeo/cloudfide/actions/runs/38896463843) | 2                   | `a7dc2a8`          | Accepted; required review passed     | Blocked by independent audit                                                |
| 3     | [38898669374](https://github.com/BigGafLeo/cloudfide/actions/runs/38898669374) | 3                   | `590ee04`          | Accepted; required review passed     | Static review passed; selected counterexample detected; exact patch applied |

All four feature workflows used subscription authentication through the official Claude Code CLI: Sonnet 5.5 (`claude-sonnet-5-5`) as analyst and writer, and a fresh Opus 5.5 (`claude-opus-5-5`) reviewer. The integration made no direct model API calls.

The retained analyst/writer manifest records `analyze-unit-gaps` and `write-unit-tests`, each with **both backend and frontend references actually loaded**, despite the backend-only feature. It does not record reviewer skill usage; no reviewer skill-loading claim is inferred from that manifest.

## What the reviews revealed

Trial 1 promised to catch forwarding raw `req.query` instead of parsed `result.data`, but used requests whose raw and parsed objects were equal. Required Opus review rejected that claim even though 207 tests passed and the GitHub workflow completed successfully.

After guidance refinement, trial 2 again produced 207 passing tests. Its reviewer identified the same surviving counterexample but classified it as minor/other, allowing native acceptance. Independent development review treated the explicitly promised regression as material and blocked application of the unchanged proposal.

The independent execution changed only `repository.list(result.data)` to `repository.list(req.query as typeof result.data)`, retaining validation and the 422 guard. With trial 2's exact test overlay, both the control and mutant passed **23/23 router tests**. This demonstrates a real missed regression in the proposal's own claim.

Trial 3 narrowed the valid-priority claim and separately added a request with `?unrelated=1`. Unknown-key stripping is explicitly labeled **characterization of current Zod behavior**, rather than an OpenAPI requirement. The resulting `Object.keys(...)` assertion distinguishes parsed output from the raw query.

Required Opus review and independent static review passed. Repeating the same selected source mutation with trial 3's exact tests gave **22 passing control tests**, then **21 passing / 1 intended failure**: `does not forward unrelated query parameters to the repository`. The source was restored byte-for-byte after the scratch experiment.

This is sensitivity evidence for one selected source counterexample, not a global mutation score. Trial 2's review misclassification also shows why a model reviewer cannot replace independent and human review.

## Accepted case choices and measurements

The accepted same-source proposal from trial 3 has four grouped plan cases in two files, `backend/tests/repository.test.ts` and `backend/tests/router.test.ts`, preserving existing assertions:

| Case                       | Observation protected                                                                                                        |
| -------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Repository priority query  | `list({ priority: 'low' })` emits the expected Prisma `where` and newest-first ordering; `list({})` emits no `where`.        |
| Valid router query         | `priority=high` returns 200 and forwards `{ priority: 'high' }` to the repository.                                           |
| Invalid router query       | `priority=urgent` returns 422 with nonempty validation issues and never calls the repository.                                |
| Empty/unknown router query | No priority yields an object with no own enumerable keys; unrelated query keys are stripped, explicitly as characterization. |

The repository is real, but its Prisma database call is mocked: this proves emitted-query shape and row mapping, not actual PostgreSQL filtering. Router cases drive real Express and Zod through supertest with a stub repository. The later follow-up adds repeated-parameter and other rejection boundaries; API-document content remains untested.

| Trial     | Backend + frontend passing tests | Added tests over baseline | Patch files / bytes  | Reported cumulative tokens |
| --------- | -------------------------------- | ------------------------- | -------------------- | -------------------------- |
| 1         | 102 + 105 = 207                  | 14                        | 3 / 4,464            | 197,503                    |
| 2         | 102 + 105 = 207                  | 14                        | 3 / 4,464            | 199,705                    |
| 3         | 92 + 105 = 197                   | 4                         | 2 / 3,122            | 195,744                    |
| Follow-up | 95 + 105 = 200                   | 7 cumulative              | 1 / 1,114 additional | 183,443                    |

All four candidates measured identical coverage: backend lines **110/113 (97.34%)**, branches **52/53 (98.11%)**; frontend lines **149/151 (98.67%)**, branches **132/137 (96.35%)**. Trial 3 added four tests and reached 197; the follow-up adds three boundary rows and reaches 200, versus 207 in the first proposals. This smaller suite retains those measurements but does not establish a generally minimal or optimal suite. Coverage measures execution, not complete behavior protection.

Trial 3 raw patch SHA-256: `0c417fa0deb22dc164658a8d9b30be384c2f9194e0eafc908efc6f297d173a61` (**3,122 bytes**). Applied as [`e14f788`](https://github.com/BigGafLeo/cloudfide/commit/e14f788d1cba9bf7d065a05720af48dd43f35697), both committed test-file blobs match the native materialized files exactly. Local backend coverage ran 92/92 tests successfully and typecheck passed; 294 other tracked files remained byte-identical.

## Automatic boundary follow-up

CI [38900070621](https://github.com/BigGafLeo/cloudfide/actions/runs/38900070621) passed after `e14f788`, automatically triggering [38900299819](https://github.com/BigGafLeo/cloudfide/actions/runs/38900299819) on that new test-bearing head, with trusted controller `590ee04`. This fourth feature workflow is outside the unchanged-D2c trials. Required fresh Opus review and independent review passed; the latter records one minor novelty-rationale inaccuracy.

Its one parameterized router case adds three 422 rejection rows: empty `priority=`, wrong-case `priority=HIGH`, and repeated `priority=high&priority=low`, each requiring nonempty issues and no repository call. Eight focused executions compared the old 22-test router suite with the new 25-test suite: both controls passed; each of three schema preprocessors (empty-to-undefined, lowercasing strings, taking the first array element) passed all 22 old tests, then failed only its corresponding new row (**24 pass / 1 fail**). These establish incremental protection for these selected mutations, not exhaustive mutation adequacy.

The native rationale also claimed that loosening the enum to `z.string().optional()` escaped the existing `urgent` test. That claim is inaccurate: the existing test already catches it. The retained run's independent disposition explicitly corrects this while preserving the raw native review and plan.

The additional exact patch is **1,114 bytes**, SHA-256 `4762b71cd0814a57a5220dcd6dac14764842c385045fa7a07c41d3cd5e03b1b2`, applied as `cfba8af149e139f97137bccd695e4b9bfc887b85`. The Git blob matches native output; local backend coverage passed 95/95 and typecheck passed, with 295 other tracked files unchanged. The progression is corrected baseline **193 → 197 → 200 tests**. Final CI passed all nine application checks, 200 application tests and 182 controller tests before merge. The last automatic run [38901949635](https://github.com/BigGafLeo/cloudfide/actions/runs/38901949635) completed successfully with a skipped decision after PR closure: no candidate calls, zero tokens, no patch, and verifier/reviewer skipped. No further proposals were applied; this does not establish that all possible tests were exhausted.

## Usage and retained evidence

The first three controlled trials used **9 native calls / 592,952 cumulative input-plus-output tokens**, including rejected and independently blocked proposals. The fourth adds **3 calls / 183,443 tokens**: all four feature workflows total **12 calls / 776,395 tokens**. With the earlier baseline native run, the separate pipeline total is **29 calls / 2,044,238 tokens**; interactive development and security review are excluded.

Input includes fresh, cache-write and cache-read tokens; output already includes reported thinking tokens. Repeated-call totals are not unique context size, a subscription quota or an invoice. Each per-call record is counted once.

| Trial     | Retained run and review                                                                                         | Per-call usage                                                | Exact patch and plan                                          |
| --------- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------- |
| 1         | [Run JSON](evidence/priority-filter-run-38893683492.json)                                                       | [Usage JSON](evidence/priority-filter-usage-38893683492.json) | [Patch JSON](evidence/priority-filter-patch-38893683492.json) |
| 2         | [Run JSON, including surviving counterexample](evidence/priority-filter-run-38896463843.json)                   | [Usage JSON](evidence/priority-filter-usage-38896463843.json) | [Patch JSON](evidence/priority-filter-patch-38896463843.json) |
| 3         | [Run JSON, including detected counterexample](evidence/priority-filter-run-38898669374.json)                    | [Usage JSON](evidence/priority-filter-usage-38898669374.json) | [Patch JSON](evidence/priority-filter-patch-38898669374.json) |
| Follow-up | [Run JSON, incremental counterexamples and rationale correction](evidence/priority-filter-run-38900299819.json) | [Usage JSON](evidence/priority-filter-usage-38900299819.json) | [Patch JSON](evidence/priority-filter-patch-38900299819.json) |

Use the run-specific links and retained JSON to audit these trials. The PR bot comment can be replaced by a later eligible-head report; publication is restricted to the relevant current PR head. A later comment or green workflow must be read with its own decision, source head and review disposition.

These accepted runs demonstrate this feature and its boundary follow-up after two documented failures or blocks. They are not a representative benchmark or proof of complete correctness.
