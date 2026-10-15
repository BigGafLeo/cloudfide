import type {
  AnalysisBundle,
  FileData,
  TestPlan,
  WriterResult,
} from "./contracts.js";
import { validatePatchPath } from "./paths.js";

/** Repository-relative source path, optionally followed by :line[:column]. */
export function sourcePath(sourceLocation: string): string {
  return sourceLocation.replace(/:\d+(?::\d+)?$/, "");
}
function assertTestPath(path: string): void {
  validatePatchPath(path);
  if (!/\.test\.tsx?$/.test(path))
    throw new Error("value target/reference must be a unit test path");
}
/** Mechanical evidence admission only; roles judge regression value and test names. */
export function validateValuePlan(
  plan: TestPlan,
  bundle: AnalysisBundle,
  availableFiles: FileData[] = bundle.files,
): void {
  for (const path of plan.paths) validatePatchPath(path);
  const paths = new Set(plan.paths);
  const supplied = new Set(bundle.files.map((f) => f.path));
  const existingPaths = new Set(availableFiles.map((f) => f.path));
  for (const path of plan.paths)
    if (existingPaths.has(path) && !supplied.has(path))
      throw new Error(
        "existing output is absent from supplied context: " + path,
      );
  for (const c of plan.cases) {
    const value = c.value;
    assertTestPath(value.testPath);
    if (!paths.has(value.testPath))
      throw new Error(
        "value target is outside allowed plan paths: " + value.testPath,
      );
    const source = sourcePath(c.sourceLocation);
    if (
      !/^(?:backend|frontend)\/src\//.test(source) ||
      !supplied.has(source) ||
      /\.test\.tsx?$/.test(source)
    )
      throw new Error(
        "planned unit source is absent from supplied context: " + source,
      );
    for (const existing of value.existingTests) {
      assertTestPath(existing.path);
      if (!supplied.has(existing.path))
        throw new Error(
          "existing test evidence is absent from supplied context: " +
            existing.path,
        );
    }
    if (
      (value.action === "strengthen" || existingPaths.has(value.testPath)) &&
      !value.existingTests.some((test) => test.path === value.testPath)
    )
      throw new Error(
        "existing/strengthen target requires a compared test in its target: " +
          value.testPath,
      );
  }
}
export function validateWriterTargets(
  plan: TestPlan,
  writer: WriterResult,
): void {
  const written = new Set(writer.files.map((file) => file.path));
  for (const c of plan.cases)
    if (!written.has(c.value.testPath))
      throw new Error(
        "writer omitted planned test target: " + c.value.testPath,
      );
}
