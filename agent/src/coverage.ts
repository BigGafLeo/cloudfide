import {
  coverageSchema,
  type CoverageReport,
  type CoverageComparison,
  type Metrics,
} from "./contracts.js";
const names = ["lines", "branches", "statements", "functions"] as const;
const apps = ["frontend", "backend"] as const;
function object(x: unknown): Record<string, any> {
  if (!x || typeof x !== "object" || Array.isArray(x))
    throw new Error("invalid coverage object");
  return x as Record<string, any>;
}
export function normalizeCoverage(
  summary: unknown,
  detail: unknown,
): CoverageReport {
  const s = object(summary),
    d = object(detail),
    result: Record<string, unknown> = { gaps: [] },
    gaps: string[] = [];
  for (const app of apps) {
    const total = object(object(s[app]).total);
    result[app] = Object.fromEntries(
      names.map((name) => {
        const m = object(total[name]);
        return [
          name,
          {
            covered: m.covered,
            total: m.total,
            pct: typeof m.pct === "number" ? m.pct : 0,
          },
        ];
      }),
    );
    for (const [raw, data] of Object.entries(object(d[app] ?? {}))) {
      const file = object(data),
        normalized = raw.replaceAll("\\", "/"),
        offset = normalized.lastIndexOf("/src/");
      const path =
        offset >= 0 ? app + normalized.slice(offset) : app + "/" + normalized;
      for (const [key, count] of Object.entries(object(file.s ?? {})))
        if (count === 0 && file.statementMap?.[key]?.start?.line)
          gaps.push(path + ":" + file.statementMap[key].start.line);
      for (const [key, counts] of Object.entries(object(file.b ?? {})))
        if (
          Array.isArray(counts) &&
          counts.some((x) => x === 0) &&
          file.branchMap?.[key]?.loc?.start?.line
        )
          gaps.push(path + ":" + file.branchMap[key].loc.start.line);
    }
  }
  result.gaps = [...new Set(gaps)].slice(0, 1000);
  return coverageSchema.parse(result);
}
export function compareCoverage(
  original: CoverageReport,
  candidate: CoverageReport,
  comparable: boolean,
  reason: string,
): CoverageComparison {
  const objectiveMet = apps.every((app) =>
    names.every(
      (k) =>
        candidate[app][k].total > 0 &&
        candidate[app][k].covered === candidate[app][k].total,
    ),
  );
  if (!comparable)
    return { status: "not-comparable", reason, deltas: null, objectiveMet };
  const deltas = Object.fromEntries(
    apps.map((app) => [
      app,
      Object.fromEntries(
        names.map((k) => [
          k,
          {
            covered: candidate[app][k].covered - original[app][k].covered,
            total: candidate[app][k].total - original[app][k].total,
            pctPoints: Number(
              (candidate[app][k].pct - original[app][k].pct).toFixed(2),
            ),
          },
        ]),
      ),
    ]),
  ) as CoverageComparison["deltas"];
  return { status: "comparable", reason, deltas, objectiveMet };
}
export function emptyCoverage(): CoverageReport {
  const empty = Object.fromEntries(
    names.map((n) => [n, { covered: 0, total: 0, pct: 0 }]),
  ) as Metrics;
  return {
    frontend: structuredClone(empty),
    backend: structuredClone(empty),
    gaps: [],
  };
}

export function coverageGoalMet(
  coverage: CoverageReport,
  target: { lines: number; branches: number },
): boolean {
  return apps.every((app) =>
    (["lines", "branches"] as const).every((name) => {
      const metric = coverage[app][name];
      return (
        metric.total > 0 &&
        metric.pct >= target[name] &&
        (100 * metric.covered) / metric.total >= target[name]
      );
    }),
  );
}
/** Test-only changes must preserve denominators and every measured metric. */
export function coverageDoesNotRegress(
  before: CoverageReport,
  after: CoverageReport,
): boolean {
  return apps.every((app) =>
    names.every((name) => {
      const a = before[app][name],
        b = after[app][name];
      return (
        a.total > 0 &&
        a.total === b.total &&
        b.covered >= a.covered &&
        b.pct >= a.pct
      );
    }),
  );
}
export function sameCoverageMeasurement(
  a: CoverageReport,
  b: CoverageReport,
): boolean {
  return apps.every((app) =>
    names.every(
      (name) => JSON.stringify(a[app][name]) === JSON.stringify(b[app][name]),
    ),
  );
}
export function coverageIncreased(
  before: CoverageReport,
  after: CoverageReport,
): boolean {
  return apps.some((app) =>
    names.some((name) => after[app][name].covered > before[app][name].covered),
  );
}
