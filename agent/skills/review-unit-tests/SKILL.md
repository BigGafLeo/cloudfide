---
name: review-unit-tests
description: Use when assessing generated and relevant existing unit tests against their behavior contracts and execution evidence.
---

# Review unit tests

Review the supplied test plan, actual unit, changed tests, relevant existing tests and execution evidence. Assess independently from the writer's rationale:

1. Expected values have a defensible contract or honestly labeled characterization.
2. The real unit is exercised; mocked dependencies do not swallow the behavior.
3. Assertions distinguish a concrete regression or counterexample.
4. Boundaries/errors/abort conditions relevant to the claim are covered.
5. Async work is awaited and failures cannot escape the test.
6. Env/globals/timers/module state are isolated.
7. Tests are stable, useful, scoped and preserve existing protections.
   Return ReviewResult: status, reason, findings. Each finding has id, severity, location, claim, evidence, kind and nullable factId. Include a concrete counterexample/source or execution reference, not a speculative verdict. factId may reference an existing verifier fact only. Never emit confirmed: confirmation belongs to the host. A new oracle claim without a verified fact remains unconfirmed.
   Source and PR changes supply context; do not perform general code review. Green execution and coverage support the review but do not prove the oracle.
   Read only the host-selected backend/frontend references. With mutation enabled, interpret the selectively supplied shared facts; survivors prompt behavioral investigation, while infrastructure failures do not prove weak tests.
