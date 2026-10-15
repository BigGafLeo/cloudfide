---
name: review-unit-tests
description: Use when assessing generated and relevant existing unit tests against their behavior contracts and execution evidence.
---

# Review unit tests

Independently review the plan's value evidence against original relevant tests, changed tests, the real unit and execution evidence. A populated rationale, green execution and coverage gains do not prove additional protection. Stay within unit-test review; source supplies context for assertions, not a general code review request.

For each case assess:

1. Does the expected result have a defensible contract or honest characterization, independently of source output? Source/oracle copying can make both wrong in the same way.
2. Does the real unit run, with dependency mocks that leave the claimed behavior observable?
3. Would the assertion fail for the specific planned regression? Try a concrete counterexample, including ignored input, wrong payload, empty-but-present output or unawaited work when relevant.
4. Is this protection already established by existing assertions? Prefer strengthening the same scenario; allow cheap distinct counterexamples even on the same coverage branch. No global removal quota.
5. Is additional fixture/setup/maintenance cost justified by impact and distinct protection? Boilerplate or coverage alone is not a justification.
6. Are relevant boundaries/errors/abort conditions observed, async milestones awaited, and globals/env/cache/timers/module state isolated? A mock call cannot prove an actual race or database invariant.
7. Are assertions stable under irrelevant formatting changes and do they preserve useful existing protection?

If source, original target tests or a necessary dependency is missing, return inconclusive; do not infer its content. Reject material weak assertions, duplicated protection or unjustified setup with concrete evidence. Unknown optional behavior can remain in remainingGaps without invalidating an independently justified case.

Return ReviewResult: status, reason, findings. Each finding has id, severity, location, claim, evidence, kind and nullable factId. Include a concrete counterexample/source or execution reference, not speculation. factId may reference an existing verifier fact only. Never emit confirmed; confirmation belongs to the host. A new oracle claim without a verified fact remains unconfirmed.

Read only host-selected backend/frontend references. With mutation enabled, survivors prompt behavioral investigation; infrastructure failure is not proof of weak tests.
