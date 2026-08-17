**Typ:** bug · **Tier:** S · **Obszary:** tooling (warstwa agentowa)

## Objaw i oczekiwane zachowanie

`tier-guard.mjs` wymusza tier L dla zmian w `.gitlab-ci.yml`, ale ten plik został usunięty z repo (commit `e92212e`). Pipeline'y żyją w `.github/workflows/`, których guard nie zna, więc zmiana w konfiguracji CI przechodzi jako tier S bez audytu i panelu.

Oczekiwane: zmiana w dowolnym pliku `.github/workflows/**` wymusza podniesienie tieru do L.

## Reprodukcja

1. `printf 'name: repro\n' > .github/workflows/_repro.yml`
2. `node .claude/scripts/tier-guard.mjs --tier S`
3. Obserwowane: exit 0 i komunikat, że tier się trzyma
4. `rm .github/workflows/_repro.yml`

## Dowody

```
$ node .claude/scripts/tier-guard.mjs --tier S
[tier-guard] tier S holds (0 code files, 0 sensitive hits).
exit=0
```

## Podejrzana przyczyna

`.claude/scripts/lib/sensitive.mjs` — tablica `SENSITIVE` zawiera wpis `/^\.gitlab-ci\.yml$/` i nie ma odpowiednika dla `.github/workflows/`.

## Obszar zmian (code map)

- `.claude/scripts/lib/sensitive.mjs` — podmiana wpisu w tablicy `SENSITIVE`

## Kryteria akceptacji

- [ ] zmiana w `.github/workflows/ci.yml` przy `--tier S` kończy się exitem 1 i komunikatem `RAISE TO L`
- [ ] `.gitlab-ci.yml` nie występuje już w `SENSITIVE`
- [ ] ta sama zmiana przy `--tier L` kończy się exitem 0
- [ ] plik poza `workflows/` nie wymusza L

## Przypadki brzegowe

- `.github/` zawiera też rzeczy niewrażliwe (szablony issue, dependabot) — wzorzec musi celować w `workflows/`
- istniejące wpisy (`core/auth`, `schema.ts`, `roles`, `docker/`) muszą działać dalej

## Pamięć repo

- `docs/adr/` — sprawdzone 0001–0031: lista wrażliwych ścieżek nie była decyzją architektoniczną
- `docs/journal/INCIDENTS.md` — brak wpisu o tej pułapce

## Plan testów

- Skrypty w `.claude/scripts/` nie mają suity Jest; weryfikacja fixture'ami: sekwencja z „Reprodukcja" przed i po zmianie
- `pnpm verify` musi zostać zielone

## Ryzyka i pytania otwarte

- Czy wzorzec ma obejmować `.github/actions/` (composite actions) — dziś nie istnieją w repo

## Definicja ukończenia

- [ ] `pnpm verify` zielone, dowód wklejony w komentarzu
- [ ] wszystkie kryteria akceptacji odhaczone realnym przebiegiem
