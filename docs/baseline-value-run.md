# Original-baseline value run: first attempt

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

These are selected diagnostic examples, not a representative mutation score or a proof of a minimal suite. An empty OpenAPI document was outside this candidate's tested scope; a toggle regression was not executed. Raw manifests, exact patch and logs remain in the run artifacts; local probe records are retained separately. A second fresh run will use the corrected trusted controller on the unchanged original application head.
