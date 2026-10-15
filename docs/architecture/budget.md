# Budget per run

Rewizja 2026-10-14. Część [architektury](../architecture.md).

Config określa model i pricing source/date dla aktywnej roli, maxEstimatedUsd, allocationUsd per role, maxNativeCalls=3, timeoutRoleMs=1800000 (30 minut) i deadline run=14400000 ms (4 godziny); powiększone na czas prób na prośbę użytkownika 2026-10-15. Kwoty wybiera operator przed live execution, świadomie według swojego konta. Brak config/key/pricing aktywnej roli daje error przed paid call; reviewer disabled nie wymaga tych danych. Nie używamy ceny guessed lub ukrytej domyślnej paid konfiguracji.

admit(role) sprawdza deadline, current head i dostępny estimated budget. Rezerwuje allocation pod callId przed launch. Final usage może zastąpić estimate tylko jeśli ma wiarygodny format i znane pricing; unknown pozostawia rezerwację. Zakończone wywołanie ze zużyciem wyższym niż allocation nie jest zaniżane: raportujemy przekroczenie i blokujemy kolejne płatne wywołania.

CallRecord zawiera provider/model/role, estimate, usage/raw nullable, elapsed i status. Jeden final rekord per callId. Progress events nie są dodatkowymi charges. Cancellation, timeout lub brak usage nie oznacza 0 USD. Native total_cost_usd jest provider-reported estimate, nie faktura.

Host limits: liczba calls, stdin/stdout/patch bounds i czas. Claude max-budget-usd można zastosować jako dodatkowy native cap; Codex rollout budget jest eksperymentalny i nie służy jako obietnica strict cap. Oba wymagają conformance. Nie gwarantujemy braku opłat po sygnale abort ani globalnego atomic cap między workflow attempts.

Reviewer job otrzymuje istniejący ledger i sam dodaje najwyżej jeden call; publisher scala według unikalnych callId. Nie ma współbieżnych model calls w jednym runie, budget DB, nanoUSD, segments, billing buckets ani reconciliation service. Summary jawnie pokazuje unknown/overrun i źródło estymaty.
