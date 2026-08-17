**Typ:** feature · **Tier:** M · **Obszary:** api, web

## Kontekst

Handlowcy proszą o listę kontaktów w arkuszu, żeby przygotować obdzwonkę poza CRM-em. Dziś kopiują wiersze z tabeli po 25 na stronę, co przy kilkuset kontaktach zajmuje kwadrans i gubi część pól. Bez tego zostaje kopiowanie ręczne, więc dane i tak wyciekają do prywatnych arkuszy — tylko w gorszej jakości.

## Zakres

W zakresie:
- eksport aktualnie przefiltrowanej listy kontaktów do CSV (te same filtry co widok)
- kolumny: imię, nazwisko, e-mail, telefon, firma, właściciel, data utworzenia

Poza zakresem:
- eksport leadów i firm (osobne zadania, jeśli się potwierdzi potrzeba)
- harmonogram eksportów i wysyłka mailem
- XLSX — CSV wystarcza do wklejenia w arkusz

## Obszar zmian (code map)

- `apps/api/src/modules/contacts/contacts.controller.ts` — nowy endpoint `GET /api/contacts/export`, ten sam guard i uprawnienie co lista
- `apps/api/src/modules/contacts/contacts.service.ts` — serializacja do CSV, reużycie istniejącego budowania filtrów
- `apps/api/src/modules/contacts/contacts.service.spec.ts` — testy serializacji i eskapowania
- `apps/web/src/views/contacts` (nowy plik: brak — zmiana w widoku listy) — przycisk eksportu w pasku akcji
- `apps/web/src/i18n/messages/pl/contacts.json` — etykieta przycisku i komunikat błędu (pl)
- `apps/web/src/i18n/messages/en/contacts.json` — te same klucze (en)

## Kryteria akceptacji

- [ ] `GET /api/contacts/export` zwraca 200 z nagłówkiem `Content-Type: text/csv` i pierwszym wierszem nagłówków kolumn
- [ ] eksport respektuje filtry z zapytania — dla filtra bez wyników plik zawiera wyłącznie wiersz nagłówków
- [ ] wartość zawierająca przecinek, cudzysłów albo znak nowej linii jest poprawnie ocytowana i wczytuje się w arkuszu jako jedna komórka (test w `contacts.service.spec.ts` zielony)
- [ ] bez uprawnienia `contacts:read` endpoint zwraca 403
- [ ] przycisk eksportu ma klucze i18n w pl i en, `pnpm lint:i18n` zielone

## Przypadki brzegowe

- pusta lista po filtrach → plik z samym nagłówkiem, nie 404
- wygaśnięcie sesji w trakcie pobierania → 401 i komunikat, nie pusty plik
- kontakt bez telefonu/firmy → pusta komórka, nie „null"
- bardzo duża lista → strumieniowanie odpowiedzi zamiast budowania całości w pamięci

## Pamięć repo

- `docs/adr/README.md` — sprawdzone 0001–0031: nic o eksportach; brak decyzji, którą to naruszałoby
- `.claude/rules/i18n.md` — każdy widoczny napis przez `t()`, pl i en pisane natywnie
- `docs/journal/INCIDENTS.md` — brak wpisu o eksportach

## Plan testów

- `apps/api/src/modules/contacts/contacts.service.spec.ts` — eskapowanie, pusta lista, mapowanie kolumn
- weryfikacja ręczna: pobrany plik otwarty w arkuszu (tego test nie łapie)
- `pnpm verify` w całości

## Ryzyka i pytania otwarte

- separator: przecinek czy średnik? Excel w polskiej lokalizacji domyślnie rozdziela średnikami — do potwierdzenia z handlowcami
- czy eksport ma trafiać do logu audytowego (kto i kiedy wyniósł dane)

## Definicja ukończenia

- [ ] `pnpm verify` zielone, dowód wklejony w komentarzu
- [ ] wszystkie kryteria akceptacji odhaczone realnym przebiegiem
