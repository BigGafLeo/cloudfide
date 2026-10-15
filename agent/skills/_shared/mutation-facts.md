# Mutation facts

Mutation score is bounded evidence about selected operators and source paths, not proof of requirements or oracle correctness. Killed means a recognized test failure; timeout is a separate status. Compile/setup/tool failure is infrastructure error. Survived mutants need semantic investigation; equivalent/unreachable changes must not produce forced meaningless tests. Use a disposable copy and preserve original source. Cross-provider review reduces shared reasoning but is not formal independence.
