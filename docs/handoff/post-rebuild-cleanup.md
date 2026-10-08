# Passation : nettoyage après la reconstruction

Branche `cleanup/post-rebuild`, partie de `main` (`15834e81`). Ce fichier est
supprimé quand le travail est fusionné dans `main`.

## Mandat

Le projet a été écrit avec ChatGPT Codex, puis reconstruit package par package
avec Claude. Objectif : repartir de bases saines en supprimant ce qui ne sert
plus et en simplifiant l'interne, **sans changer la DX** (exports, types,
inférence, hovers, complétions, diagnostics, comportements, erreurs), sauf
accord explicite de l'utilisateur. Le projet n'est pas publié.

Décisions de l'utilisateur (2026-10-08) :

- historique Codex : tag Git puis suppression de l'arbre actif ;
- code : nettoyage sûr puis refactors internes, prouvés par `yarn validate:full`
  et le DX audit ;
- release : supprimer les 166 changesets ; la PR GitHub #1 « Release packages »
  devient obsolète, l'utilisateur la fermera (aucune action GitHub sans
  confirmation) ;
- hors nettoyage : limite de taille du corps des routes cookie de
  password-auth et vraies contraintes Yarn maintenant ; versions `'0.0.0'` en
  dur avant la première publication (noté dans `ROADMAP.md`).

## Référence de comparaison

- Worktree `../ultimadatabase-baseline` détaché sur `main` (`15834e81`),
  installé et construit : racine `<baselineRoot>` du DX audit.
- Tags locaux, non poussés : `reference-archive` (`0ae7767`) et
  `rebuild-archive` (`15834e81`).

## Phases

1. Archive et documentation de travail : changesets, `issues/`, `docs/plans/`,
   `CURRENT_PLAN.md`, `HISTORIQUE_SUPPRESSIONS.md`, `tooling/issues`,
   `REBUILD*.md`, `docs/rebuild/` sauf `DIFFERENCES.md`, apps vides, notes du
   site ; `ROADMAP.md` court ; site re-pointé ; `AGENTS.md`, `CLAUDE.md`,
   `CONTRIBUTING.md` réécrits ; `dx-audit` déplacé dans `tooling/dx-audit`.
2. Nettoyage sûr du code et de la configuration (dépendances inutilisées,
   exports morts, petites duplications, `test:pack:built`, tsconfig).
3. Contraintes Yarn réelles (`yarn.config.cjs`).
4. Limite de taille du corps des routes cookie de password-auth.
5. Refactors internes de Core, par petites étapes.

## État

- Phase 1 : en cours.

## Pistes notées pour plus tard

- Course du module-runner Vitest dans `loadMinimalExample`
  (`tests/e2e/rest-public-vertical-support.ts`) et `testTimeout` explicite du
  projet postgres-e2e : corrigeables maintenant que les tests publics ne sont
  plus un oracle figé (changement de test uniquement).
