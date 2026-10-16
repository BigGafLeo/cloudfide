# Original-baseline value runs

[Run 38821579466](https://github.com/BigGafLeo/cloudfide/actions/runs/38821579466) used trusted controller 02c70037444df82f34d283183bdbbc604be74bbd on [PR5](https://github.com/BigGafLeo/cloudfide/pull/5), head 6ac67eb6ea965bc92c7e1afdee75f8868180eb48. Its backend/frontend Git trees exactly match the received application at 22be6e3bcf54fd012104fe233ef6652dd01941ff: 48 backend and 18 frontend tests. No previous generated tests were used as input.

The result is **inconclusive / partial**, not an accepted proposal. All workflow jobs and nine final application checks passed, but required fresh Opus review found lost original API return-value assertions. No application changes were applied or merged.

| Final verified candidate |                  Backend |                  Frontend |
| ------------------------ | -----------------------: | ------------------------: |
| Passing tests            |         68 (original 48) |          47 (original 18) |
| Lines                    | 75/109 = 68.80% (33.02%) | 116/151 = 76.82% (47.68%) |
| Branches                 |  32/48 = 66.66% (33.33%) |  91/137 = 66.42% (43.79%) |

The candidate contains 15 test files (9 new, 6 modified), net 49 extra passing tests. Its 20 grouped plan cases are not 20 actual individual tests; add/strengthen labels do not prove that existing assertions were strengthened. All four coverage denominators were stable and metrics nonregressing. The configured 80% line/branch target was not reached.

Two batches were accepted by mechanical verification. Round3 failed source-path admission; round4 failed frontend typecheck, so its higher coverage was discarded. The old two-round no-progress limit stopped further work. Seven Sonnet calls and one required Opus call used official Claude Code subscription authentication; no model API fallback occurred. Normalized estimatedUsd is null. Native list-price metadata is not an invoice or remaining subscription allowance.

## What the rejection exposed

Exact context reproduction showed that imported API/utils source files were supplied without their existing tests. The analyst could not compare those omitted assertions, and the writer replaced test files it had not seen. The required reviewer received the originals and blocked acceptance. The follow-up includes tests for one-hop imports, refuses blind rewrites, requires same-target comparisons and supplies bounded typecheck diagnostics to the next round. It allows three non-growing rounds within the existing overall limits.

Independent local counterexample checks used disposable app-only Docker execution. Original API/utils tests caught two controlled regressions (corrupt create return value; bypass status when searching), while the proposed tests passed both. Controls and final restoration passed. Other selected probes showed useful protection against negative-ID coercion and loss of query cancellation. A harmless SQL whitespace edit also failed, demonstrating undesirable formatting coupling. Removing a whole SQL constraint failed, which does not prove the test validates its predicate.

These are selected diagnostic examples, not a representative mutation score or a proof of a minimal suite. An empty OpenAPI document was outside this candidate's tested scope; a toggle regression was not executed. Raw manifests, exact patch and logs remain in the run artifacts; local probe records are retained separately. The second fresh run below uses the corrected trusted controller on that unchanged original application head.

## Second attempt: configured target reached

[Run 38825695235](https://github.com/BigGafLeo/cloudfide/actions/runs/38825695235) used corrected controller 094fcaca317b67c08fbb6d112f32197ef5159f4d, deployed through [PR6](https://github.com/BigGafLeo/cloudfide/pull/6). Its application head and base are unchanged from the first attempt. Reproduction of the initial 82 KB analysis bundle confirms both previously omitted original API/utils test files are supplied, below the unchanged 200 KB limit.

The pipeline published **accepted; coverage run: reached** after three verified rounds, nine passing final application checks and a required fresh Opus review. It stopped at the configured 80% lines/branches target, using seven official Claude subscription calls (three analyst/writer pairs plus reviewer), below the seventeen-call ceiling. No model API fallback occurred. The 100% objective remains false; meeting the run target is not complete behavioral coverage.

| Measurement       |       Original | Second candidate |
| ----------------- | -------------: | ---------------: |
| Backend tests     |             48 |               70 |
| Frontend tests    |             18 |               63 |
| Backend lines     | 36/109 =33.02% |   92/109 =84.40% |
| Backend branches  |  16/48 =33.33% |    45/48 =93.75% |
| Frontend lines    | 72/151 =47.68% |  131/151 =86.75% |
| Frontend branches | 60/137 =43.79% |  124/137 =90.51% |

All four metric denominators and coverage scope are unchanged. The exact proposal has 19 test files: 10 new and 9 modified, net 67 extra passing tests. Its 26 grouped plan cases contain 20 add and 6 strengthen labels; those are model classifications, not a mechanical guarantee of assertion strengthening. Independent source review found original assertions preserved and substantial distinct protection without excessive duplication. This is one observed run, not a controlled benchmark establishing the best possible test count.

### Remaining quality work is visible

Opus passed with four minor findings: nondiscriminating database-name encoding input, unasserted DDL defaults, no observable stale-refetch cancellation and duplicated editor mock setup. These are unconfirmed model claims in the published workflow, not automatically validated facts. A follow-up check also corrected the suggested '?'/'#' encoding counterexample: URL.pathname percent-encodes those characters itself; literal percent inputs discriminate the missing-encoding behavior.

Selected local isolated Docker probes confirm the candidate now detects both previously lost regressions (corrupt create result and bypass status during search), negative-ID coercion, always-completing toggles, an empty specification response and weakened/removed title constraints. Controls pass before mutation and after byte-verified restoration. Double-space SQL formatting passes, an improvement over attempt 1.

The same diagnostics expose remaining limits: removing cancelQueries still passes the hook test. Independent review found a narrow P2 gap in the rejected-delete case: calling onClose in its catch block still passes because the anonymous spy does not unmount a statically rendered dialog. That test should explicitly assert a named onClose spy was not called. A harmless length( title ) spacing change also fails the DDL regex (P3 coupling). These are follow-up work before applying the proposal; they do not erase its other useful assertions. No automatic repair or application merge was performed.

The [derived evidence](evidence/baseline-value-run-38825695235.json) retains identities, complete case/value plan, counts, coverage, calls, native review and summarized diagnostic outcomes. The [exact patch JSON](evidence/baseline-value-patch-38825695235.json) preserves patchText and its digest beyond temporary Actions retention. It is review data and has not been applied to backend/frontend. Local diagnostics are separate from the workflow's disabled Stryker option and are not a representative mutation score.

The subsequent controller update makes threshold stopping configurable and tightens the required oracle-counterexample gate. Those changes do not alter either historical run or the preserved patch: the accepted second-run proposal still has the documented follow-up gaps. Controller regression tests and local role-pressure samples are separate from a fresh native adapter run.
