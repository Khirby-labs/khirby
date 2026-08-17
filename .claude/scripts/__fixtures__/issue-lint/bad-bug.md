**Typ:** bug · **Tier:** S · **Obszary:** api

## Objaw i oczekiwane zachowanie

Logowanie czasem nie działa.

## Reprodukcja

Zaloguj się kilka razy i czasem wyskakuje błąd.

## Dowody

Widziałem.

## Podejrzana przyczyna

<!-- nie wiem, do ustalenia -->

## Obszar zmian (code map)

- `apps/api/src/core/auth/session.guard.ts` — poprawka
- `apps/api/src/core/auth/token-refresher.service.ts` — nowa logika odświeżania
- naprawić sesje

## Kryteria akceptacji

- [ ] logowanie działa poprawnie
- [ ] TODO dopisać reszte

## Przypadki brzegowe

- brak

## Pamięć repo

- nie sprawdzałem

## Plan testów

- jakieś testy

## Ryzyka i pytania otwarte

- brak

## Definicja ukończenia

- [ ] `pnpm verify` zielone, dowód wklejony w komentarzu
