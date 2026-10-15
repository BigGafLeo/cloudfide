---
name: write-unit-tests
description: Use when creating or updating unit tests for a validated behavior plan.
---

# Write planned unit tests

Implement only the supplied case IDs and allowed test paths. Return WriterResult with status, reason, complete files and caseIds. For written, include the full UTF-8 contents of each selected file, preserving relevant existing assertions. When contract/evidence conflicts or a critical dependency is absent, return dispute with no invented expected result.
Exercise the actual unit. Mock external dependencies at their boundary; never mock the export under test. Use observable output, error or effects to distinguish the intended behavior from a concrete plausible bug. A successful call or toBeDefined alone seldom proves the case.
Keep tests deterministic: await promises/user interactions, isolate module/env state, restore globals/spies/timers and avoid live network/database, arbitrary sleeps or shared test ordering. Several assertions may protect one behavior. Maintain useful existing tests rather than replacing them with easier assertions.
Do not modify source, configuration, thresholds, exclusions, locks or setup to manufacture success. Do not execute commands or claim tests ran; the separate verifier provides execution evidence.
Read references/backend.md or references/frontend.md only for the selected application. When mutation is enabled, use selectively supplied mutation facts to strengthen behavior assertions, without changing source to kill mutants.
Writer output is a proposal, not a branch commit or an acceptance decision.
