# Passation : simplification avant la première release

Branche `simplify/kernel-dead-weight`, partie de `main` (`1ced18d3`). Ce
fichier est supprimé quand le programme est terminé.

## Mandat (utilisateur, 2026-10-08)

Avant toute nouvelle fonctionnalité : réduire la complexité inutile, rendre
l'écriture de plugins simple pour une communauté, et supprimer la corvée de
génération Typegen. Les API publiques peuvent changer avant la release, chacune
par un ADR validé par l'utilisateur (ADR-0288). Choix validés : programme dans
l'ordre de l'ADR-0288 ; Typegen sur deux voies ; privilèges en rapport dérivé.

## Preuves de l'audit

- Plugins : sondes dans `node_modules/.cache/plugin-probe/` (ignoré par Git).
  Quatre plugins typiques : 22 à 69 lignes et jusqu'à 12 identifiants
  obligatoires aujourd'hui ; 5 à 12 lignes sur la façade prototype
  `f-facade.ts` (214 lignes, API publique seulement, testée contre PostgreSQL).
  `GET /health` répond 401 sans en-tête d'application.
- Typegen : sondes dans `node_modules/.cache/typegen-probe/`. Cause : cycles
  d'inférence TS7022/TS7023 entre schémas qui se référencent. Piste nouvelle :
  relations en getters façon Zod 4 (`p3/g4n`, `p3/g10`, `p3/g11` : zéro
  génération, cycles exacts, `@ts-expect-error` effectifs) — sur une
  bibliothèque simulée, pas encore sur le vrai Core (`p8` échoue).
- Core : 1 118 exports dont 220 valeurs ; inventaire des exports sans
  consommateur par analyse des imports (script de session `core-imports.mjs`,
  reproductible : parser TypeScript sur tous les fichiers hors
  `packages/core`).

## État

- ADR-0288, 0289, 0290 rédigés au statut `proposed`, en attente de
  validation. Aucune modification de code.

## Prochaine action vérifiable

Après validation : passer les ADR en `accepted`, puis implémenter l'ADR-0289
(suppression) avec `yarn validate:full` et le DX audit contre `main`.
