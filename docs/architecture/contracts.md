# Kontrakty

Rewizja 2026-10-14. Część [architektury](../architecture.md); definicje implementujemy w agent/src/contracts.ts jako bounded runtime schemas i odpowiadające im typy.

```ts
type Role = "analyst" | "writer" | "reviewer";
type Task = "pr-change" | "coverage-gap";
type Decision =
  | "accepted"
  | "no-change"
  | "failed"
  | "inconclusive"
  | "skipped"
  | "error"
  | "cancelled";
type CheckStatus =
  "passed" | "failed" | "inconclusive" | "error" | "skipped" | "cancelled";
type Gate = "required" | "advisory";
interface RunContext {
  repository: string;
  repositoryId: number;
  pr: number;
  executionRunId: string;
  executionAttempt: number;
  trigger:
    | {
        kind: "workflow-run";
        workflowId: number;
        runId: string;
        attempt: number;
      }
    | { kind: "dispatch" };
  baseSha: string;
  headSha: string;
  controlSha: string;
  task: Task;
  deadline: string;
}
interface Case {
  id: string;
  sourceLocation: string;
  behavior: string;
  requirementSource: string;
  inputs: string;
  expected: string;
  assertion: string;
  mockBoundary: string;
  confidence: "contract-backed" | "characterization" | "unconfirmed";
  value: {
    action: "add" | "strengthen";
    testPath: string;
    existingTests: { path: string; name: string }[];
    regression: string;
    rationale: string;
  };
}
interface TestPlan {
  decision: "write" | "no-change" | "inconclusive";
  reason: string;
  cases: Case[];
  paths: string[];
  remainingGaps: string[];
}
interface TestFile {
  path: string;
  content: string;
}
interface WriterResult {
  status: "written" | "dispute";
  reason: string;
  files: TestFile[];
  caseIds: string[];
}
interface Finding {
  id: string;
  severity: "material" | "minor";
  location: string;
  claim: string;
  evidence: string;
  kind: "scope-violation" | "oracle-counterexample" | "other";
  factId: string | null;
}
interface VerificationFact {
  id: string;
  kind: "scope-violation" | "oracle-counterexample";
  location: string;
  evidenceRef: string;
}
interface HostConfirmation {
  findingId: string;
  factId: string;
}
interface ReviewResult {
  status: "passed" | "failed" | "inconclusive";
  reason: string;
  findings: Finding[];
}
interface FinalUsage {
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedUsd: number | null;
  raw: unknown;
}
interface CallRecord {
  callId: string;
  role: Role;
  provider: string;
  model: string;
  reservedEstimateUsd: number;
  usage: FinalUsage | null;
  elapsedMs: number;
  status: "completed" | "failed" | "cancelled" | "unknown";
}
interface RoleRequest {
  callId: string;
  role: Role;
  model: string;
  prompt: string;
  schema: object;
  timeoutMs: number;
  allocationUsd: number;
}
interface NativeResult {
  result: unknown;
  usage: FinalUsage | null;
  diagnostics: string[];
  version: string;
  status: CallRecord["status"];
}
interface ProviderAdapter {
  id: string;
  assertCapabilities(): Promise<void>;
  run(request: RoleRequest, signal: AbortSignal): Promise<NativeResult>;
}
interface FileData {
  path: string;
  content: string;
}
interface AnalysisBundle {
  context: RunContext;
  diff: string;
  files: FileData[];
  evidence: object;
  missingCritical: string[];
}
interface CheckResult {
  id: string;
  gate: Gate;
  status: CheckStatus;
  reason: string;
  command: string;
  exitCode: number | null;
  logPath: string;
}
interface ArtifactRef {
  name: string;
  sha256: string;
  bytes: number;
}
interface CandidateManifest {
  context: RunContext;
  plan: TestPlan | null;
  patch: ArtifactRef | null;
  files: string[];
  calls: CallRecord[];
  skillsUsed: string[];
  producerJob: "agent";
  status: "candidate" | "no-change" | "inconclusive" | "error" | "skipped";
}
interface Metric {
  covered: number;
  total: number;
  pct: number;
}
type Metrics = Record<
  "lines" | "branches" | "statements" | "functions",
  Metric
>;
interface CoverageReport {
  frontend: Metrics;
  backend: Metrics;
  gaps: string[];
}
interface CoverageComparison {
  status: "comparable" | "not-comparable";
  reason: string;
  deltas: {
    frontend: Record<
      keyof Metrics,
      { covered: number; total: number; pctPoints: number }
    >;
    backend: Record<
      keyof Metrics,
      { covered: number; total: number; pctPoints: number }
    >;
  } | null;
  objectiveMet: boolean;
}
interface VerificationManifest {
  context: RunContext;
  patchSha256: string;
  producerJob: "verifier";
  checks: CheckResult[];
  originalCoverage: CoverageReport;
  candidateCoverage: CoverageReport;
  coverageComparison: CoverageComparison;
  facts: VerificationFact[];
}
interface CandidatePayload {
  manifest: CandidateManifest;
  patchText: string | null;
}
interface VerificationPayload {
  manifest: VerificationManifest;
}
interface ReviewManifest {
  context: RunContext;
  patchSha256: string;
  producerJob: "reviewer";
  result: ReviewResult;
  call: CallRecord;
  confirmations: HostConfirmation[];
}
interface ReviewPayload {
  manifest: ReviewManifest;
}
interface QualityCheck {
  id: string;
  run(workspace: string, signal: AbortSignal): Promise<CheckResult>;
}
```

Schemas wymagają exact known fields, safe finite numbers, SHA/context format, byte/file/case limits i relacji pól. Wszystkie IDs i identity tworzy host. Native result nie wybiera context/provider/gate/commands. plan=null jest dozwolony tylko przy terminal error/skipped/inconclusive bez candidate; no-change wymaga pełnego planu/rationale. Empty files z written, unknown caseIds, unconfirmed material case, paths poza allowlist lub dispute nie dają candidate.

Role testPlanSchema i WriterResult pozostają ograniczone do 20 cases/files. candidateSchema.plan używa aggregatedPlanSchema: maksymalnie 160 cases/paths, 160 skumulowanych plików i 17 CallRecord. ID zaakceptowanego case ma host prefix round-N:, a pełne per-round plany pozostają w opcjonalnym coverageRun.rounds (maksymalnie osiem), wraz z units/checks/coverage/callIds i stopReason. Dotychczasowe manifesty bez coverageRun nadal są poprawne. VerificationManifest ma opcjonalne candidateTests z mierzonymi licznikami testów; pętla przekazuje je następnej rundzie. Patch ma <=1 MiB, pełny payload <=4 MiB; limit nie ucina planów po cichu.

W CandidateManifest, VerificationManifest i ReviewManifest sprawdzamy równe context oraz patch digest. Same-run artefakty wiążemy z executionRunId/executionAttempt; upstream CI evidence z trigger.workflowId/runId/attempt. Producer job przekazuje upload-artifact artifact-id przez named needs output z trusted workflow. API lookup tego ID wiąże artifact z expected execution run, nazwą, digest i bytes; run_attempt pobieramy osobno z workflow run API. Artifact API nie dostarcza producer job ani attempt. Payload producerJob to wyłącznie consistency field. CandidatePayload.patchText ma UTF-8 bytes/digest zgodne z manifest.patch; null tylko przy patch=null. Nie wyciągamy patcha z niezdefiniowanego drugiego entry. Pakiety mają digest na transfer boundary; brak własnego envelope seq/parent chain.

Decyzję tworzy host: pełne required passes i poprawny candidate dają accepted; required failure daje failed, brak lub niepewność daje inconclusive/error. Native finding nie ma pola confirmed. Każdy materialny fakt verifiera blokuje accepted także bez findingu modela. HostConfirmation powstaje tylko z faktu istniejącego w zwalidowanym VerificationManifest.facts, zgodnego kind/location/factId, nigdy z pewności modela lub samego cytatu. Fakt oracle wymaga kontrolowanego, secret-free counterexample z rozpoznanym assertion outcome; arbitrary source claim nie jest takim faktem. Bez takiego dowodu claim pozostaje unconfirmed. Host-confirmed material blokuje accepted także advisory. Advisory unconfirmed jest widoczny i nie blokuje; required material unconfirmed lub niekompletny review daje inconclusive. Nie dodajemy automatycznego reproduction job po reviewerze. no-change wymaga poprawnego planu i kompletnego wejścia, nie pustego output autora. Wyłączony reviewer/mutation daje skipped=disabled. Anulowany run nigdy accepted.

Typy raportów coverage pozostają lokalne w normalizerze, a format native usage w adapterze. Nie tworzymy wspólnego framework wszystkich test kinds i execution profiles.
