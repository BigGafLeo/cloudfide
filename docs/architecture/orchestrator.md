# Orchestrator

Rewizja 2026-10-14. Część [architektury](../architecture.md).

runAgent(context, bundle, config, adapters, signal) wykonuje: validate input/trust → analyst admission → analyst → plan validation → writer admission → writer → host materialization/freeze candidate. Zwraca CandidateManifest i patch. Brak krytycznego context, dispute albo invalid role output kończy fazę z reason, bez retry/replan/repair.

AnalysisBundle jest immutable wejściem: captured base/head diff, normalizowane wyniki narzędzi, inventory i potrzebne production source/existing tests. Selection zaczyna od changed unit, powiązanych istniejących testów i one-hop static imports widocznych w pliku; coverage-gap bierze top uncovered locations obu raportów. Bez grafu zależności lub ogólnego rankera. Host wybiera materiały frontend/backend aktualnej roli. Bounded bundle ma 200 KiB. Critical file za duży lub niejednoznaczna zmiana bez potrzebnej dependency/contract daje missingCritical i inconclusive, nie niewidoczne obcięcie. Nie tworzymy RPC queries, pagination, fingerprint cache lub reuse.

Plan ma najwyżej 20 przypadków i 20 candidate files. Host sprawdza expected/requirementSource, confidence i allowlist; writer może tylko realizować ten plan albo zgłosić dispute. Merytorycznej poprawności oracle nie dowodzi walidacja schema. Reviewer oraz kontrolowane regresje zwiększają jakość dowodu, ale nie zastępują prawdziwego kontraktu.

Role metadata (ID/purpose/schema) i SKILL.md wczytuje trusted loader z control checkout. SKILL.md jest jedynym źródłem procedury roli; nie powstaje drugi prompt w roles/*.md. Procedures są oddzielne, reference wybierany według role/app/check. SKILL.md z PR nie jest odkrywany. skillsUsed opisuje faktycznie dołączone materiały; fixture test wykazuje, że backend-unit request nie ładuje frontend/mutation/other-role instructions.

Każdy dispatch dostaje nowy callId i świeże empty HOME/cwd, tylko credential wybranego providera i niezbędne runtime env. GitHub API recheck wykonuje host przed każdym call. Nie ma host retry, resume ani fallback. Maksymalnie dwa core calls oraz jeden optional reviewer w jego jobie. Budget i native output są częścią manifestu.

Verifier i reviewer nie mutują planu/candidate. Publisher oblicza final decyzję na zwalidowanych wynikach, bez własnego modela. No-change/inconclusive/skipped może przejść bez candidate verifiera do publish. Missing artefact/job failure raportowany jest jako niekompletny run; nigdy synthetic passes.