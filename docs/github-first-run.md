# First GitHub run

This guide starts after the trusted controller and workflows have been reviewed. Local native conformance is already recorded in [validation.md](validation.md). A local subscription login does not transfer credentials into Actions.

## 1. Bootstrap the trusted controller

Publish the controller, its skills, lockfiles, non-secret conformance records and the two workflows in a bootstrap PR. Include the public architecture, baseline and verification documentation. Keep received recruitment instructions, private planning/review notes, output, dependencies and credentials excluded.

Let the bootstrap PR's secret-free CI pass, review the changes and merge the controller into the default branch. The Unit-test agent workflow must exist there before its manual and workflow_run entry points can be exercised. This first PR installs the workflow; it is not evidence of model-assisted application-test generation.

## 2. Configure the first model run

The owner profile in agent/config.json permits only BigGafLeo and selects Claude subscription authentication with claude-sonnet-5-5 for analyst and writer. The optional reviewer and mutations are disabled. A recipient must replace trustedAuthors and configure their own account before enabling their copy.

In the repository, open Settings -> Secrets and variables -> Actions -> New repository secret. Name the secret CLAUDE_CODE_OAUTH_TOKEN and supply the token generated through the official Claude Code setup-token flow. Keep the token in the secret form; it must not enter source files, commands with literal credentials, PR comments or logs. Confirm that the repository lists the secret name afterward.

For this public repository, Codex subscription authentication is blocked at GitHub entry points. Personal local Codex probes remain supported; explicit API authentication is a separately billed choice. See the [authentication policy](../README.md#authentication-and-provider-policy).

Scoped automatic pr-change runs admit at most two core model calls plus an explicitly enabled reviewer. Manual coverage-gap runs admit at most eight analyst/writer rounds and seventeen calls including that optional reviewer. All rounds share the original budget and four-hour deadline; the configured seventeen subscription reservation units are virtual admission accounting, not a bill or a subscription-quota meter. Account limits still apply. There is no paid API fallback or automatic retry of a failed provider/head check.

## 3. Open the coverage-gap PR

Create a new branch from the installed default branch. Add docs/first-coverage-run.md describing the actual baseline and linking testing-baseline.json, then open a same-repository PR authored by an allowlisted operator. This documentation change provides a concrete initial PR without manually writing the missing application tests.

Before manual dispatch, wait for ordinary CI and its resulting automatic Unit-test agent run to finish for the current PR head. The automatic run for this documentation-only change should report no unit-relevant change. Model jobs share a per-PR concurrency group with cancel-in-progress enabled; dispatching while the automatic run is still pending can cancel the coverage-gap run or replace its report.

Run Unit-test agent through Actions -> Run workflow, select the default branch and enter that open PR number. Equivalently, substitute your repository and actual PR number below:

```sh
gh workflow run unit-test-agent.yml --repo OWNER/REPO --ref main -f pr=PR_NUMBER
```

The manual entry point selects coverage-gap analysis. It collects the exact base/head snapshots and measures the current frontend and backend, even if the opening PR only changes the baseline note. Keep the PR head unchanged while this captured run executes.

## 4. Inspect the real outcome

The jobs perform identity resolution and secret-free precollection. Manual coverage-gap then repeats analyst -> plan validation -> writer -> isolated candidate verification with refreshed tests and gaps, preserving the last verified cumulative proposal when a batch fails or a limit stops further work. A separate final verifier rechecks that proposal before PR publication. The report binds the tested commit and run/attempt. Proposal checks can be accepted while the overall coverage run remains partial. Only the final verifier establishes reached: at least 80% lines and 80% branches separately in frontend and backend, with complete passing checks, comparable scope and no regression in any measured metric. Inspect the round history, shared call ledger and explicit stop reason, including payload capacity or head-check failure. A failed/inconclusive proposal is a real result to diagnose; do not label it a successful test improvement.

In the PR and Actions run, inspect:

- The analyst's cases, contract sources, confidence and skills used.
- The generated test-only files and writer rationale.
- Both applications' unit/typecheck/coverage results and controller-owned raw logs.
- Coverage comparison using the same measurement scope, plus any remaining gaps.

The standard run leaves review and mutation jobs disabled. Verification applies the proposal in a disposable snapshot. It publishes a PR comment and downloadable proposal payload, without committing generated changes.

## 5. Apply useful tests and retain evidence

Download the run's agent payload artifact. Its payload.json contains patchText; preserve that string exactly as candidate.patch. Inspect it, use git apply --check, and apply only a useful verified proposal. Run both application suites/typechecks/coverage again, then commit the accepted tests to the coverage PR through the normal review process.

Check assertion sensitivity on a disposable copy: remove a behavior the new test claims to protect and require a failure on the intended assertion. Restore that copy afterward. Coverage percentages alone do not establish useful assertions.

Record actual PR/run links, tested SHA, role decisions, skills, test results and same-scope before/after metrics in SOLUTION.md. If a run fails, record its cause and the eventual verified correction rather than a fabricated success.

## 6. Demonstrate the automatic trigger

After the baseline improvement, a separate PR changing a small application behavior can demonstrate the automatic CI -> workflow_run route. Use that PR to show analysis of changed code, generated/updated tests, execution and the PR report. This is also the optional feature-PR demonstration.

When preparing the recruitment handover, disable model calls and remove the author's personal Actions model secrets. Reviewers can run existing tests without model access; a fresh model run uses their own credentials and allowance. See the [handover guidance](../README.md#recruitment-handover-without-access-to-the-authors-allowance).
