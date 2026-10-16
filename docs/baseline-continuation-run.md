# Baseline continuation run and token usage

[Run 38832961036](https://github.com/BigGafLeo/cloudfide/actions/runs/38832961036) finished on 2026-10-16 with **workflow failure and an inconclusive proposal**. All nine final application checks passed, but the required reviewer stopped at the host context-size guard before any model invocation. The proposal has not been accepted, applied or merged.

The trusted controller was 1dc3bb796225d9ae22a3b54cafd0593254d8d81a, with stopAtTarget=false. [PR5](https://github.com/BigGafLeo/cloudfide/pull/5) remained at 6ac67eb6ea965bc92c7e1afdee75f8868180eb48, base 02c70037444df82f34d283183bdbbc604be74bbd. Its backend/frontend trees match the received application at 22be6e3bcf54fd012104fe233ef6652dd01941ff: 48 backend + 18 frontend tests. Earlier generated proposals were not inputs. Elapsed workflow time was 28 minutes 50 seconds, including setup and isolated verification.

## Measured result

| Measurement       |        Original | Final verified candidate |
| ----------------- | --------------: | -----------------------: |
| Backend tests     |              48 |                       74 |
| Frontend tests    |              18 |                       92 |
| Backend lines     | 36/109 = 33.02% |         106/109 = 97.24% |
| Backend branches  |  16/48 = 33.33% |           47/48 = 97.91% |
| Frontend lines    | 72/151 = 47.68% |         150/151 = 99.33% |
| Frontend branches | 60/137 = 43.79% |         133/137 = 97.08% |

The candidate contains 24 test files: 14 new and 10 modified, net 100 additional passing tests. Its 40 grouped plan cases are labelled 30 add and 10 strengthen; these labels are analyst classifications, not a mechanical proof of distinct behavioral value. All four coverage metric denominators stayed unchanged, with no measured regression. The configured 80% lines/branches milestone was met; the 100% objective was not. High coverage does not establish complete behavior coverage or a minimal test suite.

## Rounds and stopping

| Round | Mechanical admission | Observed backend / frontend tests | Backend lines / branches % | Frontend lines / branches % |
| ----- | -------------------- | --------------------------------: | -------------------------: | --------------------------: |
| 1     | accepted             |                           58 / 29 |              51.37 / 66.66 |               57.61 / 49.63 |
| 2     | accepted             |                           61 / 38 |              62.38 / 66.66 |               68.87 / 51.82 |
| 3     | accepted             |                           66 / 69 |              77.98 / 93.75 |               85.43 / 78.83 |
| 4     | rejected             |                           70 / 81 |              87.15 / 97.91 |               94.03 / 94.89 |
| 5     | accepted             |                           66 / 77 |              77.98 / 93.75 |               91.39 / 83.94 |
| 6     | accepted             |                           69 / 87 |              83.48 / 93.75 |               94.70 / 95.62 |
| 7     | accepted             |                           73 / 90 |              92.66 / 97.91 |               97.35 / 97.08 |
| 8     | accepted             |                           74 / 92 |              97.24 / 97.91 |               99.33 / 97.08 |

Round 4 had two failing backend lifespan tests (app.listen is not a function). Its apparent coverage increase and proposed tests were discarded. Round 5 resumed from round 3, the last accepted overlay. Seven rounds were accepted by mechanical checks. This is separate from final semantic approval.

The first accepted proposal to meet all four 80% thresholds was round 6 (156 tests). The controller continued through rounds 7 and 8 to 166 tests, then stopped at the configured **round-limit**, with 16 of 17 allowed calls used. It did not stop because all useful tests were exhausted. Every accepted round increased measured coverage in this run; the separate continuation path for useful assertion strengthening with unchanged coverage was not exercised here.

After the milestone, the plan selected page editor/delete wiring and cancel/failure behavior, uncached deletion, listener success/error handling, graceful shutdown and DDL constraints/defaults. Rounds 7 and 8 consumed 296,308 input tokens including cache + 28,634 output tokens = **324,942 tokens**, already included in the total. The rejected round consumed 131,292 + 16,930 = **148,222 tokens**, also included. These are selected test intentions and observed checks; the final reviewer did not assess their semantic quality. Mutation testing remained disabled.

Inspection of selected generated files shows explicit negative onClose/onDeleted assertions on delete rejection, a consumed AbortSignal and late-result cache check for create cancellation, encoded literal-percent database input, and SQL predicate/default assertions tolerant of punctuation whitespace. No new mutation score or independent full-suite quality approval is claimed.

## Why final review did not run

Exact reconstruction from captured Git blobs with shipped selectReviewFiles/runReview reproduced **review context bounds**: 219,683 serialized input bytes against a 204,800-byte host limit, an excess of 14,883 bytes. The input held 57 original source/test files; serialized component values included plan 66,246 bytes, patch 74,087 bytes and files 74,511 bytes. The raw patch itself is 72,078 bytes; JSON escaping accounts for the larger serialized string. The local replay used an adapter sentinel and made zero provider calls.

The guard is before Budget construction and executeRole. Thus Opus was never invoked, no reviewer artifact or finding exists, and reviewer token consumption is zero. This is a controller packaging failure, not a model rejection, timeout or provider context-window limit. The required gate remained closed.

The published report says inconclusive / coverage run: partial because its milestone label is currently coupled to proposal acceptance. The final verifier nevertheless proves the numeric 80% thresholds were reached. Acceptance and measured attainment must be read separately.

Before another native attempt, the controller needs a bounded review package and an early capacity check as the aggregate grows, preserving the original tests, exact patch and assertion/value evidence needed by the reviewer. Missing review must remain blocking. No limits were silently relaxed and no paid rerun, provider fallback or synthetic review was used to conceal this failure.

## Token usage

All **16 actual calls** used official Claude Code subscription authentication with claude-sonnet-5-5 (8 analyst + 8 writer). All completed and all have reported usage. The required claude-opus-5-5 reviewer had zero calls. There was no model API fallback.

| Role      |  Calls | Input including cache | Output including thinking | Input + output |
| --------- | -----: | --------------------: | ------------------------: | -------------: |
| analyst   |      8 |               492,195 |                    43,041 |        535,236 |
| writer    |      8 |               518,026 |                    76,097 |        594,123 |
| reviewer  |      0 |                     0 |                         0 |              0 |
| **Total** | **16** |         **1,010,221** |               **119,138** |  **1,129,359** |

Disjoint input categories are **32 uncached input + 976,953 cache-write input + 33,236 cache-read input = 1,010,221 input tokens**. Cache writes are newly supplied input, so the 32-token field alone is not the amount of new prompt content. Output is 119,138 tokens, including 22,928 reported thinking tokens; thinking is not added again. Counts are cumulative across calls, not unique repository/context tokens.

| Call | Round | Role    | Uncached input | Cache write | Cache read | Output | Input + output |
| ---- | ----: | ------- | -------------: | ----------: | ---------: | -----: | -------------: |
| 1    |     1 | analyst |              2 |      44,288 |          0 |  5,506 |         49,796 |
| 2    |     1 | writer  |              2 |      48,148 |          0 | 10,541 |         58,691 |
| 3    |     2 | analyst |              2 |      45,825 |      2,709 |  6,707 |         55,243 |
| 4    |     2 | writer  |              2 |      50,662 |      2,039 |  6,921 |         59,624 |
| 5    |     3 | analyst |              2 |      54,056 |      2,709 |  6,382 |         63,149 |
| 6    |     3 | writer  |              2 |      58,934 |      2,039 | 13,787 |         74,762 |
| 7    |     4 | analyst |              2 |      61,266 |      2,709 |  5,777 |         69,754 |
| 8    |     4 | writer  |              2 |      65,274 |      2,039 | 11,153 |         78,468 |
| 9    |     5 | analyst |              2 |      63,895 |      2,709 |  3,617 |         70,223 |
| 10   |     5 | writer  |              2 |      66,404 |      2,039 |  5,210 |         73,655 |
| 11   |     6 | analyst |              2 |      63,581 |      2,709 |  5,735 |         72,027 |
| 12   |     6 | writer  |              2 |      67,816 |      2,039 |  9,168 |         79,025 |
| 13   |     7 | analyst |              2 |      69,997 |      2,709 |  5,046 |         77,754 |
| 14   |     7 | writer  |              2 |      73,400 |      2,039 | 10,163 |         85,604 |
| 15   |     8 | analyst |              2 |      70,308 |      2,709 |  4,271 |         77,290 |
| 16   |     8 | writer  |              2 |      73,099 |      2,039 |  9,154 |         84,294 |

Only top-level final CLI usage is counted, not again through modelUsage or iterations. Cache subcategories are not added twice. Tokens are not an invoice, a subscription charge estimate or remaining quota. Normalized estimatedUsd is null for subscription calls. This interactive Codex session and local read-only analysis are outside the pipeline count.

For historical context, the previous seven-call run reported 394,552 input + 60,882 output = 455,434 tokens and 133 passing candidate tests. These are different stochastic runs with changed role guidance and different review completion, so this comparison is not a controlled measurement of the continuation policy's efficiency.

## Retained evidence

The [derived run evidence](evidence/baseline-value-run-38832961036.json) contains complete case/round history, identities, checks, coverage, context-size reproduction and per-call usage. The [token ledger](evidence/baseline-value-usage-38832961036.json) is available separately. These are derived read-only records, not replacement producer manifests.

The [exact patch JSON](evidence/baseline-value-patch-38832961036.json) preserves patchText beyond temporary Actions retention: SHA-256 **b440e951118bff54aa9f35f6ab5f496c8e8c43e6a23d1678017867d76675092d**, **72078 bytes**. Its digest, byte count, manifest schemas and contexts were checked; a local patch-admission check against exact original Git bytes succeeded in guarded temporary directories. An initial local attempt using Windows working-tree line endings failed to apply, then passed with captured Git blobs; this was separate from the successful Linux verifier. Application files were not modified. Raw producer artifacts, workflow logs and test execution logs were downloaded to the ignored local run directory.

## Reviewer-context follow-up

The subsequent bounded fix gives final review its own 512 KiB input limit while leaving per-round analysis at 200 KiB. Required-review capacity is checked before promotion of each passing coverage batch; an oversized batch stops further rounds and preserves the previous candidate and call ledger. The full historical input now fits unchanged: same 219,683 bytes and SHA-256 c07924dcb7a2bd9eb35aebea4a7ca0960510274c6da54dbc2c0af7f8c703015a.

The [offline sizing/admission replay](evidence/reviewer-context-replay-38832961036.json) dispatches an adapter sentinel after the original 16 calls, without any provider request or added token usage. It is not a live Opus review, does not approve the tests and does not alter the historical failed workflow. The controller suite passes 168 tests with two Windows platform skips (170 total), including byte-boundary, UTF-8, evidence-preservation and last-candidate admission regressions.
