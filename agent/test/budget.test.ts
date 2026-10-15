import { expect, it } from "vitest";
import { Budget } from "../src/budget.js";
import { activePolicy, completedNative } from "./support.js";
it("keeps unknown reservation instead of allowing another paid call", () => {
  const policy = activePolicy();
  policy.maxEstimatedUsd = 1;
  const b = new Budget(policy, Date.now() + 10000);
  b.reserve("c1", "analyst", Date.now());
  b.finish("c1", { ...completedNative(), usage: null, status: "unknown" }, 10);
  expect(b.records()[0]?.usage).toBeNull();
  expect(() => b.reserve("c2", "writer", Date.now())).toThrow(/budget/);
  expect(() => b.finish("c1", completedNative(), 10)).toThrow(/final/);
});
it("accounts for overrun and inherited deadline without resetting budget", () => {
  const p = activePolicy();
  p.maxEstimatedUsd = 2;
  const deadline = Date.now() + 10000;
  const b = new Budget(p, deadline);
  b.reserve("c1", "analyst", Date.now());
  b.finish("c1", completedNative(2.5), 5);
  expect(() => b.reserve("c2", "writer", Date.now())).toThrow(/budget/);
  expect(() =>
    new Budget(p, Date.now() - 1).reserve("x", "analyst", Date.now()),
  ).toThrow(/deadline/);
  const inherited = new Budget(p, deadline, b.records());
  expect(() => inherited.reserve("r", "reviewer", Date.now())).toThrow(
    /budget/,
  );
});
it("releases known excess reservation but counts every host call", () => {
  const b = new Budget(activePolicy(), Date.now() + 10000);
  for (let i = 0; i < 3; i++) {
    b.reserve("c" + i, "analyst", Date.now());
    b.finish("c" + i, completedNative(0.1), 5);
  }
  expect(() => b.reserve("c4", "analyst", Date.now())).toThrow(/call/);
});
