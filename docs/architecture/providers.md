# Provider adapters i native runtime

Rewizja 2026-10-14. Część [architektury](../architecture.md).

Implementujemy dwa ProviderAdapter: Codex i Claude. Trusted Map<string, ProviderAdapter> umożliwia dopięcie kolejnego; nie ma zamkniętego enum producentów ani dynamicznego importu z PR. Wybór provider/model per role pochodzi z control config. Nieaktywny reviewer nie wymaga key/model.

Jeden CLI launcher per provider na GitHub runnerze, bez równoległych SDK/provider Actions. Kandydaci do pinów to @openai/codex 0.162.1 oraz @anthropic-ai/claude-code 2.1.299; podczas instalacji sprawdzamy wersję, package-lock i aktualne flags. Runtime nie dziedziczy osłon oficjalnego Action wrappera. Przed paid production dispatch wymagane są Linux conformance probes i fixture normalization.

Model nie dostaje checkoutu PR. Dostaje bounded dane przez stdin, trusted rolę/skill i JSON schema. Writer także nie edytuje filesystemu; po native completion host tworzy allowlisted files. Nie wykonujemy analizowanej aplikacji, npm, testów ani git hooków w procesie modela.

Codex: fresh HOME/CODEX_HOME, ephemeral, ignore user config/rules, empty cwd poza repo, never approval, read-only sandbox, shell_tool=false, web_search=disabled, brak MCP/plugins/connectors i no PR instruction discovery. Odrzucamy jakikolwiek event wykonania polecenia/edycji. Sam read-only sandbox nie wystarcza. Claude: fresh HOME/CLAUDE_CONFIG_DIR, safe-mode/restricted, tools="", strict empty MCP, no customization/slash discovery/persistence, schema output i wybrane poświadczenie wyłącznie w wywołaniu. allowedTools nie jest granicą toolset.

Conformance musi wykazać: malicious instruction file/settings/hook nie uruchamia sentinel; próba modela wykonania command/edit/read-secret nie ma narzędzi i nie zmienia sentinel; stdout/schema i final usage parsowane w sposób jednoznaczny; limit czasu/outputu zatrzymuje proces tree, nie tylko obietnicę hosta. Unknown capability blokuje launcher. Jeden mały live probe per provider jest warunkiem dowodu, fixture process alone potwierdza tylko host wrapper.

spawn(binary, argv, {shell:false, cwd:cleanRoot, env:allowlistedEnv}) używa stdin i process group na Linux. Abort kończy group TERM, następnie KILL po krótkim grace i waits for exit. Credentials nie trafiają do argv/logów/artifacts. Native text ograniczamy przed parsing. Malformed/duplicate final result, native error lub brak required output nie daje completed candidate.

Usage bierzemy raz z final event danej fresh session. Jeśli provider raportuje cumulative total i szczegóły modeli, używamy jednego źródła total, nie sumy z obu. Raw usage pozostaje dowodem; normalization nie wymyśla ceny, cache czy billing.

Źródła interfejsów: [Codex noninteractive](https://developers.openai.com/codex/noninteractive/), [Codex config](https://developers.openai.com/codex/config-reference/), [Claude CLI](https://code.claude.com/docs/en/cli-reference). Dokumentacja pomaga dobrać flags; nie zastępuje conformance przypiętej wersji.

## Rewizja uwierzytelniania po preferencji użytkownika

Domyślnie używamy natywnej subskrypcji; auth=api wymaga jawnego wyboru i nigdy nie jest fallbackiem. Claude korzysta z oficjalnego setup-token i CLAUDE_CODE_OAUTH_TOKEN; bare jest niedozwolone w tym trybie, więc profil używa safe-mode oraz restricted. Codex używa osobnego CODEX_SUBSCRIPTION_HOME na prywatnym persistent Linux runnerze, z blokadą jednego strumienia oraz zapisaniem odświeżonego auth.json. Nie kopiujemy sesji desktopa ani nie odnawiamy OAuth własnym HTTP. Posiadanie klucza API nie jest zgodą na jego użycie. Rezerwacja USD przy subskrypcji jest tylko konserwatywną jednostką admitowania pracy; nie udaje rachunku API.

## Konfiguracja demonstracji i ograniczenie publicznego CI (2026-10-15)

Profil właściciela dopuszcza wyłącznie BigGafLeo: Claude subscription, claude-sonnet-5-5 dla analityka i autora; claude-opus-5-5 dla wymaganego końcowego reviewera. Mutacje również są wyłączone. Każda rola ma 1 umowny USD rezerwacji, coverage-gap run maksymalnie 17; to jednostki admission, nie cena ani miernik subskrypcji. Standard wykonuje maksymalnie dwa wywołania, bez automatycznych ponowień i zmiany modelu. Lokalne conformance dla Claude Sonnet i Codex przeszło; pierwszy required Opus review rzeczywistej propozycji zakończył się blokadą utraty oryginalnych asercji (run38821579466). To pojedyncza obserwacja, bez benchmarku jakości ról. Aktualne dowody opisuje [validation.md](../validation.md).

Przed wyborem runnera oraz w fazach agent/review controller sprawdza aktywne role. Codex subscription wymaga odczytanego z GitHub API zgodnego ID repozytorium oraz private=true; publiczne/nieznane repozytorium jest blokowane. Self-hosted nie stanowi wyjątku. Podstawą jest [oficjalna instrukcja Codex CI](https://learn.chatgpt.com/docs/auth/ci-cd-auth), wykluczająca publiczne/open-source repozytoria w tym trybie. Lokalny ręczny probe nie jest ścieżką GitHub CI. Dla publicznego workflow bez API stosujemy [oficjalny tryb Claude setup-token](https://code.claude.com/docs/en/authentication#generate-a-long-lived-token). Żadne poświadczenie ani aktywacja GitHub nie powstały w kroku konfiguracji.

## Zgodność formatu JSON Schema (2026-10-15)

Oba generatory schematów wyjściowych (role i native probe) jawnie używają Zod target=draft-07 jako wspólnego formatu wymiany. Domyślny Draft2020-12 jest odrzucany przez przypięte ClaudeCLI2.1.299 przed requestem modelowym. Nie usuwamy samego pola $schema: generator emituje właściwy dialekt. Strict host Zod parsowanie wyników i dodatkowe refinements pozostają obowiązujące. Rzeczywista lokalna walidacja czterech schematów została sprawdzona offline na przypiętym CLI. Później autoryzowane lokalne conformance obu providerów przeszło; szczegóły i nadal niezweryfikowany zakres pełnych ról opisuje [validation.md](../validation.md).

## Potwierdzony profil Codex i odbiór wyniku (2026-10-15)

Rzeczywista próba ujawniła, że wpis gpt-6.1-sol w przypiętym katalogu wymusza tool_mode=code_mode_only; model-owned tryb ma pierwszeństwo przed odpowiednimi feature flags. Adapter odczytuje więc katalog przez debug models --bundled, bez poświadczeń, przed utworzeniem fixture i lease. Limit lokalnego katalogu wynosi 1 MiB, timeout odczytu maksymalnie 5 sekund. Wymagamy dokładnie jednego wpisu zgodnego z wybranym modelem; brak lub duplikat blokuje request, bez fallbacku i bez pobrania katalogu z PR lub sieci.

Przez udokumentowane model_catalog_json przekazujemy jednowpisowy katalog zachowujący pozostałe metadane przypiętego modelu, z końcowymi ograniczeniami: direct tool mode, disabled shell, brak apply_patch, puste experimental_supported_tools, wyłączone tool search i Node REPL. Dodatkowe feature flags wyłączają Code Mode, cele, sleep, sugerowanie narzędzi, obrazowanie, hooks i skill search. project_doc_max_bytes=0 wyłącza ładowanie AGENTS.md; samo ignore-rules dotyczy reguł execpolicy, nie dokumentów projektu. Oficjalny binary i jego zarządzanie auth nie są modyfikowane. Nowy model spoza katalogu wymaga aktualizacji pinów i ponownego conformance.

Codex zapisuje wynik przez --output-last-message do stałej ścieżki w prywatnym scratch. Host używa istniejącego bounded regular-file/no-link readera, a następnie wymaga zgodności z ostatnim agent_message i dokładnie jednego terminalnego turn.completed. Komentarze poprzedzające wynik są dozwolone; każde zdarzenie narzędzia, nieznany protokół, rozbieżność pliku lub zdarzenia po zakończeniu są odrzucane. Hash profilu Codex obejmuje ograniczenia katalogu i wersję kontraktu final artifact; hash Claude nie zmienił się.

Jedno rzeczywiste poprawione conformance przez dedykowaną subskrypcję ChatGPT, z requested model gpt-6.1-sol, przeszło na Linux Node24.13.1 / Codex0.162.1. Dowód Codex scalono z wcześniej potwierdzonym Claude2.1.299 w agent/provider-conformance.json; obie normalne bramki aktywacji sprawdzono offline. To dowód zgodności runtime, nie jakości analityka/autora ani pełnego workflow GitHub. Dziewięć nowych regresji, pełne testy Windows82pass2skip/Linux83pass1skip, typecheck/build/format i niezależny przegląd zakończyły się poprawnie. Publiczne CI nadal stosuje wcześniejsze ograniczenie Codex subscription.
