# GitHub workflow i publikacja

Rewizja 2026-10-14. Część [architektury](../architecture.md).

Repo, PR, automatic PR workflow i wynik w PR są wymaganiami zadania. GitHub Actions jest naszą realizacją; nie jest wymagane wyłącznie lokalne środowisko ani osobny lokalny agent product. CLI providerów to wewnętrzne launchery jobs.

## Workflows

.github/workflows/ci.yml: pull_request, permissions contents:read, ordinary secret-free checks/precollection exact base/head obu aplikacji. .github/workflows/unit-test-agent.yml: workflow_run completed dla dokładnie wskazanego CI oraz workflow_dispatch(pr, task=coverage-gap). Privileged workflow działa wyłącznie na default branch; context.ref i github.sha/control revision muszą zostać potwierdzone przez API. Event PR number/SHA i artifacts są untrusted hints. Workflow nie używa pull_request_target do wykonywania PR code.

Po lookup przez API agent job zna open same-repo PR, captured base/head i trusted author. workflow_run musi odpowiadać expected workflow ID/event/repo/head/run attempt. Niejasna korelacja, merge conflict lub brak danych daje inconclusive. Fork/Dependabot/untrusted daje skipped bez sekretów. Default trustedAuthors=[] oraz brak explicit paid config nie uruchamiają modeli.

Jobs agent → verifier → publisher oraz optional reviewer pomiędzy verifier i publisher. Publisher uses always() do jawnego raportowania upstream failure; missing manifest nie zmienia się w passed. Model job instalacja/budowa tylko trusted agent package; PR source dane pobrane do bundle, nie wykonane. Verifier disposable runner bez provider/write secrets. Publisher wyłącznie trusted code + bounded parsers, z pull-requests:write i potrzebnym actions:read. contents:write niepotrzebne.

Wszystkie actions pinned do full commit SHA, runtimes/packages do exact versions/lock. persist-credentials:false; test jobs usuwają credential state przed wykonaniem source. Brak cache zależności/artefaktów z PR w privileged jobie. Model API env tylko wywołania, nie job-level, bez GH tokenu w child.

## Artefakty

Same-run immutable names zawierają executionRunId/executionAttempt i producer label. RunContext.trigger osobno wiąże upstream CI workflow/run/attempt albo dispatch. Trusted job przekazuje upload-artifact artifact-id przez named needs output; lookup tego ID pod expected run sprawdza repo/run/name/size/digest. workflow run API osobno potwierdza run_attempt. Artifact API nie dostarcza job/attempt; producerJob z payload jest tylko consistency label. Candidate package zawiera manifest, plan, structured role outputs, patch i sanitized ledger. Verification package: manifest, JSON/coverage i command logs. Review package: context/patch digest/result/call record. Publisher i verifier używają dokładnego artifact-id z named producer needs output, zweryfikowanego execution run/attempt oraz transfer digests; poprawna nazwa lub deklaracja payload nie zastępuje tego powiązania.

Transfer używa dokładnie jednego payload.json per job (do 4 MiB). Czytnik ZIP przyjmuje tylko ten entry, ogranicza bytes przed parsing i odczytuje w pamięci; nie rozpakowuje ścieżek do filesystemu. Większe raw logs/reports są osobnymi linkami dowodów, bez parsera w publisherze. Upstream PR CI artifacts pozostają untrusted evidence, parsowane jako dane. Base/head/context ustala API; manifest nie może tego nadpisać. Received assignment, .git, .env i native config nie trafiają do bundle/artifacts. PR instrukcje AGENTS/CLAUDE/skills nie są authority.

## Komentarz i wyścigi

Przed każdym paid call oraz publication recheck open/current head. Per-PR concurrency/serialization; cancelled older run nie zastępuje nowszego. Publisher tworzy/aktualizuje tylko własny komentarz ze stable marker, sprawdza autora i run order. Obcy marker nie jest przejmowany. Tested pełny SHA + immutable run link pozostają widoczne, bo API check i comment update nie są atomic.

Template: decision/reason, cases i skillsUsed, candidate patch link, wykonane checks/statuses/commands, coverage covered/total four metrics obu apps, comparable delta albo reason, objective 100%, remaining gaps, optional check status i koszt z provenance/unknown. Model text escapowany jako plain text, bez arbitrary HTML/image/link rendering. Duże logs nie trafiają do komentarza ani automatycznie do promptów. Brak fake green/runtime-completed=accepted.

Patch jest propozycją w PR, bez bot push. Użytkownik może go zastosować do branch; zwykły kolejny PR run sprawdzi nowy head. Po user review bootstrap controller/workflows musi znaleźć się na default branch. Initial missing-tests run używa następnie workflow_dispatch na osobnym otwartym missing-tests PR. Manual path ma mandatory secret-free precollect dependency; brak/failed/cancelled/stale payload blokuje paid calls i trafia do always publisher. Ordinary CI uploaduje failure evidence przez if:always(), ale missing evidence nie daje pass. Feature PR demo ma pokazać analysis→add/update→run→comment na GitHubie. Publikacja workflow/setup PR wymaga wcześniejszego przejrzenia gotowego wyniku przez użytkownika.

Źródła kontraktu API: artifact object wiąże ID/name/bytes/digest z workflow run; run_attempt pochodzi z osobnego workflow run response, bez pola producer job w artifact. [Artifacts REST API](https://docs.github.com/en/rest/actions/artifacts), [Workflow runs REST API](https://docs.github.com/en/rest/actions/workflow-runs).