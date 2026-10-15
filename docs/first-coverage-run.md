# First agent-driven coverage-gap run

The [first real run](https://github.com/BigGafLeo/cloudfide/actions/runs/38758028657) on [PR #2](https://github.com/BigGafLeo/cloudfide/pull/2) completed with an accepted test-only proposal on 2026-10-15. It analyzed head 50891869346e3d8cdcbd24a7b3c0908e324bf5ec using controller/base ab2fdbb050a711f5dfe34b9f41a2ff3f298d0d1f. The proposed patch SHA-256 is 272e0470691debd52111e2cf0eca1ab90960214b7db603ce57c28c74815419f3.

## Measured results

| Component | Passing tests before -> after | Lines before -> after | Branches before -> after |
| --- | --- | --- | --- |
| Backend | 48 -> 56 | 36/109 (33.02%) -> 49/109 (44.95%) | 16/48 (33.33%) -> 22/48 (45.83%) |
| Frontend | 18 -> 44 | 72/151 (47.68%) -> 99/151 (65.56%) | 60/137 (43.79%) -> 94/137 (68.61%) |

All nine verifier checks passed: installation, backend Prisma generation, both typechecks, unit suites and coverage collection. A separate local run of the exact Git snapshot and accepted patch reproduced the same metrics and 100 passing tests. Application source, dependencies and coverage configuration/exclusions were unchanged. This bounded proposal does not reach the 100% objective.

## Decisions and loaded knowledge

The analyst selected 11 behavioral cases across five test files: database URL configuration, HTTP success/error/abort handling, todo validation/sorting/date helpers, notification timing and API update/delete calls. The writer returned the test files without repository tools. The workflow used exactly two Claude Code subscription calls requesting claude-sonnet-5-5, with no model API key or paid API fallback.

Loaded skills were analyze-unit-gaps and write-unit-tests, each with its backend and frontend references. The optional workflow reviewer and mutation checks were disabled. Independent static review found no material issue; a minor additional assertion of AbortSignal forwarding remains deferred.

## Assertion sensitivity

In a disposable copy, five selected semantic regressions each failed the intended assertion: reversed database URL precedence, a wrong HTTP prefix, reversed due-date sorting, a 4001ms notice timeout and POST replacing DELETE. The identical focused commands passed before each change and after byte-identical restoration. These are manual sensitivity checks, not a whole-project Stryker mutation score.

The [machine-readable evidence](agent-run-2026-10-15.json) retains the actual plan, cases, skills, native usage, test/check results, comparable coverage and sensitivity outcomes. The [original baseline](testing-baseline.json) remains unchanged. Model-produced remaining gaps are labelled as analyst reports, not independently established completeness claims.

## Demonstration boundaries

The workflow published an [accepted PR report](https://github.com/BigGafLeo/cloudfide/pull/2#issuecomment-6192424564) and downloadable proposal; it did not push generated code. Ordinary CI and the automatic documentation-only no-change route were also exercised before this manual coverage-gap run. An automatic model-assisted run for a changed application feature remains a separate, optional demonstration. Before recruitment handover, remove the author's model secret and disable personal model access; recipients use their own credentials.
