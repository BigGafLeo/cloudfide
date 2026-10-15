# Fresh unit-test agent baseline run

This demonstration starts with the original received application, without any earlier agent-generated tests. Only the trusted controller and this run note are newer.

Original application baseline: 22be6e3bcf54fd012104fe233ef6652dd01941ff.

- Backend tree: c69fd15edee7f660fdceea69ef3ab6237057b625; 48 existing tests.
- Frontend tree: 468746e70c42fd9d67a9f3a64cb838e59d491f44; 18 existing tests.

The manual coverage-gap workflow will measure both applications, select useful additions or stronger assertions, verify cumulative proposals in isolated containers and run a fresh required test reviewer. The line/branch target guides discovery; neither the target nor case count proves test quality. Each case must record compared existing tests, a discriminating regression and impact versus maintenance cost.

The reference profile uses the official Claude Code CLI with the operator's subscription authentication: Sonnet for analysis/writing and Opus for independent final review. There is no model API fallback. Optional Stryker execution remains disabled; its absence must not be described as a mutation score.

The workflow publishes a test-only patch and measured evidence in this PR. It does not automatically commit or push generated changes. The final PR description links the exact captured head, run, measurements and review result. Earlier demonstration PR2 remains separate for comparison.
