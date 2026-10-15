# Weryfikacja unit testów

Rewizja 2026-10-14. Część [architektury](../architecture.md).

Host materializuje WriterResult.files w disposable kopii captured head. Waliduje UTF-8/text, rozmiary, path canonicalization i lstat każdego ancestor; bez symlink/hardlink/submodule, absolute/drive/UNC/traversal, mode/deletion/binary zmian. Generuje własny unified patch i sprawdza final changed files niezależnie od deklaracji autora.

Allowlist: backend/tests/**/\*.test.ts, backend/tests/fixtures/**, frontend/src/**/\*.test.ts i .test.tsx, frontend/src/test/fixtures/** i istniejący frontend/src/test/todoFixture.ts. frontend/src/test/setup.ts, production source, package/lock/config/workflows/instructions nie są editable. Source snapshot zawiera application fixtures/config potrzebne do wykonania; usuwamy sekrety i native instruction discovery, nie wymagane test setup.

Secret-free verifier w nowym GitHub-hosted Linux runnerze sprawdza digest/context oraz niezależnie ten sam wąski validateCandidatePatch przed apply/commands. Przygotowuje exact head, stosuje patch bez fuzzy matching i sprawdza actual changed paths/modes/links względem manifest.files i allowlist, także dla valid-digest forged candidate. npm ci --ignore-scripts --no-audit --no-fund obu aplikacji; backend db:generate jako jawna komenda w tym jobie. Nie używa model keys/write token/production DB. GitHub read token nie jest pozostawiony w checkout credential helper. Pełne unit/typecheck/coverage obu aplikacji to required checks.

Jeden normalizer coverage jest wspólny dla precollection i candidate verifiera; raw JSON pozostaje bounded artefaktem. Normalizacja dotyczy przypiętego Vitest 4.1.11. Trusted commands requestują Vitest JSON, mapped detailed coverage JSON i json-summary; output names i schema sprawdzane na fixture. Summary daje covered/total lines, branches, statements/functions, detailed file gives uncovered locations. Coverage output nie jest samodzielnym dowodem semantycznym.

Base health, original head i candidate head mają oddzielne logs/artifacts. Base/head CI może być czerwone z powodu celowej zmiany kontraktu. Candidate required checks nadal muszą przejść. Coverage delta jest liczone tylko przy porównywalnym scope/config/environment; otherwise not-comparable z reason i osobne liczby. Existing thresholds/exclusions pozostają, 100% all metrics jest objective. Pozostałe gaps mają jawny reason; partial accepted nie oznacza objectiveMet=true.

Default mutation/reviewer disabled; deep advisory lub jawny required. Required non-passed blokuje accepted. Reviewer zwraca claims/evidence bez confirmed. Host wiąże confirmation wyłącznie z istniejącymi facts zwalidowanego verifiera (kind/location/factId). Nie potwierdza arbitralnego oracle claim samym cytatem lub confidence modela. Advisory unconfirmed jest widoczny/nonblocking; required unconfirmed material daje inconclusive; host-confirmed material daje failed. Brak fact to brak confirmation, bez dodatkowego automatycznego joba.

Stryker integration po core: compatibility pilot Node/Vitest/TSX na obu aplikacjach, ograniczony scope, secret-free osobna kopia, bounded czas/report, source before/after digest. Nie stosujemy git checkout do przywracania użytkownikowi plików. Mutant timeout oznaczamy osobno; compile/setup/tool error to error/inconclusive, nie killed. Raport pokazuje survived locations i brak formalnego dowodu oracle.

Small negative controls: dobry test przechodzi poprawną jednostkę, asercja wykrywa konkretną błędną jednostkę, weak assertion nie dostaje rekomendacji accepted i infra failure nie jest semantycznym wykryciem. Brak pełnego benchmarku/statystyki modeli.

## Granica wykonania po review implementacji

Precollection, zwykłe CI i verifier uruchamiają każdą komendę aplikacji w kontenerze Node 24.13.1 przypiętym do digestu. Kontener ma własną przestrzeń PID, zwykły UID, odebrane capabilities, no-new-privileges, read-only root filesystem i limity CPU/pamięci/PID. Montowany jest tylko disposable katalog danej aplikacji; przy mutacjach dodatkowo read-only, zaufany mutation-runtime. Nie montujemy katalogu kontrolera, jego output, poświadczeń ani Docker socket. Sieć jest dostępna tylko podczas instalacji i jawnego Prisma generate; pozostałe kontrole mają network=none. Brak Dockera lub obrazu kończy kontrolę błędem, bez fallbacku do hosta.

Trusted controller przechwytuje stdout/stderr poza katalogiem aplikacji i usuwa kontener przed odczytem raportów, także po timeout/cancellation. JSON coverage/unit/mutation odczytuje wyłącznie jako bounded regular file, odrzucając symlinki i hardlinki. Logi precollection są kopiowane do base-evidence/head-evidence przed usunięciem scratch. Stryker sprawdza source digest po wykonaniu; zmiana źródła blokuje wynik i nie uruchamia automatycznego zapisu przywracającego na potencjalnie zmienionej ścieżce. Jego 30-minutowy limit (powiększony na czas prób 2026-10-15) obejmuje cały ograniczony scope, nie każdy plik osobno.
